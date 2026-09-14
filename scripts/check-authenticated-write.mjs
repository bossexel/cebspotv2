import fs from 'node:fs';
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
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !env.TEST_USER_EMAIL || !env.TEST_USER_PASSWORD) {
  console.error('BLOCKED: configure TEST_USER_EMAIL and TEST_USER_PASSWORD in ignored .env.test.local.');
  process.exit(2);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
});
const checks = [];
const marker = 'Connection test ' + randomUUID();
let userId;
let originalName;
let writeAttempted = false;
let originalLoaded = false;

function check(error, label) {
  if (error) throw new Error(`${label} failed (${error.code || error.status || error.name || 'unknown'}).`);
}
async function readProfile() {
  const { data, error } = await client.from('profiles').select('id,display_name').eq('id', userId).single();
  check(error, 'Profile read');
  if (!data) throw new Error('No profile exists for the supplied account.');
  return data;
}

try {
  const started = performance.now();
  const { data, error } = await client.auth.signInWithPassword({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD });
  check(error, 'Sign-in');
  if (!data.user || !data.session) throw new Error('Sign-in did not establish an authenticated session.');
  userId = data.user.id;
  checks.push({ check: 'Authenticated sign-in', ok: true, latencyMs: Math.round(performance.now() - started) });
  const before = await readProfile();
  originalName = before.display_name;
  originalLoaded = true;
  checks.push({ check: 'Read own profile through user permissions', ok: true });

  // Compare-and-set both ways: never overwrite a concurrent edit or another user's row.
  writeAttempted = true;
  let query = client.from('profiles').update({ display_name: marker }).eq('id', userId);
  query = originalName === null ? query.is('display_name', null) : query.eq('display_name', originalName);
  const written = await query.select('id');
  check(written.error, 'Profile write');
  if (written.data?.length !== 1) throw new Error('Profile write did not update exactly one owned row.');
  const after = await readProfile();
  if (after.display_name !== marker) throw new Error('Read-back did not match the temporary value.');
  checks.push({ check: 'Write and read-back under authenticated user permissions', ok: true });
} catch (error) {
  checks.push({ check: 'Authenticated database test', ok: false, error: error.message });
  process.exitCode = 1;
} finally {
  if (writeAttempted && originalLoaded) {
    try {
      const restored = await client.from('profiles').update({ display_name: originalName }).eq('id', userId).eq('display_name', marker);
      check(restored.error, 'Profile restoration');
      if ((await readProfile()).display_name !== originalName) throw new Error('Original profile value could not be verified after cleanup.');
      checks.push({ check: 'Original profile restored and verified', ok: true });
    } catch (error) {
      checks.push({ check: 'Profile cleanup requires attention', ok: false, error: error.message });
      process.exitCode = 1;
    }
  }
  if (userId) {
    const { error } = await client.auth.signOut({ scope: 'local' });
    checks.push({ check: 'Test session signed out', ok: !error });
    if (error) process.exitCode = 1;
  }
  console.log(JSON.stringify({ checks }, null, 2));
}
