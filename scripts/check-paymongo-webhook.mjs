import crypto from 'node:crypto';
import guard from './paymongo-test-key-guard.cjs';
const { assertPayMongoTestKey } = guard;

const env = { ...process.env };

if (!env.EXPO_PUBLIC_SUPABASE_URL || !env.PAYMONGO_SECRET_KEY || !env.PAYMONGO_TEST_WEBHOOK_SECRET) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL, PAYMONGO_SECRET_KEY, and PAYMONGO_TEST_WEBHOOK_SECRET are required.');
}
assertPayMongoTestKey(env.PAYMONGO_SECRET_KEY);

const payload = JSON.stringify({
  data: {
    id: 'evt_cebspot_deployment_probe',
    type: 'event',
    attributes: {
      type: 'cebspot.deployment.probe',
      livemode: false,
      data: { id: 'probe_untracked', type: 'probe' },
    },
  },
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = crypto
  .createHmac('sha256', env.PAYMONGO_TEST_WEBHOOK_SECRET)
  .update(`${timestamp}.${payload}`)
  .digest('hex');
const endpoint = `${env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/paymongo-webhook`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'paymongo-signature': `t=${timestamp},te=${signature}`,
  },
  body: payload,
  signal: AbortSignal.timeout(20_000),
});

const responseBody = await response.json().catch(() => null);
console.log(JSON.stringify({ mode: livemode ? 'live' : 'test', status: response.status, body: responseBody }));

if (!response.ok || responseBody?.received !== true || responseBody?.ignored !== true) {
  process.exitCode = 1;
}
