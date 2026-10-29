import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getRequiredEnv, makeServiceClient, paymongoRequest } from '../_shared/paymongo.ts';
import { paymentRpc } from '../_shared/durableCheckout.ts';
import { paymentSnapshot } from '../_shared/paymentSnapshot.ts';
import { sha256 } from '../_shared/paymentSignature.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' },405);
  try {
    const token = getRequiredEnv('PAYMENT_WORKER_TOKEN');
    if (token.length < 32 || await sha256(request.headers.get('authorization') ?? '') !== await sha256(`Bearer ${token}`)) {
      return jsonResponse({ error: 'Server worker authentication required.' },401);
    }
    if (!getRequiredEnv('PAYMONGO_SECRET_KEY').startsWith('sk_test_')) return jsonResponse({ error:'Test mode required.' },503);
    const client = makeServiceClient(); const deadline = Date.now()+40000;
    const counts = { recovered:0, reconciled:0, retired:0, failed:0, manual:0 };
    await paymentRpc(client,'expire_incomplete_reservation_holds',{});
    const recovery = await client.from('reservation_payments').select('*')
      .in('attempt_state',['creating','reconciliation_required']).order('created_at',{ascending:true}).limit(5);
    if (recovery.error) throw new Error('Recovery lookup unavailable.');
    for (const attempt of recovery.data ?? []) {
      if (Date.now()>=deadline) break;
      if (!attempt.checkout_request || Date.now()-Date.parse(attempt.created_at)>=23*60*60*1000) {
        counts.manual++;continue; // Never recreate after the provider's 24-hour key retention.
      }
      try {
        const response = await paymongoRequest('/v2/checkout_sessions',{method:'POST',
          headers:{'Idempotency-Key':`cebspot-${attempt.idempotency_key}`},body:JSON.stringify(attempt.checkout_request)});
        await paymentRpc(client,'record_checkout_session',{target_attempt_id:attempt.id,session_snapshot:paymentSnapshot(response.data)});
        counts.recovered++;
      } catch { counts.failed++; }
    }
    async function reconcile(attemptId: string, session: Record<string,any>) {
      const snapshot=paymentSnapshot(session);const hash=await sha256(JSON.stringify(snapshot));
      const eventId=`evt_reconcile_${attemptId.replaceAll('-','')}_${hash.slice(0,16)}`;
      await paymentRpc(client,'ingest_paymongo_event',{incoming_event_id:eventId,payload_hash:hash,incoming_type:'reconciliation',
        incoming_session_id:snapshot.id,incoming_attempt_id:attemptId,incoming_reservation_id:snapshot.attributes.metadata?.reservation_id});
      await paymentRpc(client,'apply_paymongo_snapshot',{incoming_event_id:eventId,target_attempt_id:attemptId,session_snapshot:snapshot});
    }
    const pending = await client.from('reservation_payments').select('id,provider_checkout_session_id')
      .in('attempt_state',['active','retiring']).order('updated_at',{ascending:true}).limit(5);
    if(pending.error)throw new Error('Reconciliation lookup unavailable.');
    for(const attempt of pending.data ?? []) {
      if(Date.now()>=deadline)break;
      try {
        const response=await paymongoRequest(`/checkout_sessions/${encodeURIComponent(attempt.provider_checkout_session_id)}`);
        await reconcile(attempt.id,response.data);counts.reconciled++;
      } catch {counts.failed++;}
    }
    const retirements=await paymentRpc(client,'claim_payment_retirements',{batch_size:5});
    for(const item of retirements ?? []) {
      if(Date.now()>=deadline)break;
      let succeeded=false;
      try {
        let response=await paymongoRequest(`/checkout_sessions/${encodeURIComponent(item.session_id)}`);
        await reconcile(item.attempt_id,response.data);
        if(response.data?.attributes?.status!=='expired') {
          await paymongoRequest(`/checkout_sessions/${encodeURIComponent(item.session_id)}/expire`,{method:'POST',body:'{}'});
          response=await paymongoRequest(`/checkout_sessions/${encodeURIComponent(item.session_id)}`);
        }
        succeeded=response.data?.attributes?.status==='expired';
        if(succeeded)counts.retired++;
      } catch {counts.failed++;}
      await paymentRpc(client,'finish_payment_retirement',{target_attempt_id:item.attempt_id,succeeded});
    }
    const ok=counts.failed===0 && counts.manual===0;
    return jsonResponse({ok,counts},ok?200:503);
  } catch { return jsonResponse({error:'Payment maintenance unavailable. Retry the scheduled job.'},503); }
});
