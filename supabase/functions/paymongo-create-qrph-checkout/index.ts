import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  getErrorMessage,
  getReservationForUser,
  getUserFromRequest,
  makeServiceClient,
  paymongoRequest,
  upsertReservationPayment,
} from '../_shared/paymongo.ts';

const testCebspotSpotId = '66666666-6666-4666-8666-666666666666';
const testCebspotReservationFee = 150;

function normalizeReturnUrl(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    const url = new URL(value);
    if (['cebspot:', 'exp:'].includes(url.protocol)) return value;
    if (['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return value;
  } catch {
    // Use the app deep link when the supplied URL is invalid or untrusted.
  }

  return fallback;
}

function isTestCebspotReservation(reservation: Record<string, unknown>) {
  const normalizedName = String(reservation.spot_name ?? '').toLowerCase();
  return reservation.spot_id === testCebspotSpotId || normalizedName.includes('test cebspot') || normalizedName.includes('cebspot cafe');
}

function assertCheckoutAllowed(reservation: Record<string, unknown>) {
  if (reservation.payment_status === 'paid') throw new Error('This reservation is already paid.');
  if (['cancelled', 'completed', 'no_show'].includes(String(reservation.status))) throw new Error('This reservation cannot accept payment anymore.');
  if (reservation.payment_required === false && reservation.reservation_type !== 'paid') throw new Error('This reservation does not require payment.');
}

function toCentavos(amount: number) {
  return Math.round(amount * 100);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const reservationId = typeof body.reservationId === 'string' ? body.reservationId : '';
    if (!reservationId) throw new Error('Reservation id is required.');

    const supabase = makeServiceClient();
    const user = await getUserFromRequest(request, supabase);
    const reservation = await getReservationForUser(reservationId, user.id, supabase);
    assertCheckoutAllowed(reservation);

    // A checkout session or its underlying QR source can only be completed once.
    // Expire an abandoned attempt so a retry always receives a fresh session.
    const { error: stalePaymentError } = await supabase
      .from('reservation_payments')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('reservation_id', reservationId)
      .eq('provider', 'paymongo')
      .eq('payment_method', 'qrph')
      .eq('status', 'pending');
    if (stalePaymentError) throw stalePaymentError;

    const { data: spot, error: spotError } = await supabase
      .from('spots')
      .select('reservation_fee, gcash_amount')
      .eq('id', reservation.spot_id)
      .maybeSingle();
    if (spotError) throw spotError;

    const configuredAmount = Number(spot?.gcash_amount ?? spot?.reservation_fee ?? 0);
    const reservationAmount = Number(reservation.reservation_fee ?? reservation.fee ?? 0);
    const amount = configuredAmount > 0
      ? configuredAmount
      : reservationAmount > 0
        ? reservationAmount
        : isTestCebspotReservation(reservation)
          ? testCebspotReservationFee
          : 0;
    if (!Number.isFinite(amount) || amount < 1) throw new Error('QR Ph checkout requires a payment amount of at least PHP 1.00.');

    if (reservationAmount !== amount || reservation.payment_required !== true || reservation.reservation_type !== 'paid') {
      const { error: amountUpdateError } = await supabase
        .from('reservations')
        .update({ fee: amount, reservation_fee: amount, payment_required: true, reservation_type: 'paid', updated_at: new Date().toISOString() })
        .eq('id', reservationId);
      if (amountUpdateError) throw amountUpdateError;
    }

    const fallbackReturnUrl = `cebspot://confirmed/${reservationId}`;
    const successUrl = normalizeReturnUrl(body.successUrl, `${fallbackReturnUrl}?paymentReturn=success`);
    const cancelUrl = normalizeReturnUrl(body.cancelUrl, `${fallbackReturnUrl}?paymentReturn=cancel`);
    const spotName = String(reservation.spot_name ?? 'CebSpot Reservation');
    const guestCount = Number(reservation.guest_count ?? reservation.guests ?? 1);
    const schedule = `${reservation.reservation_date ?? ''} ${reservation.reservation_time ?? ''}`.trim();
    const checkout = await paymongoRequest('/v2/checkout_sessions', {
      method: 'POST',
      headers: { 'Idempotency-Key': `cebspot-qrph-${reservationId}-${crypto.randomUUID()}` },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [{
              name: `${spotName} reservation`,
              description: schedule ? `${schedule} for ${guestCount} guest${guestCount === 1 ? '' : 's'}` : 'CebSpot table reservation',
              amount: toCentavos(amount),
              currency: 'PHP',
              quantity: 1,
            }],
            payment_method_types: ['qrph'],
            success_url: successUrl,
            cancel_url: cancelUrl,
            reference_number: reservationId,
            description: `CebSpot reservation payment for ${spotName}`,
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            metadata: { reservation_id: reservationId, spot_id: String(reservation.spot_id ?? ''), user_id: user.id },
          },
        },
      }),
    });

    const checkoutSessionId = checkout?.data?.id;
    const checkoutUrl = checkout?.data?.attributes?.checkout_url;
    if (typeof checkoutSessionId !== 'string' || typeof checkoutUrl !== 'string') throw new Error('PayMongo did not return a checkout URL.');

    await upsertReservationPayment({
      reservationId,
      userId: user.id,
      spotId: typeof reservation.spot_id === 'string' ? reservation.spot_id : null,
      providerCheckoutSessionId: checkoutSessionId,
      paymentMethod: 'qrph',
      reservationPaymentMethod: 'paymongo_qrph',
      checkoutUrl,
      amount,
      status: 'pending',
      rawPayload: checkout,
    }, supabase);

    return jsonResponse({ checkoutUrl, checkoutSessionId, amount, currency: 'PHP' });
  } catch (error) {
    const message = getErrorMessage(error, 'Unable to create QR Ph checkout.');
    console.error('paymongo-create-qrph-checkout:', error);
    return jsonResponse({ error: message }, 400);
  }
});
