// Read-only audit: never create, charge, cancel, or modify a payment.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : [];
  }));
}
const local = readEnv('.env.local');
const test = readEnv('.env.test.local');
const env = { ...local, ...test, ...process.env };
const keys = [...new Set([local.PAYMONGO_SECRET_KEY, test.PAYMONGO_SECRET_KEY, process.env.PAYMONGO_SECRET_KEY].filter(Boolean))];
const presence = (billing) => Object.fromEntries(['name', 'email', 'phone'].map((key) => [key, Boolean(billing?.[key]?.trim())]));
const client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) }) },
});
async function provider(route, key) {
  const response = await fetch(`https://api.paymongo.com/v1${route}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`PayMongo HTTP ${response.status}: ${body.errors?.[0]?.code ?? 'request_failed'}`);
  return body.data;
}
const login = await client.auth.signInWithPassword({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD });
if (login.error) throw new Error(`Sign-in failed: ${login.error.message}`);
try {
  const result = await client.from('reservations')
    .select('id,status,payment_status,payment_reference,guest_name,guest_email,guest_phone,spot_name,reservation_date')
    .order('created_at', { ascending: false }).limit(30);
  if (result.error) throw new Error(`Reservation read: ${result.error.message}`);
  for (const reservation of result.data.filter((row) => /test cebspot/i.test(row.spot_name ?? '')).slice(0, 8)) {
    const payments = await client.from('reservation_payments').select('*').eq('reservation_id', reservation.id);
    if (payments.error) throw new Error(`Payment read: ${payments.error.message}`);
    console.log(JSON.stringify({ check: 'reservation', id: reservation.id, date: reservation.reservation_date,
      status: reservation.status, paymentStatus: reservation.payment_status,
      contact: presence({ name: reservation.guest_name, email: reservation.guest_email, phone: reservation.guest_phone }) }));
    for (const payment of payments.data.filter((row) => ['paid', 'pending'].includes(row.status)).slice(0, 2)) {
      const raw = payment.raw_payload?.data?.attributes;
      const mode = raw?.livemode;
      const candidates = keys.filter((key) => mode === undefined || key.startsWith(mode ? 'sk_live_' : 'sk_test_'));
      for (const key of candidates) {
        try {
          let intent;
          let session;
          if (payment.provider_checkout_session_id) session = await provider(`/checkout_sessions/${encodeURIComponent(payment.provider_checkout_session_id)}`, key);
          const intentId = payment.provider_payment_intent_id ?? session?.attributes?.payment_intent?.id;
          if (intentId) intent = await provider(`/payment_intents/${encodeURIComponent(intentId)}`, key);
          const paid = intent?.attributes?.payments ?? session?.attributes?.payments ?? [];
          const methodId = payment.provider_payment_method_id ?? intent?.attributes?.payment_method?.id ?? intent?.attributes?.payment_method;
          const method = typeof methodId === 'string' ? await provider(`/payment_methods/${encodeURIComponent(methodId)}`, key) : null;
          console.log(JSON.stringify({ check: 'provider-billing', mode: key.startsWith('sk_live_') ? 'live' : 'test',
            reservationId: reservation.id, method: payment.payment_method,
            providerLivemode: session?.attributes?.livemode ?? intent?.attributes?.livemode,
            providerIntentStatus: intent?.attributes?.status,
            sessionBilling: presence(session?.attributes?.billing), methodBilling: presence(method?.attributes?.billing),
            payments: paid.map((row) => ({ id: row.id, status: row.attributes?.status, billing: presence(row.attributes?.billing) })) }));
          break;
        } catch (error) { console.log(JSON.stringify({ check: 'provider-read', reservationId: reservation.id, error: error.message })); }
      }
    }
  }
  for (const method of ['gcash', 'qrph']) {
    const response = await client.functions.invoke(`paymongo-create-${method}-checkout`, { body: { reservationId: '00000000-0000-0000-0000-000000000000' } });
    const body = response.error ? await response.error.context?.json?.().catch(() => null) : response.data;
    console.log(JSON.stringify({ check: 'deployed-checkout', method, safeRejection: /reservation not found/i.test(body?.error ?? ''), error: body?.error }));
  }
} finally { await client.auth.signOut({ scope: 'local' }); }
