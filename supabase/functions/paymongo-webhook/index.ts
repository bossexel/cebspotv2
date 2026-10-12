import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { makeServiceClient, paymongoRequest } from '../_shared/paymongo.ts';
import { paymentRpc, PaymentDatabaseError } from '../_shared/durableCheckout.ts';
import { readPrivateUpload, UploadError } from '../_shared/privateUpload.ts';
import { verifyTestPaymentSignature, sha256 } from '../_shared/paymentSignature.ts';
import { paymentSnapshot } from '../_shared/paymentSnapshot.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' },405);
  try {
    const raw = new TextDecoder().decode(await readPrivateUpload(request,5000,262144));
    try { await verifyTestPaymentSignature(request,raw); }
    catch { return jsonResponse({ error: 'Invalid test-mode webhook signature.' },401); }
    const event = JSON.parse(raw)?.data;
    if (event?.attributes?.livemode !== false) return jsonResponse({ error: 'Only explicit test-mode events are accepted.' },400);
    const type = event.attributes.type;
    if (!['checkout_session.payment.paid','checkout_session.payment.failed','checkout_session.expired'].includes(type)) {
      return jsonResponse({ received:true,ignored:true });
    }
    const resource = event.attributes.data;
    const sessionId = resource?.id;
    if (resource?.type !== 'checkout_session' || typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      return jsonResponse({ error:'A checkout-session reference is required.' },400);
    }
    const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
    const client = makeServiceClient();
    const attemptId = uuid(resource.attributes?.metadata?.checkout_attempt_id);
    const reservationId = uuid(resource.attributes?.metadata?.reservation_id);
    const inbox = await paymentRpc(client,'ingest_paymongo_event',{
      incoming_event_id:event.id,payload_hash:await sha256(raw),incoming_type:type,
      incoming_session_id:sessionId,incoming_attempt_id:attemptId,incoming_reservation_id:reservationId,
    });
    if (inbox.state === 'processed') return jsonResponse({ received:true,duplicate:true });
    // Retrieve the authoritative test-mode session. Redirect query parameters
    // and unverified event amounts never authorize a financial transition.
    const response = await paymongoRequest(`/checkout_sessions/${encodeURIComponent(sessionId)}`);
    const snapshot = paymentSnapshot(response?.data);
    if (snapshot.id !== sessionId) return jsonResponse({ error:'Provider reference mismatch.' },422);
    const authoritativeAttempt = uuid(snapshot.attributes.metadata?.checkout_attempt_id);
    if (!authoritativeAttempt) return jsonResponse({ error:'Untracked checkout requires reconciliation.' },422);
    const total = snapshot.attributes.line_items.reduce((sum: number,item: any)=>sum+item.amount*item.quantity,0);
    if ((resource.attributes?.amount !== undefined && resource.attributes.amount !== total)
      || (resource.attributes?.currency !== undefined && resource.attributes.currency !== 'PHP')) {
      return jsonResponse({ error:'Event amount or currency mismatch.' },422);
    }
    const result = await paymentRpc(client,'apply_paymongo_snapshot',{
      incoming_event_id:event.id,target_attempt_id:authoritativeAttempt,session_snapshot:snapshot,
    });
    return jsonResponse({ received:true,result });
  } catch (error) {
    if (error instanceof UploadError) return jsonResponse({ error:'Webhook body rejected.' },error.status);
    if (error instanceof SyntaxError) return jsonResponse({ error:'Invalid event JSON.' },400);
    if (error instanceof PaymentDatabaseError && error.code === '22023') return jsonResponse({ error:'Financial validation failed; reconciliation required.' },422);
    return jsonResponse({ error:'Webhook persistence or reconciliation unavailable. Retry delivery.' },503);
  }
});
