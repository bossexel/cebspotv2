// Audit probes: read-only data access. Authentication uses only the configured test account.
// No application records, provider sessions, payments, emails or RPC mutations are created.
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'evidence');
const env = { ...process.env };
for (const file of ['.env.local', '.env.test.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const base = env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const results = [];
async function req(label, url, opts = {}) {
  const start = performance.now();
  try {
    const response = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => null);
    const entry = { label, status: response.status, ms: Math.round(performance.now() - start) };
    if (!response.ok) entry.errorCode = data?.code || data?.error_code || data?.errors?.[0]?.code || 'http-error';
    results.push(entry);
    return { response, data, entry };
  } catch (e) {
    results.push({ label, networkError: e.cause?.code || e.name, ms: Math.round(performance.now() - start) });
    return {};
  }
}
function headers(token = key) { return { apikey: key, Authorization: `Bearer ${token}` }; }
async function table(role, name, query, token, predicate) {
  const { data, entry } = await req(`${role}:${name}`, `${base}/rest/v1/${name}?${query}&limit=5`, { headers: headers(token) });
  if (Array.isArray(data)) {
    entry.rowsReturnedCappedAt5 = data.length;
    if (predicate) entry.unexpectedRows = data.filter(predicate).length;
  }
}
async function main() {
  if (!base || !key) throw Error('Missing application backend configuration');
  const settings = await req('auth-settings', `${base}/auth/v1/settings`, { headers: headers() });
  if (settings.data && settings.entry.status === 200) settings.entry.configuration = {
    signupDisabled: settings.data.disable_signup, emailAutoconfirm: settings.data.mailer_autoconfirm,
    emailEnabled: settings.data.external?.email, googleEnabled: settings.data.external?.google,
  };
  await req('auth-health', `${base}/auth/v1/health`, { headers: headers() });
  await table('anonymous', 'spots', 'select=id&is_public=eq.false');
  for (const name of ['profiles', 'reservations', 'reservation_payments', 'owner_access_requests', 'owner_spot_access', 'circles', 'walk_in_visits']) {
    await table('anonymous', name, name === 'owner_spot_access' ? 'select=owner_id' : 'select=id');
  }
  await table('anonymous', 'activities', 'select=type&type=in.(reservation_approved,reservation_reminder,reservation_checked_in,reservation_no_show)');
  const { data: spots, entry: spotEntry } = await req('public-spot-inventory', `${base}/rest/v1/spots?select=id,category,is_reservable,reservation_fee,gcash_amount,table_inventory&is_public=eq.true&limit=500`, { headers: headers() });
  if (Array.isArray(spots)) {
    const reservable = spots.filter(s => s.is_reservable);
    spotEntry.count = spots.length;
    spotEntry.reservable = reservable.length;
    spotEntry.reservableWithoutInventory = reservable.filter(s => !Object.values(s.table_inventory || {}).some(v => Array.isArray(v) && v.length)).length;
    spotEntry.zeroGcashWithPositiveFee = reservable.filter(s => s.gcash_amount === 0 && s.reservation_fee > 0).length;
    if (reservable[0]) {
      const r = await req('table-availability-rpc', `${base}/rest/v1/rpc/get_venue_table_availability`, {
        method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ target_spot_id: reservable[0].id }),
      });
      if (Array.isArray(r.data)) r.entry.tablesReturned = r.data.length;
    }
  }
  // Malformed requests are rejected before checkout creation or webhook application.
  for (const name of ['paymongo-create-qrph-checkout', 'paymongo-create-gcash-checkout', 'provision-owner-account', 'paymongo-webhook']) {
    const r = await req(`anonymous-function:${name}`, `${base}/functions/v1/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (r.entry) r.entry.rejected = r.entry.status >= 400;
  }
  if (env.TEST_USER_EMAIL && env.TEST_USER_PASSWORD) {
    const login = await req('configured-test-account-login', `${base}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD }),
    });
    const token = login.data?.access_token;
    const uid = login.data?.user?.id;
    if (token && uid) {
      login.entry.emailConfirmed = !!login.data.user.email_confirmed_at;
      const profile = await req('test-profile-role', `${base}/rest/v1/profiles?select=role&id=eq.${uid}`, { headers: headers(token) });
      if (profile.data?.[0]) profile.entry.role = profile.data[0].role;
      if (profile.data?.[0]?.role === 'user') {
        for (const name of ['reservations', 'reservation_payments']) await table('test-user', name, `select=user_id&user_id=neq.${uid}`, token, r => r.user_id !== uid);
        await table('test-user', 'profiles', `select=id&id=neq.${uid}`, token, r => r.id !== uid);
        await table('test-user', 'walk_in_visits', 'select=id', token);
        await table('test-user', 'activities', `select=user_id,type&user_id=neq.${uid}&type=in.(reservation_approved,reservation_reminder,reservation_checked_in,reservation_no_show)`, token, r => r.user_id !== uid);
      }
      await req('test-session-local-logout', `${base}/auth/v1/logout?scope=local`, { method: 'POST', headers: headers(token) });
    }
  }
  if (env.EXPO_PUBLIC_FACE_BLUR_API_URL) await req('face-health', `${env.EXPO_PUBLIC_FACE_BLUR_API_URL.replace(/\/+$/, '')}/health`);
  if (env.PAYMONGO_SECRET_KEY) {
    const authorization = `Basic ${Buffer.from(env.PAYMONGO_SECRET_KEY + ':').toString('base64')}`;
    const r = await req('paymongo-webhook-config', 'https://api.paymongo.com/v1/webhooks', { headers: { authorization } });
    if (Array.isArray(r.data?.data)) r.entry.matches = r.data.data.filter(w => w.attributes?.url === `${base}/functions/v1/paymongo-webhook`).map(w => ({ live: w.attributes.livemode, status: w.attributes.status, events: w.attributes.events, localSecretMatches: w.attributes.secret_key ? w.attributes.secret_key === env.PAYMONGO_WEBHOOK_SECRET : 'not-returned' }));
  }
  fs.mkdirSync(out, { recursive: true });
  const report = { kind: 'read-only-live-probes', date: '2026-10-11 Asia/Manila', keyMode: env.PAYMONGO_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test-or-unset', results };
  fs.writeFileSync(path.join(out, 'live-readonly.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (results.some(r => r.networkError)) process.exitCode = 2;
}
main().catch(e => { console.error(e.name); process.exitCode = 1; });
