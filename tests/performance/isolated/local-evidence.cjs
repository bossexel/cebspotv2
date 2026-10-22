'use strict';
// Runs only local source/handler tests. Never loads application env files or contacts deployed services.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { root } = require('./config.cjs');
const { discoveryLogic, loadTs } = require('./app-logic.cjs');
const { percentile } = require('./stats.cjs');
const { fixture, pendingPayment } = require('../../backend/payment-harness.cjs');
async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'), dir = path.join(root, 'tests/performance/evidence', 'local-' + stamp);
  fs.mkdirSync(dir, { recursive: true });
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'app', 'src', 'supabase', 'tests/backend', 'tests/performance/isolated', '*.sql', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8', maxBuffer: 5e6 }).trim().split(/\r?\n/);
  const hashes = [...new Set(tracked)].filter(f => fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).isFile()).sort().map(file => ({ file,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') }));
  fs.writeFileSync(path.join(dir, 'source-manifest.json'), JSON.stringify(hashes, null, 2));
  const backendFiles = fs.readdirSync(path.join(root, 'tests/backend')).filter(f => f.endsWith('.test.cjs')).map(f => 'tests/backend/' + f);
  const runs = [];
  for (const [name, files] of [['backend-regression', backendFiles], ['suite-self-tests', ['tests/performance/isolated/suite.test.cjs']]]) {
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 5e6 });
    // These tests use fixture-only credentials. Only TAP output is retained; no application configuration is read.
    const tap = (run.stdout || '') + (run.stderr || '');
    fs.writeFileSync(path.join(dir, name + '.tap'), tap);
    const count = key => Number(tap.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] || 0);
    runs.push({ name, exitCode: run.status, tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped'),
      durationMs: Number(tap.match(/^# duration_ms ([\d.]+)$/m)?.[1] || 0) });
  }
  const logic = discoveryLogic(), { rankSimilarSpots } = loadTs('src/utils/similarSpots.ts');
  const benchmark = [], benchmarkSamples = [];
  for (const count of [500, 1000, 5000]) {
    const spots = Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Synthetic cafe ${i}`, category: i % 2 ? 'Cafe' : 'Outdoor',
      categories: ['Social Hub'], address: 'Synthetic Cebu', latitude: 10.3 + (i % 40) * .001, longitude: 123.9 + (i % 40) * .001,
      rating: (i % 51) / 10, review_count: i % 100, is_public: true, created_at: '2026-01-01T00:00:00Z' }));
    const enhanced = logic.enhance(spots);
    for (const [operation, execute, validate] of [
      ['client_search_filter', () => logic.filter(enhanced, 'cafe', { category: 'Cafe', minRating: 3, maxDistance: 10 }),
        rows => rows.length > 0 && rows.every(r => r.category === 'Cafe' && r.rating >= 3 && r.distanceValue <= 10)],
      ['client_recommendations', () => rankSimilarSpots(spots[0], spots), rows => rows.length === 6 && rows.every(r => r.spot.id !== spots[0].id && r.spot.is_public)],
    ]) {
      for (let warm = 0; warm < 10; warm++) execute();
      const samples = []; let failures = 0;
      for (let i = 0; i < 100; i++) {
        const begin = performance.now(), rows = execute(), elapsedMs = performance.now() - begin, valid = validate(rows);
        samples.push(elapsedMs); if (!valid) failures++;
        benchmarkSamples.push({ operation, datasetSize: count, iteration: i, elapsedMs, valid });
      }
      benchmark.push({ operation, datasetSize: count, iterations: 100, avgMs: samples.reduce((a, b) => a + b, 0) / samples.length,
        medianMs: percentile(samples, .5), p95Ms: percentile(samples, .95), p99Ms: percentile(samples, .99), validationFailures: failures,
        status: failures ? 'FAIL' : 'PASS', interpretation: 'Desktop Node source-algorithm microbenchmark; no API or Android frame-time claim' });
    }
  }
  const paymentReplays = [], replaySamples = [];
  for (const concurrency of [1, 5, 10, 25, 50]) {
    let rowViolations = 0, stateViolations = 0, timestampRewrites = 0, unexpectedFailures = 0, requests = 0;
    const begin = performance.now();
    const fixtures = Array.from({ length: concurrency }, () => fixture({ payments: [pendingPayment] }));
    await Promise.all(fixtures.map(async (f, vu) => {
      const firstStart = performance.now(), first = await f.webhook(f.event()); requests++; if (first.status !== 200) unexpectedFailures++;
      replaySamples.push({ concurrency, vu, repeat: -1, operation: 'mock_signed_paid_event_initial', elapsedMs: performance.now() - firstStart, status: first.status });
      const firstPaidAt = f.db.reservation_payments[0].paid_at;
      await new Promise(resolve => setTimeout(resolve, 25));
      for (let repeat = 0; repeat < 20; repeat++) {
        const started = performance.now(), response = await f.webhook(f.event()); requests++;
        replaySamples.push({ concurrency, vu, repeat, operation: 'mock_signed_paid_event_retry', elapsedMs: performance.now() - started, status: response.status });
        if (response.status !== 200) unexpectedFailures++;
      }
      if (f.db.reservation_payments.length !== 1 || f.db.reservations.length !== 1) rowViolations++;
      if (f.db.reservation_payments[0].amount !== 150 || f.db.reservations[0].payment_status !== 'paid' || f.db.reservations[0].status !== 'confirmed') stateViolations++;
      if (f.db.reservation_payments[0].paid_at !== firstPaidAt) timestampRewrites++;
    }));
    const elapsedMs = performance.now() - begin;
    const latencies = replaySamples.filter(s => s.concurrency === concurrency).map(s => s.elapsedMs);
    paymentReplays.push({ concurrency, signedHandlerInvocations: requests, elapsedMs, rowViolations, stateViolations, unexpectedFailures,
      avgMs: latencies.reduce((a, b) => a + b, 0) / latencies.length, medianMs: percentile(latencies, .5),
      p95Ms: percentile(latencies, .95), p99Ms: percentile(latencies, .99), failureRate: unexpectedFailures / requests,
      achievedHandlerInvocationsPerSecond: requests / (elapsedMs / 1000),
      firstPaidTimestampRewrites: timestampRewrites, duplicateRowsAndFinalStateStatus: rowViolations || stateViolations || unexpectedFailures ? 'FAIL' : 'PASS',
      auditTimestampIdempotencyStatus: timestampRewrites ? 'FAIL' : 'PASS',
      scope: 'Actual TS handlers under Node; in-memory database/provider; 20 retries per synthetic fixture, no network, no RLS or financial settlement evidence' });
  }
  fs.writeFileSync(path.join(dir, 'algorithm-samples.jsonl'), benchmarkSamples.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'mock-replay-samples.jsonl'), replaySamples.map(r => JSON.stringify(r)).join('\n') + '\n');
  const summary = { kind: 'local-source-and-mocked-handler-evidence', dateUtc: new Date().toISOString(),
    localDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', dateStyle: 'short', timeStyle: 'long' }).format(new Date()),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), workingTree: 'dirty; exact file hashes in source-manifest.json',
    node: process.version, typescript: require('typescript/package.json').version, os: os.platform() + ' ' + os.release(), cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length, totalMemoryMB: os.totalmem() / 1048576,
    httpRequests: 0, backendLoadStatus: 'NOT TESTED', runs, algorithmBenchmarks: benchmark, mockedPaymentReplays: paymentReplays };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ evidence: path.relative(root, dir), runs, algorithmBenchmarks: benchmark, mockedPaymentReplays: paymentReplays }, null, 2));
  if (runs.some(r => r.exitCode !== 0) || benchmark.some(r => r.validationFailures) ||
    paymentReplays.some(r => r.auditTimestampIdempotencyStatus === 'FAIL' || r.duplicateRowsAndFinalStateStatus === 'FAIL')) process.exitCode = 1;
}
if (require.main === module) main().catch(() => { console.error('Local evidence collection failed; inspect scripts and prerequisites. No remote tests were run.'); process.exitCode = 1; });
module.exports = { main };
