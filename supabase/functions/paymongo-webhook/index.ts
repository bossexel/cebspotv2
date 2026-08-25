import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  findPaymentByIntent,
  findPaymentByCheckoutSession,
  getRequiredEnv,
  makeServiceClient,
  type ReservationPaymentStatus,
  upsertReservationPayment,
} from '../_shared/paymongo.ts';

function parseSignature(header: string) {
  return Object.fromEntries(
    header
      .split(',')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value),
  );
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(signature);
}

async function verifyPaymongoSignature(request: Request, rawBody: string, livemode: boolean) {
  const header = request.headers.get('paymongo-signature') ?? request.headers.get('x-paymongo-signature') ?? '';
  if (!header) throw new Error('Missing PayMongo signature.');

  const parts = parseSignature(header);
  const timestamp = parts.t;
  const providedSignature = livemode ? parts.li : parts.te;
  if (!timestamp || !providedSignature) throw new Error('Invalid PayMongo signature.');

  const expectedSignature = await hmacSha256Hex(getRequiredEnv('PAYMONGO_WEBHOOK_SECRET'), `${timestamp}.${rawBody}`);
  if (expectedSignature !== providedSignature) throw new Error('PayMongo signature mismatch.');
}

function findNestedValue(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === 'string' && direct) return direct;
  }

  const paymentIntent = record.payment_intent;
  if (typeof paymentIntent === 'string' && paymentIntent) return paymentIntent;
  if (paymentIntent && typeof paymentIntent === 'object') {
    const id = (paymentIntent as Record<string, unknown>).id;
    if (typeof id === 'string' && id) return id;
  }

  for (const child of Object.values(record)) {
    const found = findNestedValue(child, keys);
    if (found) return found;
  }

  return null;
}

function statusFromEvent(eventType: string): ReservationPaymentStatus {
  switch (eventType) {
    case 'checkout_session.payment.paid':
    case 'payment.paid':
    case 'payment_intent.succeeded':
      return 'paid';
    case 'payment.failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function getResourceId(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id ? id : null;
}

function getCheckoutSessionId(eventData: unknown) {
  if (!eventData || typeof eventData !== 'object') return null;
  const record = eventData as Record<string, unknown>;
  if (record.type === 'checkout_session') return getResourceId(record);
  return findNestedValue(record, ['checkout_session_id', 'checkoutSessionId']);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const rawBody = await request.text();
    const event = JSON.parse(rawBody);
    const eventType = event?.data?.attributes?.type ?? event?.data?.type ?? '';
    const livemode = Boolean(event?.data?.attributes?.livemode);

    await verifyPaymongoSignature(request, rawBody, livemode);

    const eventData = event?.data?.attributes?.data ?? event?.data;
    const checkoutSessionId = getCheckoutSessionId(eventData);
    const paymentIntentId = findNestedValue(eventData, ['payment_intent_id', 'paymentIntentId']);
    if (!paymentIntentId && !checkoutSessionId) {
      return jsonResponse({ received: true, ignored: true, reason: 'No PayMongo reference id.' });
    }

    const supabase = makeServiceClient();
    const existingPayment =
      (paymentIntentId ? await findPaymentByIntent(paymentIntentId, supabase) : null) ??
      (checkoutSessionId ? await findPaymentByCheckoutSession(checkoutSessionId, supabase) : null);
    if (!existingPayment) {
      return jsonResponse({ received: true, ignored: true, reason: 'PayMongo payment is not tracked by CebSpot.' });
    }

    await upsertReservationPayment(
      {
        reservationId: existingPayment.reservation_id,
        userId: existingPayment.user_id,
        spotId: existingPayment.spot_id,
        providerCheckoutSessionId: checkoutSessionId ?? existingPayment.provider_checkout_session_id,
        providerPaymentIntentId: paymentIntentId ?? existingPayment.provider_payment_intent_id,
        providerPaymentMethodId: existingPayment.provider_payment_method_id,
        providerPaymentId: findNestedValue(eventData, ['payment_id']) ?? getResourceId(eventData) ?? existingPayment.provider_payment_id,
        paymentMethod: existingPayment.payment_method ?? 'gcash',
        reservationPaymentMethod: 'paymongo_gcash',
        checkoutUrl: existingPayment.checkout_url,
        amount: Number(existingPayment.amount),
        status: statusFromEvent(eventType),
        qrImageUrl: existingPayment.qr_image_url,
        expiresAt: existingPayment.expires_at,
        rawPayload: event,
      },
      supabase,
    );

    return jsonResponse({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process PayMongo webhook.';
    console.error('paymongo-webhook:', error);
    return jsonResponse({ error: message }, 400);
  }
});
