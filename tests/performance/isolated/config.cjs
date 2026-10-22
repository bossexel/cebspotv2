'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
function loadEnv(file = process.env.PERF_ENV_FILE || '.env.perf.local') {
  const target = path.resolve(root, file);
  if (!fs.existsSync(target)) return;
  for (const line of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
function number(name, fallback, min = 0, max = 1e7) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min || value > max) throw Error(`Invalid ${name}`);
  return value;
}
function getConfig({ admin = false } = {}) {
  loadEnv();
  const raw = process.env.PERF_SUPABASE_URL;
  if (!raw) throw Error('Missing PERF_SUPABASE_URL: configure .env.perf.local for an isolated backend; application env files are never loaded.');
  let url;
  try { url = new URL(raw); } catch { throw Error('Invalid PERF_SUPABASE_URL'); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Target must be a bare origin without credentials');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || (!local && url.protocol !== 'https:')) throw Error('Invalid target protocol');
  if (process.env.PERF_ISOLATED_ACK !== 'yes') throw Error('Set PERF_ISOLATED_ACK=yes only after verifying a dedicated test environment and disabled outbound notifications.');
  if (!local && (process.env.PERF_ENVIRONMENT !== 'staging' || process.env.PERF_ALLOWED_ORIGIN !== url.origin)) {
    throw Error('Hosted target requires PERF_ENVIRONMENT=staging and exact PERF_ALLOWED_ORIGIN confirmation.');
  }
  const key = process.env.PERF_ANON_KEY;
  if (!key) throw Error('Missing PERF_ANON_KEY');
  const service = process.env.PERF_SERVICE_ROLE_KEY;
  if (admin && !service) throw Error('Missing PERF_SERVICE_ROLE_KEY for isolated fixture setup/audit/cleanup (never used by virtual users).');
  const levels = (process.env.PERF_VU_LEVELS || '1,5,10,25,50').split(',').map(Number);
  if (levels[0] !== 1 || levels.some(v => !Number.isInteger(v) || v < 1 || v > 200) || levels.some((v, i) => i && v <= levels[i - 1])) throw Error('VU levels must start at 1 and increase, up to 200');
  if (Math.max(...levels) > 50 && process.env.PERF_BREAKPOINT_ACK !== 'yes') throw Error('Beyond 50 VUs requires PERF_BREAKPOINT_ACK=yes and a reviewed resource budget.');
  return { root, origin: url.origin, local, key, service,
    environment: local ? 'local' : 'staging', tier: process.env.PERF_HOSTING_TIER || 'unknown', levels,
    ramp: number('PERF_RAMP_SEC', 60, 0, 600), hold: number('PERF_HOLD_SEC', 180, 1, 3600),
    smoke: number('PERF_SMOKE_SEC', 30, 1, 600), recovery: number('PERF_RECOVERY_SEC', 60, 1, 600),
    timeout: number('PERF_TIMEOUT_MS', 15000, 100, 60000), pace: number('PERF_PACE_MS', 700, 0, 10000),
    maxWrites: number('PERF_MAX_WRITES', 10000, 1, 100000),
    manifest: path.resolve(root, process.env.PERF_MANIFEST || 'tests/performance/.private/manifest.json'),
    evidence: path.resolve(root, 'tests/performance/evidence'),
    failureStop: number('PERF_STOP_FAILURE_RATE', 0.05, 0.001, 1),
    maxRss: number('PERF_MAX_GENERATOR_RSS_MB', 1024, 64, 8192),
  };
}
module.exports = { root, loadEnv, number, getConfig };
