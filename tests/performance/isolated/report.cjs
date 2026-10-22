'use strict';
const fs = require('node:fs');
const path = require('node:path');
function target(operation) {
  if (['availability', 'reservation_create'].includes(operation)) return 3000;
  if (['listing_discovery', 'listing_page', 'detail', 'reviews', 'user_reservations'].includes(operation)) return 2000;
  return null;
}
function status(row) {
  const t = target(row.operation);
  if (row.failureRate >= .01 || (t && row.p95Ms >= t)) return 'FAIL';
  return row.requests < 20 ? 'INCONCLUSIVE' : 'PASS';
}
function generate(result, race = null) {
  if (result.kind !== 'isolated-api-load') throw Error('Unsupported evidence kind; legacy results are not combined');
  const required = ['listing_discovery', 'listing_page', 'detail', 'availability', 'reservation_create'];
  const complete = result.phases.filter(p => ['smoke', 'load'].includes(p.phase)).filter(p => {
    const rows = result.summaries.filter(r => r.vus === p.vus && r.phase === p.phase);
    return required.every(op => rows.some(r => r.operation === op && status(r) === 'PASS')) && rows.every(r => status(r) === 'PASS') &&
      result.recoveries.some(r => r.phase === `recovery_${p.vus}` && r.status === 'PASS');
  });
  const highest = !result.stopped && result.integrityViolations === 0 && race?.status === 'PASS' && race.runId === result.runId && result.media.enabled
    ? Math.max(0, ...complete.map(p => p.vus)) : 0;
  const lines = ['# CebSpot isolated API load evidence', '',
    `Commit: ${result.commit}; workspace: ${result.workingTree}. Date UTC: ${result.dateUtc}.`, '',
    `Environment: ${result.environment}; tier: ${result.hostingTier}; Node ${result.node}. Dataset: ${JSON.stringify(result.dataset)}.`, '',
    `Measured HTTP requests: ${result.totalRequests}; elapsed: ${result.elapsedSeconds.toFixed(2)} s; actual achieved RPS: ${result.actualRps.toFixed(2)}. Authentication and fixture provisioning are excluded; audit and recovery requests are included.`, '',
    'Targets below are provisional API targets. Search/filter/ranking run locally; there is no search or recommendations HTTP endpoint in the app.', '',
    '| Operation | Phase | Concurrency | Requests | Avg ms | Median ms | p95 ms | p99 ms | Failure % | Target | Status |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|'];
  for (const row of result.summaries) lines.push(`| ${row.operation} | ${row.phase} | ${row.vus} | ${row.requests} | ${row.avgMs.toFixed(1)} | ${row.medianMs.toFixed(1)} | ${row.p95Ms.toFixed(1)} | ${row.p99Ms.toFixed(1)} | ${(row.failureRate * 100).toFixed(2)} | ${target(row.operation) ? `p95 < ${target(row.operation)} ms; failures < 1%` : 'failures < 1%; latency exploratory'} | ${status(row)} |`);
  lines.push('', `Highest tested load meeting all applicable API, recovery and booking correctness criteria: ${highest || 'INCONCLUSIVE (complete matching evidence required)'}.`, '',
    `Integrity violations: ${result.integrityViolations}. Booking race: ${race?.status || 'NOT TESTED'}. Stop reason: ${result.stopped || 'none'}.`, '',
    `Recovery: ${JSON.stringify(result.recoveries)}.`, '',
    'No maximum capacity is established. A failed initial load level is not an established stress breakpoint. Fewer than 20 samples per operation are marked INCONCLUSIVE; p99 with small samples is unstable.', '',
    'Media uses a synthetic photo already processed for privacy and a synthetic video. Face anonymizer processing is NOT TESTED here. No PayMongo API is called. Payment retry evidence is in the separate mocked handler results.', '',
    'Android UI, server CPU/memory, database utilization, real payment integration and long-term availability are NOT TESTED. Generator telemetry describes this Node process only. Closed-loop pacing can conceal demand during slow responses; a single generator is not distributed load.', '',
    'This report does not establish Security, Data Privacy, Usability, Compatibility, or long-term availability.');
  return lines.join('\n') + '\n';
}
if (require.main === module) {
  try {
    if (!process.argv[2]) throw Error('Provide a summary.json path and optional matching race.json path');
    const file = path.resolve(process.argv[2]), result = JSON.parse(fs.readFileSync(file, 'utf8'));
    const race = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
    if (race && race.runId !== result.runId) throw Error('Run IDs differ');
    fs.writeFileSync(path.join(path.dirname(file), 'report.md'), generate(result, race));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { generate, target, status };
