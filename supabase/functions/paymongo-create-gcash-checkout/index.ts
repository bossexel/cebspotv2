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
    if (['http:', 'https:', 'cebspot:', 'exp:'].includes(url.protocol)) return value;
  } catch {
    // Fall through to the safe fallback below.
  }

  return fallback;
}

function isTestCebspotReservation(reservation: Record<string, unknown>) {
  const normalizedName = String(reservation.spot_name ?? '').toLowerCase();
  return (
    reservation.spot_id === testCebspotSpotId ||
    normalizedName.includes('test cebspot') ||
    normalizedName.includes('cebspot cafe')
  );
}

function getReservationAmount(reservation: Record<string, unknown>) {
  const value = Number(reservation.reservation_fee ?? reservation.fee ?? 0);
  const amount = Number.isFinite(value) ? value : 0;
  return amount > 0 ? amount : isTestCebspotReservation(reservation) ? testCebspotReservationFee : 0;
}

function toCentavos(amount: number) {
  return Math.round(amount * 100);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const reservationId = typeof body.reservationId === 'string' ? body.reservationId : '';
    if (!reservationId) throw new Error('Reservation id is required.');

    const supabase = makeServiceClient();
    const user = await getUserFromRequest(request, supabase);
    const reservation = await getReservationForUser(reservationId, user.id, supabase);
    const amount = getReservationAmount(reservation);
    if (amount < 1) throw new Error('GCash checkout requires a payment amount of at least PHP 1.00.');

    if (Number(reservation.reservation_fee ?? reservation.fee ?? 0) < 1) {
      const { error: amountUpdateError } = await supabase
        .from('reservations')
        .update({
          fee: amount,
          reservation_fee: amount,
          payment_required: true,
          reservation_type: 'paid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', reservationId);
      if (amountUpdateError) {
        console.warn('Unable to backfill reservation amount before checkout:', amountUpdateError);
      }
    }

    const fallbackReturnUrl = `cebspot://confirmed/${reservationId}`;
    const successUrl = normalizeReturnUrl(body.successUrl, `${fallbackReturnUrl}?paymentReturn=success`);
    const cancelUrl = normalizeReturnUrl(body.cancelUrl, `${fallbackReturnUrl}?paymentReturn=cancel`);
    const spotName = String(reservation.spot_name ?? 'CebSpot Reservation');
    const guestCount = Number(reservation.guest_count ?? reservation.guests ?? 1);
    const schedule = `${reservation.reservation_date ?? ''} ${reservation.reservation_time ?? ''}`.trim();
    const checkout = await paymongoRequest('/v2/checkout_sessions', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                name: `${spotName} reservation`,
                description: schedule ? `${schedule} for ${guestCount} guest${guestCount === 1 ? '' : 's'}` : 'CebSpot table reservation',
                amount: toCentavos(amount),
                currency: 'PHP',
                quantity: 1,
              },
            ],
            payment_method_types: ['gcash'],
            success_url: successUrl,
            cancel_url: cancelUrl,
            reference_number: reservationId,
            description: `CebSpot reservation payment for ${spotName}`,
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            metadata: {
              reservation_id: reservationId,
              spot_id: String(reservation.spot_id ?? ''),
              user_id: user.id,
            },
          },
        },
      }),
    });

    const checkoutSessionId = checkout?.data?.id;
    const checkoutUrl = checkout?.data?.attributes?.checkout_url;
    if (typeof checkoutSessionId !== 'string' || typeof checkoutUrl !== 'string') {
      throw new Error('PayMongo did not return a checkout URL.');
    }

    await upsertReservationPayment(
      {
        reservationId,
        userId: user.id,
        spotId: typeof reservation.spot_id === 'string' ? reservation.spot_id : null,
        providerCheckoutSessionId: checkoutSessionId,
        paymentMethod: 'gcash',
        reservationPaymentMethod: 'paymongo_gcash',
        checkoutUrl,
        amount,
        status: 'pending',
        rawPayload: checkout,
      },
      supabase,
    );

    return jsonResponse({
      checkoutUrl,
      checkoutSessionId,
      amount,
      currency: 'PHP',
    });
  } catch (error) {
    const message = getErrorMessage(error, 'Unable to create GCash checkout.');
    console.error('paymongo-create-gcash-checkout:', error);
    return jsonResponse({ error: message }, 400);
  }
});
