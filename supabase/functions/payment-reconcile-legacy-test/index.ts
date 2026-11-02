import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getRequiredEnv, makeServiceClient } from '../_shared/paymongo.ts';
import { sha256 } from '../_shared/paymentSignature.ts';
import { readPrivateUpload } from '../_shared/privateUpload.ts';
import { recordedPaymentMode, classifyLegacySession, legacyReconciliationSnapshot } from '../_shared/legacyPaymentInspection.ts';

// Explicit operator action, never invoked by a customer or by the scheduler.
// All provider requests require a test key and a verified matching test session.
Deno.serve(async(request: Request)=>{
  const headers={...corsHeaders,'Cache-Control':'no-store'};
  const reply=(body:unknown,status=200)=>{const response=jsonResponse(body,status);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response;};
  if(request.method==='OPTIONS')return new Response('ok',{headers});
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  try{
    const token=getRequiredEnv('PAYMENT_WORKER_TOKEN');
    if(token.length<32 || await sha256(request.headers.get('authorization') ?? '')!==await sha256(`Bearer ${token}`))return reply({error:'Operator authentication required.'},401);
    const key=getRequiredEnv('PAYMONGO_SECRET_KEY');
    if(!/^sk_test_[A-Za-z0-9_]+$/.test(key))return reply({error:'Test mode required.'},503);
    let input;
    try{input=JSON.parse(new TextDecoder().decode(await readPrivateUpload(request,5000,1024)));}catch{return reply({error:'Invalid reconciliation request.'},400);}
    if(!input || !['reconcile-terminal','retire-unused'].includes(input.action)
      || Object.keys(input).some(k=>!['action','after'].includes(k))
      || (input.after!==undefined && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.after)))return reply({error:'Invalid reconciliation request.'},400);
    const client=makeServiceClient(15000);
    let query=client.from('reservation_payments').select('id,reservation_id,provider_checkout_session_id,amount,currency,status,raw_payload,checkout_request,attempt_state')
      .eq('status','pending').eq('attempt_state','reconciliation_required');
    if(input.after)query=query.gt('id',input.after);
    const result=await query.order('id',{ascending:true}).limit(6);
    if(result.error || !Array.isArray(result.data))return reply({error:'Reconciliation lookup unavailable.'},503);
    const counts={paidRecorded:0,expiredRecorded:0,openUnchanged:0,skipped:0,failed:0};
    const batch=result.data.slice(0,5);
    async function provider(id:string,expire=false){
      const response=await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(id)}${expire?'/expire':''}`,{
        method:expire?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{Authorization:`Basic ${btoa(`${key}:`)}`,Accept:'application/json',...(expire?{'Content-Type':'application/json'}:{})},
        ...(expire?{body:'{}'}:{}),
      });
      if(!response.ok){await response.body?.cancel();throw new Error('Provider unavailable.');}
      if(expire){await response.body?.cancel();return null;}
      return (await response.json())?.data;
    }
    for(const row of batch){
      if(recordedPaymentMode(row)!==false || row.checkout_request!=null || !/^cs_[A-Za-z0-9_]+$/.test(row.provider_checkout_session_id ?? '')){counts.skipped++;continue;}
      try{
        let session=await provider(row.provider_checkout_session_id);
        let state=classifyLegacySession(row,session);
        if(state==='unpaidOpen' && input.action==='retire-unused'){
          // An expiry may race a payment or time out after success. Retrieve the
          // same session again in either case; never guess and never recreate it.
          try{await provider(row.provider_checkout_session_id,true);}catch{/* authoritative GET below */}
          session=await provider(row.provider_checkout_session_id);state=classifyLegacySession(row,session);
        }
        if(state==='unpaidOpen' && input.action==='reconcile-terminal'){counts.openUnchanged++;continue;}
        if(state!=='paidMatching' && state!=='expired'){counts.failed++;continue;}
        const applied=await client.rpc('reconcile_legacy_test_checkout',{target_attempt_id:row.id,session_snapshot:legacyReconciliationSnapshot(session)});
        if(applied.error){counts.failed++;continue;}
        const outcome=Array.isArray(applied.data)?applied.data[0]:applied.data;
        if(outcome==='paid_resolution_required' || outcome==='duplicate')counts.paidRecorded++;
        else if(outcome==='expired')counts.expiredRecorded++;
        else counts.failed++;
      }catch{counts.failed++;}
    }
    // The cursor is for this authenticated operator only; callers must keep it
    // in memory and persist aggregate counts rather than response bodies.
    const nextCursor=result.data.length>5?batch[batch.length-1].id:null;
    const ok=counts.failed===0 && counts.skipped===0;
    return reply({ok,action:input.action,counts,nextCursor},ok?200:503);
  }catch{return reply({error:'Legacy test reconciliation unavailable.'},503);}
});
