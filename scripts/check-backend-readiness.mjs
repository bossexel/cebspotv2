import fs from 'node:fs';
import path from 'node:path';

const profileArgumentIndex = process.argv.indexOf('--profile');
const profile = profileArgumentIndex >= 0
  ? process.argv[profileArgumentIndex + 1]
  : process.env.EAS_BUILD_PROFILE || 'local';
const releaseProfile = profile === 'preview' || profile === 'production';

function loadLocalEnvironment() {
  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function isPrivateHost(hostname) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.local')) {
    return true;
  }

  if (/^(127\.|0\.0\.0\.0$|10\.|192\.168\.)/.test(normalized)) {
    return true;
  }

  const match = normalized.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function parseUrl(name, rawValue, { requirePublicHttps = false } = {}) {
  if (!rawValue) {
    throw new Error(`${name} is missing.`);
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }

  if (requirePublicHttps && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS for ${profile} builds.`);
  }

  if (requirePublicHttps && isPrivateHost(parsed.hostname)) {
    throw new Error(`${name} must use a public host for ${profile} builds.`);
  }

  return parsed.toString().replace(/\/$/, '');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Timed out while reaching ${new URL(url).host}.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requireOk(label, url, options) {
  let response;
  try {
    response = await fetchWithTimeout(url, options);
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : error instanceof Error
        ? error.message
        : String(error);
    throw new Error(`${label} could not be reached (${new URL(url).host}): ${cause}`);
  }

  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  console.log(`OK  ${label}`);
  return response;
}

async function main() {
  if (!releaseProfile) {
    loadLocalEnvironment();
  }

  const supabaseUrl = parseUrl(
    'EXPO_PUBLIC_SUPABASE_URL',
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    { requirePublicHttps: releaseProfile },
  );
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.');
  }

  if (releaseProfile && !process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) {
    throw new Error('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is missing.');
  }

  const supabaseHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };

  console.log(`Checking CebSpot ${profile} backend readiness...`);
  await requireOk('Supabase Auth', `${supabaseUrl}/auth/v1/health`, {
    headers: { apikey: supabaseKey },
  });
  await requireOk('Supabase spots REST API', `${supabaseUrl}/rest/v1/spots?select=id&limit=1`, {
    headers: supabaseHeaders,
  });
  await requireOk('Supabase submissions REST API', `${supabaseUrl}/rest/v1/spot_submissions?select=id&limit=1`, {
    headers: supabaseHeaders,
  });
  await requireOk('Supabase Storage', `${supabaseUrl}/storage/v1/status`, {
    headers: { apikey: supabaseKey },
  });

  const faceBlurUrl = parseUrl(
    'EXPO_PUBLIC_FACE_BLUR_API_URL',
    process.env.EXPO_PUBLIC_FACE_BLUR_API_URL,
    { requirePublicHttps: releaseProfile },
  );
  const faceResponse = await requireOk('Face anonymization service', `${faceBlurUrl}/health`);
  const health = await faceResponse.json();
  if (health.status !== 'ok' || health.service !== 'cebspot-face-anonymizer') {
    throw new Error('Face anonymization health response is not the expected CebSpot service.');
  }

  console.log(`READY  CebSpot ${profile} backend checks passed.`);
}

main().catch((error) => {
  console.error(`NOT READY  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
