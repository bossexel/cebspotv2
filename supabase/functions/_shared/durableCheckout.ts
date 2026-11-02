import { corsHeaders, jsonResponse } from './cors.ts';
import { getReservationBilling, getUserFromRequest, makeServiceClient, paymongoRequest, getRequiredEnv, paymentFailureCode, checkoutResourceForAttempt } from './paymongo.ts';
import { paymentSnapshot } from './paymentSnapshot.ts';
import { readPrivateUpload } from './privateUpload.ts';

export class PaymentDatabaseError extends Error {
  constructor(public code: string) { super('Payment database operation unavailable.'); }
}

export async function paymentRpc(client: ReturnType<typeof makeServiceClient>, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new PaymentDatabaseError(error.code ?? 'database_unavailable');
  return name !== 'claim_payment_retirements' && Array.isArray(data) && data.length === 1 ? data[0] : data;
}

export function paymentReturnUrl(reservationId: string, attemptId: string, outcome: string) {
  const url = new URL(getRequiredEnv('CHECKOUT_RETURN_BASE_URL'));
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.pathname !== '/payment-return.html') {
    throw new Error('Configure an HTTPS payment return bridge.');
  }
  url.searchParams.set('reservation', reservationId);url.searchParams.set('attempt', attemptId);url.searchParams.set('outcome', outcome);
  return url.toString();
}

export function checkoutHandler(method: 'gcash' | 'qrph') {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
    let client: ReturnType<typeof makeServiceClient> | undefined;
    let attemptId: string | undefined;
    try {
      if (Deno.env.get('PAYMENT_CHECKOUT_ENABLED') !== 'true') {
        return jsonResponse({ error: 'Reservation payments are undergoing maintenance. Please try again shortly.', retryable: true }, 503);
      }
      if (!getRequiredEnv('PAYMONGO_SECRET_KEY').startsWith('sk_test_')) {
        return jsonResponse({ error: 'Only PayMongo test mode is enabled for this release.' }, 503);
      }
      client = makeServiceClient();
      let user;
      try { user = await getUserFromRequest(request, client); }
      catch { return jsonResponse({ error: 'Authentication required.' }, 401); }
      if (Number(request.headers.get('content-length')) > 4096) return jsonResponse({ error: 'Request too large.' }, 413);
      const raw = new TextDecoder().decode(await readPrivateUpload(request, 5000, 4096));
      if (raw.length > 4096) return jsonResponse({ error: 'Request too large.' }, 413);
      const body = JSON.parse(raw);
      if (typeof body.reservationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.reservationId)) return jsonResponse({ error: 'Valid reservation id required.' }, 400);
      paymentReturnUrl(body.reservationId, body.reservationId, 'pending');
      const result = await paymentRpc(client, 'begin_checkout_attempt', {
        target_reservation_id: body.reservationId, customer_id: user.id, method, replace_active: body.replace === true,
      });
      if (['busy','retire','reconcile'].includes(result.action)) {
        return jsonResponse({ error: 'Checkout is being recovered or retired. Retry this reservation shortly.', retryable: true }, 409);
      }
      const attempt = result.attempt;
      if (result.action === 'reuse') return jsonResponse({ checkoutUrl: attempt.checkout_url,
        checkoutSessionId: attempt.provider_checkout_session_id, amount: Number(attempt.amount), currency: 'PHP', attemptId: attempt.id, reused: true });
      attemptId = attempt.id;
      const r = result.reservation;
      const payload = attempt.checkout_request ?? { data: { attributes: {
        line_items: [{ name: `${r.spot_name} reservation`, amount: Math.round(Number(attempt.amount) * 100), currency: 'PHP', quantity: 1 }],
        payment_method_types: [method], billing: getReservationBilling(r),
        success_url: paymentReturnUrl(r.id, attempt.id, 'success'), cancel_url: paymentReturnUrl(r.id, attempt.id, 'cancel'),
        reference_number: r.id, send_email_receipt: false, show_description: true, show_line_items: true,
        metadata: { reservation_id: r.id, checkout_attempt_id: attempt.id },
      } } };
      const savedRequest = await paymentRpc(client, 'prepare_checkout_request', { target_attempt_id: attempt.id, request_payload: payload });
      const response = await paymongoRequest('/v2/checkout_sessions', {
        method: 'POST', headers: { 'Idempotency-Key': `cebspot-${attempt.idempotency_key}` }, body: JSON.stringify(savedRequest),
      });
      const resource=await checkoutResourceForAttempt(response?.data,attempt);
      const persisted = await paymentRpc(client, 'record_checkout_session', { target_attempt_id: attempt.id, session_snapshot: paymentSnapshot(resource) });
      if (persisted.attempt_state !== 'active') return jsonResponse({ error: 'The reservation expired or changed. Checkout is being retired.' }, 409);
      return jsonResponse({ checkoutUrl: persisted.checkout_url, checkoutSessionId: persisted.provider_checkout_session_id,
        amount: Number(persisted.amount), currency: 'PHP', attemptId: persisted.id });
    } catch (error) {
      if (client && attemptId) {
        await client.from('reservation_payments').update({ attempt_state: 'reconciliation_required', lease_expires_at: null,
          last_error_code: paymentFailureCode(error) }).eq('id', attemptId).eq('status', 'pending').then(() => {}, () => {});
      }
      return jsonResponse({ error: 'Checkout unavailable. Retry the same reservation; its payment status is unchanged.', retryable: true }, 503);
    }
  };
}
