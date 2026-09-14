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
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    ) {
      return value;
    }
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

function assertCheckoutAllowed(reservation: Record<string, unknown>) {
  if (reservation.payment_status === 'paid') {
    throw new Error('This reservation is already paid.');
  }

  if (reservation.status === 'cancelled' || reservation.status === 'completed' || reservation.status === 'no_show') {
    throw new Error('This reservation cannot accept payment anymore.');
  }

  if (reservation.payment_required === false && reservation.reservation_type !== 'paid') {
    throw new Error('This reservation does not require payment.');
  }
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
    assertCheckoutAllowed(reservation);

    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from('reservation_payments')
      .select('provider_checkout_session_id, checkout_url, amount, currency, status')
      .eq('reservation_id', reservationId)
      .eq('provider', 'paymongo')
      .eq('payment_method', 'gcash')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingPaymentError) throw existingPaymentError;
    if (existingPayment?.checkout_url && existingPayment?.provider_checkout_session_id) {
      return jsonResponse({
        checkoutUrl: existingPayment.checkout_url,
        checkoutSessionId: existingPayment.provider_checkout_session_id,
        amount: Number(existingPayment.amount),
        currency: existingPayment.currency ?? 'PHP',
        reused: true,
      });
    }

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
