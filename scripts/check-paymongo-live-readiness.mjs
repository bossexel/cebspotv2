import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = { ...process.env };
for (const file of ['.env.local', '.env.test.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

for (const name of [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'PAYMONGO_SECRET_KEY',
  'PAYMONGO_PUBLIC_KEY',
  'PAYMONGO_WEBHOOK_SECRET',
  'TEST_USER_EMAIL',
  'TEST_USER_PASSWORD',
]) {
  if (!env[name]) throw new Error(`${name} is required.`);
}
if (!env.PAYMONGO_SECRET_KEY.startsWith('sk_live_')) throw new Error('PAYMONGO_SECRET_KEY is not a live key.');
if (!env.PAYMONGO_PUBLIC_KEY.startsWith('pk_live_')) throw new Error('PAYMONGO_PUBLIC_KEY is not a live key.');
if (!env.PAYMONGO_WEBHOOK_SECRET.startsWith('whsk_')) throw new Error('PAYMONGO_WEBHOOK_SECRET is invalid.');

const paymongoAuthorization = `Basic ${Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString('base64')}`;
async function paymongo(path) {
  const response = await fetch(`https://api.paymongo.com${path}`, {
    headers: { accept: 'application/json', authorization: paymongoAuthorization },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`PayMongo HTTP ${response.status}: ${body?.errors?.[0]?.code ?? 'request_failed'}`);
  return body;
}

const webhookUrl = `${env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/paymongo-webhook`;
const webhookList = await paymongo('/v1/webhooks');
const webhook = webhookList.data.find((item) => item.attributes.url === webhookUrl && item.attributes.livemode === true);
if (!webhook) throw new Error('No live PayMongo webhook points to the CebSpot endpoint.');
const webhookDetails = await paymongo(`/v1/webhooks/${encodeURIComponent(webhook.id)}`);
const attributes = webhookDetails.data.attributes;
const webhookCheck = {
  id: webhook.id,
  mode: attributes.livemode ? 'live' : 'test',
  status: attributes.status,
  subscribedToPaidCheckout: attributes.events?.includes('checkout_session.payment.paid') === true,
  signingSecretMatches: attributes.secret_key === env.PAYMONGO_WEBHOOK_SECRET,
};
console.log(JSON.stringify({ check: 'live-webhook', ...webhookCheck }));
if (
  webhookCheck.status !== 'enabled' ||
  !webhookCheck.subscribedToPaidCheckout ||
  !webhookCheck.signingSecretMatches
) {
  throw new Error('The live PayMongo webhook configuration is not ready.');
}

const capabilities = await paymongo('/v1/merchants/capabilities/payment_methods');
const capabilityCandidate = capabilities?.data?.attributes?.payment_methods
  ?? capabilities?.data?.payment_methods
  ?? capabilities?.payment_methods
  ?? capabilities?.data
  ?? capabilities
  ?? [];
const activePaymentMethods = Array.isArray(capabilityCandidate)
  ? capabilityCandidate
    .map((item) => typeof item === 'string' ? item : item?.id ?? item?.type ?? item?.name)
    .filter(Boolean)
  : [];
const capabilityCheck = {
  activePaymentMethods,
  gcashActive: activePaymentMethods.includes('gcash'),
  qrphActive: activePaymentMethods.includes('qrph'),
};
console.log(JSON.stringify({ check: 'live-payment-methods', ...capabilityCheck }));
const requiredPaymentMethods = [
  'qrph',
  ...(env.EXPO_PUBLIC_PAYMONGO_GCASH_ENABLED === 'true' ? ['gcash'] : []),
];
const missingPaymentMethods = requiredPaymentMethods.filter((method) => !activePaymentMethods.includes(method));
if (missingPaymentMethods.length) {
  throw new Error(`Required live PayMongo methods are inactive: ${missingPaymentMethods.join(', ')}.`);
}

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) },
});
const signedIn = await supabase.auth.signInWithPassword({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD });
if (signedIn.error || !signedIn.data.user) throw new Error(`Supabase test-user sign-in failed: ${signedIn.error?.message ?? 'unknown error'}`);

try {
  for (const method of ['gcash', 'qrph']) {
    const response = await supabase.functions.invoke(`paymongo-create-${method}-checkout`, {
      body: { reservationId: '00000000-0000-0000-0000-000000000000' },
    });
    const errorBody = response.error ? await response.error.context?.json?.().catch(() => null) : null;
    const rejectedBeforeProvider = response.error && /reservation not found/i.test(errorBody?.error ?? '');
    console.log(JSON.stringify({
      check: `${method}-checkout-function`,
      reachable: true,
      authenticated: true,
      rejectedBeforeProvider: Boolean(rejectedBeforeProvider),
    }));
    if (!rejectedBeforeProvider) throw new Error(`${method} checkout function did not return the expected safe reservation rejection.`);
  }
} finally {
  await supabase.auth.signOut({ scope: 'local' });
}
