const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function publicEnvironment(file) {
  const result = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
    if (!match || !match[2]) continue;
    if (!match[1].startsWith('EXPO_PUBLIC_') && !['CEBSPOT_RUNTIME_ENV','CEBSPOT_STAGING_PROJECT_REF'].includes(match[1])) continue;
    result[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return result;
}
function validate(env, forbidden = [], mode = 'staging') {
  const isBeta = mode === 'public-beta';
  if (env.CEBSPOT_RUNTIME_ENV !== (isBeta ? 'public-beta' : 'staging')) throw Error('Explicit isolated staging configuration is required.');
  const ref = isBeta ? env.CEBSPOT_BETA_ALLOWED_SUPABASE_REF : env.CEBSPOT_STAGING_PROJECT_REF;
  if (!/^[a-z0-9]{20}$/.test(ref ?? '')) throw Error(isBeta ? 'Set the pinned public beta Supabase project reference.' : 'Set the isolated staging project reference.');
  let url, face;
  try { url = new URL(env.EXPO_PUBLIC_SUPABASE_URL); face = new URL(env.EXPO_PUBLIC_FACE_BLUR_API_URL); } catch { throw Error('Configure HTTPS staging backend and face-service URLs.'); }
  const betaFaceHost = env.CEBSPOT_BETA_ALLOWED_FACE_HOST;
  if (url.href !== `https://${ref}.supabase.co/` || face.protocol !== 'https:' || face.username || face.password || face.search || face.hash || (isBeta && (!betaFaceHost || face.host !== betaFaceHost))) throw Error(isBeta ? 'Public beta target does not match its pinned Supabase and face-service targets.' : 'Staging target validation failed.');
  if (!isBeta && forbidden.some(value => { try { return new URL(value).host === url.host || new URL(value).host === face.host; } catch { return false; } })) throw Error('The existing hosted backend/service cannot be used as isolated staging.');
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  let anonymous = false;
  try { anonymous = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; } catch { /* Publishable keys use another format. */ }
  if (!anonymous && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw Error('A public staging Supabase key is required.');
  for (const [name, value] of Object.entries(env)) {
    let privilegedJwt = false;
    try { privilegedJwt = JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role === 'service_role'; } catch { /* Other public settings are not JWTs. */ }
    if (name.startsWith('EXPO_PUBLIC_') && value && (privilegedJwt || /SECRET|SERVICE_ROLE|PASSWORD|WORKER_TOKEN/.test(name) || /^(sk_live_|sk_test_|sb_secret_)/.test(value))) throw Error('A private credential must not be public.');
  }
  if (env.EXPO_PUBLIC_PAYMONGO_PUBLIC_KEY && !env.EXPO_PUBLIC_PAYMONGO_PUBLIC_KEY.startsWith('pk_test_')) throw Error('PayMongo public credentials must use test mode.');
  if (env.EXPO_PUBLIC_CEBSPOT_TARGET === 'admin-web') throw Error('Android release configuration cannot target admin web.');
  return true;
}
function forbiddenTargets() {
  const file = path.join(root, '.env.local');
  if (!fs.existsSync(file)) return [];
  const env = publicEnvironment(file);
  return [env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_FACE_BLUR_API_URL].filter(Boolean);
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === 'check-eas') {
      if (['preview','production'].includes(process.env.EAS_BUILD_PROFILE)) validate(process.env, forbiddenTargets());
      if (process.env.EAS_BUILD_PROFILE === 'beta') validate(process.env, [], 'public-beta');
    } else {
      const offline = args.includes('--offline-verification');
      const outputIndex = args.indexOf('--output-dir');
      const output = outputIndex < 0 ? '.codex-tmp/android-candidate' : args[outputIndex + 1];
      if (!output) throw Error('Output directory required.');
      const env = { ...process.env, EXPO_NO_DOTENV: '1', EAS_BUILD_PROFILE: 'preview' };
      for (const key of Object.keys(env)) if (key.startsWith('EXPO_PUBLIC_')) delete env[key];
      if (!offline) {
        const fileIndex = args.indexOf('--env-file');
        if (fileIndex < 0 || !args[fileIndex + 1]) throw Error('Provide a public-only isolated staging env file, or use --offline-verification.');
        Object.assign(env, publicEnvironment(path.resolve(args[fileIndex + 1])));
        validate(env, forbiddenTargets());
      }
      env.EXPO_PUBLIC_CEBSPOT_TARGET = 'android';
      const result = spawnSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'export','--platform','android','--output-dir',output,'--max-workers','1','--clear'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
      if (result.error || result.status !== 0) process.exit(result.status || 1);
      const manifest = { kind: offline ? 'offline-verification-only' : 'staging-export', platform: 'android', backendConfigured: !offline,
        limitation: 'JavaScript/Hermes export, not an installed APK or completed device/provider acceptance.', outputDirectory: output };
      fs.writeFileSync(path.join(root,'tests/remediation/evidence/final-android-export.json'),JSON.stringify(manifest,null,2)+'\n');
      console.log(JSON.stringify(manifest));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validate, publicEnvironment };
