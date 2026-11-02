import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getRequiredEnv, makeServiceClient } from '../_shared/paymongo.ts';
import { sha256 } from '../_shared/paymentSignature.ts';
import { inspectLegacyTestPayments } from '../_shared/legacyPaymentInspection.ts';

// Operator-only GET. All database/provider operations are reads; response is
// aggregate counts only. This does not clear the reconciliation queue.
Deno.serve(async(request: Request)=>{
  const headers={...corsHeaders,'Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'no-store'};
  const reply=(body:unknown,status=200)=>{const response=jsonResponse(body,status);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response;};
  if(request.method==='OPTIONS')return new Response('ok',{headers});
  if(request.method!=='GET')return reply({error:'Method not allowed.'},405);
  try{
    const token=getRequiredEnv('PAYMENT_WORKER_TOKEN');
    if(token.length<32 || await sha256(request.headers.get('authorization') ?? '')!==await sha256(`Bearer ${token}`))return reply({error:'Operator authentication required.'},401);
    const key=getRequiredEnv('PAYMONGO_SECRET_KEY');
    if(!/^sk_test_[A-Za-z0-9_]+$/.test(key))return reply({error:'Test mode required.'},503);
    const params=new URL(request.url).searchParams;
    const offsetText=params.get('offset') ?? '0';
    if([...params.keys()].some(k=>k!=='offset') || !/^(?:0|[1-9][0-9]?)$/.test(offsetText))return reply({error:'Invalid report offset.'},400);
    const client=makeServiceClient(15000);
    const result=await client.from('reservation_payments')
      .select('id,reservation_id,provider_checkout_session_id,amount,currency,status,raw_payload,checkout_request,attempt_state')
      .eq('status','pending').eq('attempt_state','reconciliation_required').order('id',{ascending:true}).limit(101);
    if(result.error || !Array.isArray(result.data))return reply({error:'Read-only payment lookup unavailable.'},503);
    if(result.data.length>100)return reply({error:'Report scope exceeds the reviewed limit.'},409);
    const scopeHash=await sha256(JSON.stringify(result.data));
    const report=await inspectLegacyTestPayments(result.data,async id=>{
      // Fixed provider origin, fixed resource path and GET only. Never follow a
      // redirect with the server key, send billing data or log a provider body.
      const response=await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(id)}`,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{Authorization:`Basic ${btoa(`${key}:`)}`,Accept:'application/json'},
      });
      if(!response.ok){await response.body?.cancel();throw new Error('Provider lookup unavailable.');}
      const body=await response.json();return body?.data;
    },Number(offsetText));
    return reply({...report,scopeHash});
  }catch{return reply({error:'Read-only reconciliation report unavailable.'},503);}
});
