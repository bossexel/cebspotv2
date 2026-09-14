import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = { ...process.env };
for (const file of ['.env.local', '.env.test.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
const testKey = env.PAYMONGO_SECRET_KEY;
if (!/^sk_test_(?!x+$|your|placeholder)[A-Za-z0-9]{12,}$/.test(testKey || '')) {
  throw new Error('A real PayMongo Secret Test key is required. Live keys are not accepted.');
}
const statePath = path.resolve('.codex-tmp/map-review/payment-sandbox-state.json');
const mode = process.argv[2] || 'inspect';
if (!['inspect', 'start', 'status', 'cleanup'].includes(mode)) throw new Error('Use inspect, start, status, or cleanup.');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { attempts: [] };
const save = () => { fs.mkdirSync(path.dirname(statePath), { recursive: true }); fs.writeFileSync(statePath, JSON.stringify(state, null, 2)); };
const client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
});
async function provider(route, init) {
  const response = await fetch('https://api.paymongo.com' + route, {
    ...init, headers: { Authorization: 'Basic ' + Buffer.from(testKey + ':').toString('base64'), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`PayMongo HTTP ${response.status}: ${body.errors?.[0]?.code || 'request_failed'}`);
  return body.data;
}
function check(error, label) { if (error) throw new Error(`${label}: ${error.code || error.message || 'failed'}`); }
async function snapshot(attempt) {
  const { data, error } = await client.from('reservations').select('status,payment_status,payment_reference').eq('id', attempt.reservationId).single();
  check(error, 'Reservation read');
  const payments = await client.from('reservation_payments').select('status,provider_checkout_session_id').eq('reservation_id', attempt.reservationId);
  check(payments.error, 'Payment read');
  let session;
  if (attempt.checkoutSessionId) session = await provider('/v1/checkout_sessions/' + encodeURIComponent(attempt.checkoutSessionId));
  const attributes = session?.attributes;
  const nextAction = attributes?.payment_intent?.attributes?.next_action;
  const findTestUrl = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'test_url' && typeof child === 'string') attempt.testUrl = child;
      else findTestUrl(child);
    }
  };
  findTestUrl(session);
  if (nextAction?.redirect?.url) attempt.redirectUrl = nextAction.redirect.url;
  save();
  const result = { method: attempt.method, reservationStatus: data.status, paymentStatus: data.payment_status,
    paymentRows: payments.data.map((row) => ({ status: row.status })), providerLivemode: attributes?.livemode,
    providerStatus: attributes?.status, providerPaymentIntentStatus: attributes?.payment_intent?.attributes?.status,
    nextAction: nextAction?.type, redirectHost: attempt.redirectUrl ? new URL(attempt.redirectUrl).hostname : undefined,
    testUrlFound: Boolean(attempt.testUrl),
    providerPayments: attributes?.payments?.map((row) => ({ status: row.attributes?.status, livemode: row.attributes?.livemode })) };
  console.log(JSON.stringify(result));
  return result;
}

let signedIn = false;
try {
  const webhooks = await provider('/v1/webhooks');
  const expectedUrl = env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/paymongo-webhook';
  const matching = webhooks.filter((row) => row.attributes.url === expectedUrl);
  console.log(JSON.stringify({ check: 'Sandbox key and registered CebSpot webhook', keyAccepted: true,
    webhooks: matching.map((row) => ({ id: row.id, status: row.attributes.status, livemode: row.attributes.livemode, events: row.attributes.events })) }));
  if (mode !== 'inspect') {
    const { data, error } = await client.auth.signInWithPassword({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD });
    check(error, 'Sign-in');
    signedIn = true;
    if (mode === 'start') {
      if (state.attempts.some((attempt) => !attempt.cleanedUp)) throw new Error('Clean up the existing test attempts before starting another run.');
      const spotId = '66666666-6666-4666-8666-666666666666';
      const spot = await client.from('spots').select('id,name,reservation_fee,gcash_amount').eq('id', spotId).single();
      check(spot.error, 'Known test spot lookup');
      for (const method of ['gcash', 'qrph']) {
        const reservationId = randomUUID();
        const attempt = { method, reservationId, cleanedUp: false };
        state.attempts.push(attempt);
        save();
        const amount = Number(spot.data.gcash_amount || spot.data.reservation_fee || 150);
        const reservation = { id: reservationId, user_id: data.user.id, spot_id: spotId,
          spot_name: '[SANDBOX TEST] ' + spot.data.name, reservation_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          reservation_time: '12:00:00', guests: 1, guest_count: 1, fee: amount, reservation_fee: amount,
          payment_required: true, reservation_type: 'paid', status: 'pending_payment', payment_status: 'pending',
          guest_name: 'CebSpot Sandbox Test', guest_email: env.TEST_USER_EMAIL, guest_phone: '09170000000',
          payment_terms_accepted: true, payment_terms_accepted_at: new Date().toISOString(),
          payment_method: 'paymongo_' + method, qr_code: 'sandbox-test-' + reservationId,
          note: 'Automated sandbox connectivity test. Not a customer booking. No table or slot allocated.' };
        const inserted = await client.from('reservations').insert(reservation).select('id').single();
        check(inserted.error, 'Isolated reservation insert');
        attempt.inserted = true;
        save();
        const response = await client.functions.invoke('paymongo-create-' + method + '-checkout', {
          body: { reservationId, successUrl: 'cebspot://confirmed/' + reservationId + '?paymentReturn=success',
            cancelUrl: 'cebspot://confirmed/' + reservationId + '?paymentReturn=cancel' },
        });
        if (response.error) {
          const body = await response.error.context?.json?.().catch(() => null);
          attempt.checkoutError = body?.error || response.error.name;
          console.log(JSON.stringify({ method, reservationInsert: 'passed', checkout: 'failed', error: attempt.checkoutError }));
          save();
          continue;
        }
        attempt.checkoutSessionId = response.data.checkoutSessionId;
        // Saved only in the ignored state file; never print a checkout capability URL.
        attempt.checkoutUrl = response.data.checkoutUrl;
        save();
        const session = await provider('/v1/checkout_sessions/' + encodeURIComponent(attempt.checkoutSessionId));
        if (session.attributes.livemode !== false) throw new Error('Checkout is not confirmed to be in sandbox mode. Do not complete payment.');
        attempt.verifiedTestMode = true;
        save();
        await snapshot(attempt);
      }
    } else if (mode === 'status') {
      for (const attempt of state.attempts.filter((row) => row.inserted)) await snapshot(attempt);
    } else if (mode === 'cleanup') {
      for (const attempt of state.attempts.filter((row) => row.inserted && !row.cleanedUp)) {
        if (attempt.checkoutSessionId && attempt.verifiedTestMode) {
          const route = '/v1/checkout_sessions/' + encodeURIComponent(attempt.checkoutSessionId);
          const session = await provider(route);
          if (session.attributes.livemode !== false) throw new Error('Refusing cleanup of a non-sandbox checkout.');
          if (session.attributes.payment_intent?.attributes?.status === 'succeeded') {
            console.log(JSON.stringify({ method: attempt.method, checkoutExpiry: 'Already paid in sandbox; provider retains the test transaction.' }));
          } else if (session.attributes.status !== 'expired') {
            await provider(route + '/expire', { method: 'POST', body: '{}' });
          }
        }
        const cancelled = await client.rpc('void_unpaid_reservation', { target_reservation_id: attempt.reservationId, cancellation_reason: 'Automated sandbox test completed; no customer booking.' });
        if (cancelled.error) {
          console.log(JSON.stringify({ method: attempt.method, voidRpc: 'failed', errorCode: cancelled.error.code, message: cancelled.error.message }));
          process.exitCode = 1;
        } else {
          const result = await snapshot(attempt);
          if (result.reservationStatus !== 'cancelled' || result.paymentStatus !== 'failed' || result.paymentRows.some((row) => row.status === 'pending')) {
            throw new Error('Cleanup verification failed; test state has been retained for retry.');
          }
          attempt.cleanedUp = true;
          console.log(JSON.stringify({ method: attempt.method, cleanup: 'test reservation voided' }));
          save();
        }
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (signedIn) await client.auth.signOut({ scope: 'local' });
}
