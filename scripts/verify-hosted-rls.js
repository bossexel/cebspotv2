#!/usr/bin/env node
'use strict';

const PRIVATE_EVENT_TYPES = [
  'reservation_approved',
  'reservation_reminder',
  'reservation_checked_in',
  'reservation_no_show',
];

function configuredProbe(env) {
  if (env.ALLOW_READONLY_PROBE !== '1') throw new Error('Refusing probe: set ALLOW_READONLY_PROBE=1 to acknowledge read-only access.');
  const base = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  const unrelatedToken = env.UNRELATED_USER_ACCESS_TOKEN;
  if (!base || !anonKey || !unrelatedToken) throw new Error('Missing required probe environment variables.');
  const parsed = new URL(base);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid Supabase URL protocol.');
  return { base: parsed.origin, anonKey, unrelatedToken };
}

async function probeReservationActivity({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const { base, anonKey, unrelatedToken } = configuredProbe(env);
  const query = new URLSearchParams({
    select: 'type',
    limit: '5',
    or: `(${PRIVATE_EVENT_TYPES.map(type => `type.eq.${type}`).join(',')})`,
  });
  const url = `${base}/rest/v1/activities?${query}`;
  const checks = [
    ['anonymous', null],
    ['unrelated_authenticated', unrelatedToken],
  ];
  const results = [];
  for (const [role, token] of checks) {
    const headers = { apikey: anonKey, Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(url, { method: 'GET', headers, redirect: 'error' });
    if (!response.ok) throw new Error(`Read-only ${role} query failed with HTTP ${response.status}.`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error(`Read-only ${role} query returned an invalid response shape.`);
    results.push({ role, returnedRows: rows.length });
  }
  return { safe: results.every(result => result.returnedRows === 0), results };
}

async function main() {
  try {
    const result = await probeReservationActivity();
    for (const check of result.results) console.log(`${check.role}: ${check.returnedRows} private event type rows`);
    if (!result.safe) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Read-only probe failed.');
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
module.exports = { PRIVATE_EVENT_TYPES, probeReservationActivity };
