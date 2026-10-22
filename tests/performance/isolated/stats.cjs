'use strict';
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}
function summarize(samples, elapsedSeconds) {
  const groups = new Map();
  for (const s of samples) {
    const key = `${s.phase}/${s.vus}/${s.operation}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.values()].map(rows => {
    const times = rows.map(r => r.elapsed);
    const failed = rows.filter(r => !r.valid && !r.conflict).length;
    return { phase: rows[0].phase, vus: rows[0].vus, operation: rows[0].operation,
      requests: rows.length, avgMs: times.reduce((a, b) => a + b, 0) / times.length,
      medianMs: percentile(times, .5), p95Ms: percentile(times, .95), p99Ms: percentile(times, .99),
      unexpectedFailures: failed, failureRate: failed / rows.length, timeouts: rows.filter(r => r.timeout).length,
      expectedConflicts: rows.filter(r => r.conflict).length,
      successfulBookings: rows.filter(r => r.operation === 'reservation_create' && r.valid && !r.conflict).length,
      overallRunContributionRps: rows.length / elapsedSeconds };
  });
}
module.exports = { percentile, summarize };
