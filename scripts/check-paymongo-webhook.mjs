import crypto from 'node:crypto';
import fs from 'node:fs';

const env = { ...process.env };
for (const file of ['.env.local', '.env.test.local']) {
  if (!fs.existsSync(file)) continue;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && env[match[1]] === undefined) {
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

if (!env.EXPO_PUBLIC_SUPABASE_URL || !env.PAYMONGO_SECRET_KEY || !env.PAYMONGO_WEBHOOK_SECRET) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL, PAYMONGO_SECRET_KEY, and PAYMONGO_WEBHOOK_SECRET are required.');
}

const livemode = env.PAYMONGO_SECRET_KEY.startsWith('sk_live_');

const payload = JSON.stringify({
  data: {
    id: 'evt_cebspot_deployment_probe',
    type: 'event',
    attributes: {
      type: 'cebspot.deployment.probe',
      livemode,
      data: { id: 'probe_untracked', type: 'probe' },
    },
  },
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = crypto
  .createHmac('sha256', env.PAYMONGO_WEBHOOK_SECRET)
  .update(`${timestamp}.${payload}`)
  .digest('hex');
const endpoint = `${env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/paymongo-webhook`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'paymongo-signature': livemode
      ? `t=${timestamp},te=,li=${signature}`
      : `t=${timestamp},te=${signature},li=`,
  },
  body: payload,
  signal: AbortSignal.timeout(20_000),
});

const responseBody = await response.json().catch(() => null);
console.log(JSON.stringify({ mode: livemode ? 'live' : 'test', status: response.status, body: responseBody }));

if (!response.ok || responseBody?.received !== true || responseBody?.ignored !== true) {
  process.exitCode = 1;
}
