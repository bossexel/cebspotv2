import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';

export type ReservationPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired';

export function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function getErrorMessage(error: unknown, fallback = 'Unexpected error.') {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = record.message ?? record.error_description ?? record.error ?? record.details ?? record.hint ?? record.code;
    if (typeof message === 'string' && message) return message;

    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export function makeServiceClient() {
  return createClient(getRequiredEnv('SUPABASE_URL'), getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function paymongoAuthHeader(key = getRequiredEnv('PAYMONGO_SECRET_KEY')) {
  return `Basic ${btoa(`${key}:`)}`;
}

export function paymongoPublicAuthHeader() {
  return paymongoAuthHeader(getRequiredEnv('PAYMONGO_PUBLIC_KEY'));
}

export async function paymongoRequest(path: string, init: RequestInit = {}) {
  const normalizedPath = path.startsWith('/v') ? path : `/v1${path}`;
  const response = await fetch(`https://api.paymongo.com${normalizedPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: paymongoAuthHeader(),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.detail ??
      payload?.errors?.[0]?.code ??
      payload?.error ??
      `PayMongo request failed with ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

export async function getUserFromRequest(request: Request, supabase = makeServiceClient()) {
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required.');

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Authentication required.');
  return data.user;
}

export async function getReservationForUser(reservationId: string, userId: string, supabase = makeServiceClient()) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error, 'Unable to save PayMongo payment.'));
  if (!data) throw new Error('Reservation not found.');
  return data;
}

export function mapIntentStatus(status?: string | null): ReservationPaymentStatus {
  switch (status) {
    case 'succeeded':
    case 'paid':
      return 'paid';
    case 'payment_failed':
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

export function reservationUpdatesForPaymentStatus(status: ReservationPaymentStatus) {
  if (status === 'paid') {
    return {
      status: 'confirmed',
      payment_status: 'paid',
      updated_at: new Date().toISOString(),
    };
  }

  if (status === 'failed' || status === 'expired') {
    return {
      status: 'pending_payment',
      payment_status: 'failed',
      updated_at: new Date().toISOString(),
    };
  }

  return {
    status: 'pending_payment',
    payment_status: 'pending',
    updated_at: new Date().toISOString(),
  };
}

export async function upsertReservationPayment(
  payload: {
    reservationId: string;
    userId?: string | null;
    spotId?: string | null;
    providerCheckoutSessionId?: string | null;
    providerPaymentIntentId?: string | null;
    providerPaymentMethodId?: string | null;
    providerPaymentId?: string | null;
    paymentMethod?: string;
    reservationPaymentMethod?: string;
    checkoutUrl?: string | null;
    amount: number;
    currency?: string;
    status: ReservationPaymentStatus;
    qrImageUrl?: string | null;
    expiresAt?: string | null;
    rawPayload?: unknown;
  },
  supabase = makeServiceClient(),
) {
  if (!payload.providerPaymentIntentId && !payload.providerCheckoutSessionId) {
    throw new Error('A PayMongo payment intent id or checkout session id is required.');
  }

  const now = new Date().toISOString();
  const conflictColumn = payload.providerCheckoutSessionId ? 'provider_checkout_session_id' : 'provider_payment_intent_id';
  const paymentRow = {
    reservation_id: payload.reservationId,
    user_id: payload.userId ?? null,
    spot_id: payload.spotId ?? null,
    provider: 'paymongo',
    payment_method: payload.paymentMethod ?? 'paymongo',
    provider_checkout_session_id: payload.providerCheckoutSessionId ?? null,
    provider_payment_intent_id: payload.providerPaymentIntentId,
    provider_payment_method_id: payload.providerPaymentMethodId ?? null,
    provider_payment_id: payload.providerPaymentId ?? null,
    amount: payload.amount,
    currency: payload.currency ?? 'PHP',
    status: payload.status,
    qr_image_url: payload.qrImageUrl ?? null,
    checkout_url: payload.checkoutUrl ?? null,
    expires_at: payload.expiresAt ?? null,
    raw_payload: payload.rawPayload ?? {},
    updated_at: now,
    paid_at: payload.status === 'paid' ? now : null,
  };
  const { error } = await supabase.from('reservation_payments').upsert(paymentRow, { onConflict: conflictColumn });
  if (error) {
    const message = getErrorMessage(error, 'Unable to save PayMongo payment.');
    if (/checkout_url|schema cache/i.test(message)) {
      const { checkout_url, ...legacyPaymentRow } = paymentRow;
      const { error: retryError } = await supabase
        .from('reservation_payments')
        .upsert(legacyPaymentRow, { onConflict: conflictColumn });
      if (retryError) throw new Error(getErrorMessage(retryError, 'Unable to save PayMongo payment.'));
    } else {
      throw new Error(message);
    }
  }

  const { error: reservationError } = await supabase
    .from('reservations')
    .update({
      ...reservationUpdatesForPaymentStatus(payload.status),
      payment_method: payload.reservationPaymentMethod ?? 'paymongo',
      payment_reference: payload.providerPaymentIntentId ?? payload.providerCheckoutSessionId,
    })
    .eq('id', payload.reservationId);
  if (reservationError) throw new Error(getErrorMessage(reservationError, 'Unable to update reservation payment status.'));
}

export async function findPaymentByIntent(paymentIntentId: string, supabase = makeServiceClient()) {
  const { data, error } = await supabase
    .from('reservation_payments')
    .select('*')
    .eq('provider_payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findPaymentByCheckoutSession(checkoutSessionId: string, supabase = makeServiceClient()) {
  const { data, error } = await supabase
    .from('reservation_payments')
    .select('*')
    .eq('provider_checkout_session_id', checkoutSessionId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
