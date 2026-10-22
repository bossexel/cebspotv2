'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { getConfig } = require('./config.cjs');
const { client, bookingConflict } = require('./client.cjs');
const { summarize, percentile } = require('./stats.cjs');
const { status, generate } = require('./report.cjs');
function env(values, run) {
  const old = { ...process.env };
  for (const key of Object.keys(process.env)) if (key.startsWith('PERF_')) delete process.env[key];
  Object.assign(process.env, { PERF_ENV_FILE: 'tests/performance/nonexistent.env', ...values });
  try { run(); } finally {
    for (const key of Object.keys(process.env)) if (key.startsWith('PERF_')) delete process.env[key];
    Object.assign(process.env, old);
  }
}
const base = { PERF_SUPABASE_URL: 'http://127.0.0.1:54321', PERF_ANON_KEY: 'fixture-anon', PERF_ISOLATED_ACK: 'yes' };
test('default invocation never inherits application/production env', () => env({}, () => assert.throws(() => getConfig(), /Missing PERF_SUPABASE_URL/)));
test('hosted target requires staging and exact origin acknowledgement', () => {
  env({ ...base, PERF_SUPABASE_URL: 'https://fixture.invalid' }, () => assert.throws(() => getConfig(), /Hosted target/));
  env({ ...base, PERF_SUPABASE_URL: 'https://fixture.invalid', PERF_ENVIRONMENT: 'staging', PERF_ALLOWED_ORIGIN: 'https://fixture.invalid' }, () => assert.equal(getConfig().environment, 'staging'));
});
test('secrets embedded in target URL are rejected', () => env({ ...base, PERF_SUPABASE_URL: 'https://user:password@fixture.invalid' }, () => assert.throws(() => getConfig(), /without credentials/)));
test('resource limits and workload levels are validated', () => {
  env({ ...base, PERF_TIMEOUT_MS: '-1' }, () => assert.throws(() => getConfig(), /PERF_TIMEOUT_MS/));
  env({ ...base, PERF_VU_LEVELS: '5,10' }, () => assert.throws(() => getConfig(), /start at 1/));
  env({ ...base, PERF_VU_LEVELS: '1,100' }, () => assert.throws(() => getConfig(), /reviewed resource budget/));
});
test('expected booking conflicts require the real active-slot constraint', () => {
  assert.equal(bookingConflict({ status: 409, data: { code: '23505', message: 'duplicate key violates reservations_active_table_slot_unique_idx' } }), true);
  assert.equal(bookingConflict({ status: 409, data: { code: '23505', message: 'duplicate primary key' } }), false);
  assert.equal(bookingConflict({ status: 400, data: { message: 'unknown table' } }), false);
});
test('content failures count as unexpected failures and expected conflicts stay separate', () => {
  const rows = [true, false].map(valid => ({ phase: 'load', vus: 5, operation: 'detail', elapsed: 100, valid }));
  rows.push({ phase: 'load', vus: 5, operation: 'detail', elapsed: 200, conflict: true });
  const s = summarize(rows, 2)[0];
  assert.equal(s.requests, 3); assert.equal(s.unexpectedFailures, 1); assert.equal(s.expectedConflicts, 1);
  assert.equal(s.failureRate, 1 / 3); assert.equal(s.overallRunContributionRps, 1.5);
  assert.equal(percentile([], .95), null);
});
test('empty samples and missing race/recovery evidence cannot be reported as capacity PASS', () => {
  assert.equal(status({ operation: 'detail', requests: 0, failureRate: 0, p95Ms: 0 }), 'INCONCLUSIVE');
  assert.equal(status({ operation: 'detail', requests: 100, failureRate: 0, p95Ms: 2000 }), 'FAIL');
  const report = generate({ kind: 'isolated-api-load', dataset: {}, summaries: [], phases: [], recoveries: [],
    elapsedSeconds: 1, totalRequests: 0, actualRps: 0, media: { enabled: false } });
  assert.match(report, /INCONCLUSIVE \(complete matching evidence required\)/);
});
test('HTTP latency includes the delayed response body and request timeout is bounded', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.flushHeaders();
    setTimeout(() => res.end('{"valid":true}'), 100);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await client({ origin, key: 'fixture', timeout: 1000 })('GET', '/');
    assert.equal(result.data.valid, true); assert.ok(result.elapsed >= 90);
    const timeout = await client({ origin, key: 'fixture', timeout: 20 })('GET', '/');
    assert.equal(timeout.timeout, true); assert.equal(timeout.ok, false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('actual discovery code supports address, secondary category, rating and distance filters', () => {
  const { discoveryLogic } = require('./app-logic.cjs'), logic = discoveryLogic();
  const spots = [
    { id: 'a', name: 'Alpha', address: 'Cebu Market', category: 'Cafe', categories: ['Outdoor'], rating: 4, review_count: 2, distanceValue: 2 },
    { id: 'b', name: 'Beta', address: 'Cebu Market', category: 'Cafe', categories: [], rating: 2, review_count: 1, distanceValue: 1 },
    { id: 'c', name: 'Gamma', address: 'Cebu Market', category: 'Outdoor', categories: [], rating: 5, review_count: 3, distanceValue: 30 },
  ];
  assert.deepEqual(logic.filter(spots, '  MARKET ', { category: 'Outdoor', minRating: 3, maxDistance: 10 }).map(s => s.id), ['a']);
  assert.deepEqual(logic.filter(spots, 'outdoor', { category: 'All', minRating: 0, maxDistance: 50 }).map(s => s.id), ['a', 'c']);
});
test('actual recommendation ranking excludes source, private and unrelated candidates', () => {
  const { loadTs } = require('./app-logic.cjs'), { rankSimilarSpots } = loadTs('src/utils/similarSpots.ts');
  const source = { id: 'source', name: 'Cafe', category: 'Cafe', categories: [], latitude: 10.3, longitude: 123.9, is_public: true };
  const rows = rankSimilarSpots(source, [source, { ...source, id: 'private', is_public: false },
    { ...source, id: 'unrelated', category: 'Outdoor' }, { ...source, id: 'match' }]);
  assert.deepEqual(rows.map(r => r.spot.id), ['match']);
});
