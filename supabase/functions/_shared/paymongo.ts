import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';

export type ReservationPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired';

export class PaymongoProviderError extends Error {
  constructor(public status: number, public category: string) {
    super('Payment provider request unavailable.');
  }
}

// Persist only bounded, documented diagnostic categories, never provider text,
// identifiers, URLs, billing details or response bodies.
export function paymentFailureCode(error: unknown): string {
  if (error instanceof PaymongoProviderError) return `provider_${error.status}_${error.category}`;
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) {
    return `database_${error.code}`;
  }
  return 'checkout_outcome_unknown';
}

export function checkoutContractFailure(resource: Record<string, any> | undefined, attempt: Record<string, any>): string {
  const a=resource?.attributes;
  const checks: [string, boolean][] = [
    ['id', /^cs_[A-Za-z0-9_]+$/.test(resource?.id ?? '')],
    ['test_mode', a?.livemode === false],
    ['reference', a?.reference_number === attempt.reservation_id],
    ['attempt_metadata', a?.metadata?.checkout_attempt_id === attempt.id],
    ['reservation_metadata', a?.metadata?.reservation_id === attempt.reservation_id],
    ['currency', a?.line_items?.[0]?.currency === 'PHP'],
    ['amount', Number(a?.line_items?.[0]?.amount) === Math.round(Number(attempt.amount)*100)],
    ['quantity', a?.line_items?.[0]?.quantity === 1],
    ['items', Array.isArray(a?.line_items) && a.line_items.length === 1],
    ['url', /^https:\/\/checkout\.paymongo\.com\//.test(a?.checkout_url ?? '')],
  ];
  return checks.find(([,valid])=>!valid)?.[0] ?? 'unclassified';
}

export async function checkoutResourceForAttempt(resource: Record<string, any>, attempt: Record<string, any>) {
  // Creation responses can omit reservation references. Fetch the authoritative
  // session rather than filling missing provider fields from our request.
  if (checkoutContractFailure(resource,attempt)==='unclassified') return resource;
  if (!/^cs_[A-Za-z0-9_]+$/.test(resource?.id ?? '')) throw new Error('Invalid provider session identity.');
  const retrieved=await paymongoRequest(`/checkout_sessions/${encodeURIComponent(resource.id)}`);
  if (retrieved.data?.id !== resource.id) throw new Error('Provider session identity changed.');
  return retrieved.data;
}

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

export function makeServiceClient(timeoutMs?: number) {
  return createClient(getRequiredEnv('SUPABASE_URL'), getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    ...(timeoutMs ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }) } } : {}),
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
  if (!getRequiredEnv('PAYMONGO_SECRET_KEY').startsWith('sk_test_')) throw new Error('PayMongo test mode is required.');
  const normalizedPath = path.startsWith('/v') ? path : `/v1${path}`;
  const response = await fetch(`https://api.paymongo.com${normalizedPath}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(20000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: paymongoAuthHeader(),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.errors?.[0]?.code;
    const allowed = ['parameter_invalid', 'parameter_required', 'parameter_format_invalid', 'resource_not_found',
      'authentication_invalid', 'api_key_invalid', 'api_key_required', 'rate_limit_exceeded', 'payment_method_not_allowed'];
    throw new PaymongoProviderError(response.status, allowed.includes(code) ? code : 'unclassified');
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

// Use the saved booking contact snapshot, never identity supplied in the request.
export function getReservationBilling(reservation: Record<string, unknown>) {
  const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const name = clean(reservation.guest_name);
  const email = clean(reservation.guest_email);
  const phone = clean(reservation.guest_phone);
  if (!name || !email || !phone) {
    throw new Error('Reservation guest name, email, and phone are required for payment billing. Please complete your reservation contact details.');
  }
  return { name, email, phone };
}

