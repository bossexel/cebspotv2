'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const { getConfig } = require('./config.cjs');
const { preflight } = require('./preflight.cjs');
const { createJourneys, sleep, active } = require('./journeys.cjs');
const { summarize, percentile } = require('./stats.cjs');
const { assertResponse, signIn } = require('./client.cjs');
const { generate } = require('./report.cjs');
async function main() {
  const c = getConfig({ admin: true }), { manifest: m, request, sessions } = await preflight(c);
  if (m.loadStarted) throw Error('This fixture run already started load testing; use a fresh manifest to avoid slot reuse');
  m.loadStarted = new Date().toISOString(); require('./fixtures.cjs').save(c, m);
  const start = Date.now(), output = path.join(c.evidence, m.runId + '-load');
  fs.mkdirSync(output, { recursive: true });
  const raw = path.join(output, 'requests.jsonl');
  if (fs.existsSync(raw)) throw Error('Load evidence already exists for this fixture run; create a fresh fixture run');
  const samples = [], localSamples = [], telemetry = [], phases = [], recoveries = [];
  let phase = 'baseline', vus = 1, stopping = null, integrityViolations = 0, inFlight = 0, peakInFlight = 0;
  function stop(reason) { if (!stopping) { stopping = reason; console.log('Automatic stop: ' + reason); } }
  const ctx = { config: c, manifest: m, request, stop, stopped: () => Boolean(stopping),
    integrity: () => { integrityViolations++; stop('Data integrity violation'); },
    local: (operation, elapsed, valid) => { localSamples.push({ phase, vus, operation, elapsed, valid }); if (!valid) ctx.integrity(); },
    measure: (operation, result, valid, conflict) => {
      const sample = { atMs: Date.now() - start, phase, vus, operation, elapsed: result.elapsed, status: result.status,
        bytes: result.bytes, valid, conflict: Boolean(conflict), timeout: result.timeout };
      samples.push(sample); fs.appendFileSync(raw, JSON.stringify(sample) + '\n');
    },
    photo: process.env.PERF_PHOTO_PATH, video: process.env.PERF_VIDEO_PATH,
    mediaEvery: Number(process.env.PERF_MEDIA_EVERY || 10),
  };
  ctx.mediaEnabled = Boolean(ctx.photo && ctx.video && fs.existsSync(ctx.photo) && fs.existsSync(ctx.video));
  if (!Number.isInteger(ctx.mediaEvery) || ctx.mediaEvery < 1) throw Error('Invalid PERF_MEDIA_EVERY');
  if (ctx.mediaEnabled && process.env.PERF_SYNTHETIC_MEDIA_ACK !== 'yes') throw Error('Media must be synthetic and photo already privacy-processed; set PERF_SYNTHETIC_MEDIA_ACK=yes');
  const journeys = createJourneys(ctx), loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
  let previousCpu = process.cpuUsage(), previousTick = performance.now(), sustainedBad = 0;
  const monitor = setInterval(() => {
    const now = Date.now() - start, cpu = process.cpuUsage(previousCpu), wall = performance.now() - previousTick;
    previousCpu = process.cpuUsage(); previousTick = performance.now();
    const memory = process.memoryUsage(), eventLoopP99Ms = loop.percentile(99) / 1e6; loop.reset();
    telemetry.push({ atMs: now, phase, vus, rssMB: memory.rss / 1048576, heapMB: memory.heapUsed / 1048576,
      cpuOneCorePercent: 100 * (cpu.user + cpu.system) / (wall * 1000), eventLoopP99Ms, inFlight });
    if (memory.rss / 1048576 > c.maxRss || eventLoopP99Ms > 500) stop('Load generator resource limit exceeded; capacity evidence is INCONCLUSIVE');
    const recent = samples.filter(s => s.atMs > now - 15000 && !s.operation.startsWith('audit'));
    const rate = recent.filter(s => !s.valid && !s.conflict).length / recent.length;
    sustainedBad = recent.length >= 20 && rate > c.failureStop ? sustainedBad + 1 : 0;
    if (sustainedBad >= 3) stop('Sustained unexpected failures across rolling 15-second window');
    if (samples.some(s => s.atMs > now - 5000 && [429, 507].includes(s.status))) stop('Backend resource exhaustion response');
  }, 5000);
  process.once('SIGINT', () => stop('Interrupted by operator'));
  process.once('SIGTERM', () => stop('Terminated by operator'));
  async function audit() {
    const keys = new Set(); let violations = 0;
    for (let i = 0; i < m.reservations.length; i += 50) {
      const result = await request('GET', `/rest/v1/reservations?select=id,spot_id,reservation_date,slot_id,table_id,status,user_id&` +
        `id=in.(${m.reservations.slice(i, i + 50).join(',')})`, { admin: true });
      const valid = result.ok && Array.isArray(result.data); ctx.measure('audit_bookings', result, valid, false);
      if (!valid) { stop('Integrity audit unavailable'); return false; }
      for (const row of result.data.filter(active)) {
        const key = [row.spot_id, row.reservation_date, row.slot_id, row.table_id].join('/');
        if (keys.has(key)) violations++; keys.add(key);
      }
    }
    if (violations) { integrityViolations += violations; stop('Overbooking observed'); return false; }
    return true;
  }
  async function probes(label, seconds) {
    phase = label; vus = 1;
    const begin = Date.now(), phaseStart = samples.length;
    let firstPassMs = null, passes = 0;
    const thresholds = Object.fromEntries(['listing_discovery', 'detail', 'availability'].map(operation => {
      const baseline95 = percentile(samples.filter(s => s.phase === 'baseline' && s.operation === operation && s.valid).map(s => s.elapsed), .95);
      const target = operation === 'availability' ? 3000 : 2000;
      return [operation, Math.min(target, Math.max(250, (baseline95 || target) * 1.2))];
    }));
    const spot = m.spots[0], date = new Date(m.created); date.setUTCDate(date.getUTCDate() + 600);
    while (Date.now() - begin < seconds * 1000) {
      const r = await journeys.list();
      const detail = await journeys.call('detail', 'GET', `/rest/v1/spots?select=*&id=eq.${spot.id}`, {}, d => Array.isArray(d) && d.length === 1 && d[0].id === spot.id);
      const available = await journeys.call('availability', 'POST', '/rest/v1/rpc/check_reservation_slot_available', { token: sessions[0].token,
        body: { target_spot_id: spot.id, target_reservation_date: date.toISOString().slice(0, 10), target_slot_id: 'prime', target_table_id: spot.table_inventory.prime[0].tableId } }, d => d === true);
      passes = r.valid && r.elapsed < thresholds.listing_discovery && detail.valid && detail.elapsed < thresholds.detail &&
        available.valid && available.elapsed < thresholds.availability ? passes + 1 : 0;
      if (passes >= 3 && firstPassMs === null) firstPassMs = Date.now() - begin;
      await sleep(1000);
    }
    phases.push({ phase, vus, actualSeconds: (Date.now() - begin) / 1000, requests: samples.length - phaseStart });
    if (label !== 'baseline') recoveries.push({ phase: label, sustainedThreeProbeRecoveryMs: firstPassMs,
      baselineThresholdsMs: thresholds, deadlineMs: 60000, status: firstPassMs === null ? (seconds >= 60 ? 'FAIL' : 'INCONCLUSIVE') : firstPassMs <= 60000 ? 'PASS' : 'FAIL' });
  }
  async function runLevel(count, ramp, hold) {
    const levelStart = Date.now(), offset = samples.length;
    phase = count === 1 ? 'smoke' : 'load'; vus = count;
    const workers = Array.from({ length: count }, (_, index) => (async () => {
      await sleep(ramp * 1000 * (count === 1 ? 0 : index / (count - 1)));
      let session = sessions[index];
      while (!stopping && Date.now() < levelStart + (ramp + hold) * 1000) {
        if (session.expires < Date.now() + 60000) session = sessions[index] = await signIn(request, m.users[index]);
        inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
        try { await journeys.readJourney(session, index); if (!stopping) await journeys.writeJourney(session, index); }
        catch { stop('Journey exception; inspect sanitized evidence and configuration'); }
        finally { inFlight--; }
        if (!stopping) await sleep(c.pace);
      }
    })());
    await Promise.all(workers);
    phases.push({ phase, vus: count, rampSeconds: ramp, holdSeconds: hold, actualSeconds: (Date.now() - levelStart) / 1000,
      requests: samples.length - offset, actualRps: (samples.length - offset) / ((Date.now() - levelStart) / 1000), peakInFlight });
    await audit();
    const levelSamples = samples.slice(offset).filter(s => !s.operation.startsWith('audit'));
    if (levelSamples.length && levelSamples.filter(s => !s.valid && !s.conflict).length / levelSamples.length >= .01) stop('Level failed provisional unexpected-failure target');
    for (const op of ['listing_discovery', 'listing_page', 'detail', 'availability', 'reservation_create']) {
      const p95 = percentile(levelSamples.filter(s => s.operation === op && !s.conflict).map(s => s.elapsed), .95);
      if (p95 !== null && p95 >= (['availability', 'reservation_create'].includes(op) ? 3000 : 2000)) stop('Level failed provisional latency target');
    }
    await probes('recovery_' + count, c.recovery); // Recovery is measured even after a safety stop.
  }
  let fatal = null;
  try {
    await probes('baseline', 10);
    for (const count of c.levels) {
      if (stopping) break;
      console.log(`Starting ${count === 1 ? 'smoke' : 'load'}: ${count} VUs`);
      await runLevel(count, count === 1 ? 0 : c.ramp, count === 1 ? c.smoke : c.hold);
    }
  } catch (e) { fatal = e.message; stop('Fatal test exception'); }
  finally {
    clearInterval(monitor); loop.disable();
    const elapsedSeconds = (Date.now() - start) / 1000;
    const result = { kind: 'isolated-api-load', runId: m.runId, dateUtc: new Date().toISOString(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: c.root, encoding: 'utf8' }).trim(), workingTree: 'dirty; use source-manifest.json from local evidence collection',
      environment: c.environment, hostingTier: c.tier, node: process.version, origin: c.origin,
      dataset: { spots: m.spots.length, accounts: m.users.length, reviews: m.reviews.length, completedHistory: m.history?.length || 0, reservableSpots: 21, tablesPerSlot: 20 },
      config: { levels: c.levels, ramp: c.ramp, hold: c.hold, smoke: c.smoke, recovery: c.recovery, pace: c.pace, timeout: c.timeout },
      elapsedSeconds, totalRequests: samples.length, actualRps: samples.length / elapsedSeconds,
      phases, summaries: summarize(samples, elapsedSeconds), localSummaries: summarize(localSamples, elapsedSeconds), recoveries,
      integrityViolations, stopped: stopping, fatal, media: { enabled: ctx.mediaEnabled, anonymization: 'preprocessed synthetic fixture; face processing NOT TESTED' },
      monitoring: { serverCpu: 'NOT TESTED', serverMemory: 'NOT TESTED', databaseMetrics: 'NOT TESTED' }, telemetry };
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(output, 'report.md'), generate(result));
    console.log(JSON.stringify({ output, totalRequests: samples.length, stopped: stopping }));
    if (stopping) process.exitCode = 1;
  }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { main };
