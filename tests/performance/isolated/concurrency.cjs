'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getConfig, number } = require('./config.cjs');
const { preflight } = require('./preflight.cjs');
const { save } = require('./fixtures.cjs');
const { assertResponse, bookingConflict } = require('./client.cjs');
const { reservation, active } = require('./journeys.cjs');
async function main() {
  const c = getConfig({ admin: true }), { manifest: m, sessions, request } = await preflight(c);
  if (m.raceStarted) throw Error('This fixture run already started a race; use a fresh manifest');
  m.raceStarted = new Date().toISOString(); save(c, m);
  const users = number('PERF_RACE_USERS', 10, 2, Math.min(50, sessions.length));
  const rounds = number('PERF_RACE_ROUNDS', 3, 1, 20), results = [];
  const result = { kind: 'isolated-booking-race', runId: m.runId, users, rounds: results, integrityViolations: 0,
    successfulBookings: 0, expectedConflicts: 0, unexpectedFailures: 0, duplicateBookingEffects: 0, status: 'INCONCLUSIVE' };
  async function rows(date, spotId, tableId) {
    return assertResponse(await request('GET', `/rest/v1/reservations?select=*&spot_id=eq.${spotId}&reservation_date=eq.${date}&slot_id=eq.prime&table_id=eq.${tableId}`, { admin: true }), Array.isArray, 'Race record audit');
  }
  try {
    for (let round = 0; round < rounds; round++) {
      const spot = m.spots[0], table = spot.table_inventory.prime[0];
      const day = new Date(m.created); day.setUTCDate(day.getUTCDate() + 700 + round);
      const date = day.toISOString().slice(0, 10);
      if ((await rows(date, spot.id, table.tableId)).length) throw Error('Race slot is not empty; use fresh fixtures');
      const payloads = sessions.slice(0, users).map(s => reservation(m, s, spot, 0, { date, table }));
      m.reservations.push(...payloads.map(p => p.id)); save(c, m);
      const dispatched = [], begin = performance.now();
      const responses = await Promise.all(payloads.map((body, i) => {
        dispatched.push(performance.now() - begin);
        return request('POST', '/rest/v1/reservations', { token: sessions[i].token, body, headers: { Prefer: 'return=representation' } });
      }));
      const winners = responses.map((r, i) => ({ r, i })).filter(({ r }) => r.ok);
      const conflicts = responses.filter(bookingConflict).length;
      const unexpected = users - winners.length - conflicts;
      const stored = await rows(date, spot.id, table.tableId), live = stored.filter(active);
      let violations = live.length > 1 ? live.length - 1 : 0;
      if (stored.length !== winners.length || winners.some(({ i }) => !stored.some(r => r.id === payloads[i].id && r.user_id === sessions[i].id))) violations++;
      if (responses.some((r, i) => !r.ok && stored.some(row => row.id === payloads[i].id))) violations++;
      if (live.some(r => r.guests > table.capacity || r.guest_count > table.capacity)) violations++;
      const unavailable = await request('POST', '/rest/v1/rpc/check_reservation_slot_available', { token: sessions[0].token,
        body: { target_spot_id: spot.id, target_reservation_date: date, target_slot_id: 'prime', target_table_id: table.tableId } });
      if (!unavailable.ok || unavailable.data !== false) violations++;
      const reserved = await request('POST', '/rest/v1/rpc/get_reserved_table_ids', { token: sessions[0].token,
        body: { target_spot_id: spot.id, target_reservation_date: date, target_slot_id: 'prime' } });
      if (!reserved.ok || !Array.isArray(reserved.data) || !reserved.data.includes(table.tableId)) violations++;
      // Replay the app's create payload without an idempotency key: the slot uniqueness constraint must reject it.
      if (winners.length === 1) {
        const winner = winners[0].i, replay = { ...payloads[winner], id: randomUUID() };
        m.reservations.push(replay.id); save(c, m);
        const repeated = await request('POST', '/rest/v1/reservations', { token: sessions[winner].token, body: replay });
        if (!bookingConflict(repeated) || (await rows(date, spot.id, table.tableId)).length !== 1) { violations++; result.duplicateBookingEffects++; }
        // Verify real user isolation with another authenticated account after a row exists.
        const other = sessions[(winner + 1) % users];
        const hidden = await request('GET', `/rest/v1/reservations?select=id&id=eq.${payloads[winner].id}`, { token: other.token });
        if (!hidden.ok || !Array.isArray(hidden.data) || hidden.data.length !== 0) violations++;
      }
      results.push({ round: round + 1, users, capacityBookings: 1, guestCapacity: table.capacity, successfulBookings: winners.length,
        expectedConflicts: conflicts, unexpectedFailures: unexpected, storedRows: stored.length, activeRows: live.length,
        integrityViolations: violations, dispatchSkewMs: Math.max(...dispatched) - Math.min(...dispatched),
        attempts: responses.map(r => ({ status: r.status, elapsed: r.elapsed, timeout: r.timeout, expectedConflict: bookingConflict(r) })) });
      result.integrityViolations += violations; result.successfulBookings += winners.length;
      result.expectedConflicts += conflicts; result.unexpectedFailures += unexpected;
      if (violations || unexpected || winners.length !== 1) break;
    }
    // Submission creates do not expose an idempotency key. Measure repeated content separately from booking retries.
    if (!result.integrityViolations && !result.unexpectedFailures) {
      const name = `[${m.runId}] Duplicate submission probe`, ids = [randomUUID(), randomUUID()];
      m.submissions.push(...ids); save(c, m);
      const responses = await Promise.all(ids.map(id => request('POST', '/rest/v1/spot_submissions', { token: sessions[0].token,
        body: { id, submitter_id: sessions[0].id, name, category: 'Cafe', categories: ['Cafe'], address: 'Synthetic Cebu fixture',
          latitude: 10.3, longitude: 123.9, images: [], reservation_type: 'free', payment_required: false, is_reservable: false },
        headers: { Prefer: 'return=representation' } })));
      const stored = assertResponse(await request('GET', `/rest/v1/spot_submissions?select=id&id=in.(${ids.join(',')})`, { admin: true }), Array.isArray, 'Duplicate submission audit');
      result.duplicateSubmissionProbe = { attempts: 2, accepted: responses.filter(r => r.ok).length, storedRows: stored.length,
        status: responses.every(r => r.ok) && stored.length === 2 ? 'INCONCLUSIVE' : 'FAIL',
        interpretation: 'Identical-content creates have no idempotency contract; two rows are permitted. This is separate from zero duplicate booking/payment effects.' };
    }
    result.status = result.integrityViolations || result.unexpectedFailures || results.some(r => r.successfulBookings !== 1) ? 'FAIL' : results.length === rounds ? 'PASS' : 'INCONCLUSIVE';
  } catch { result.status = 'INCONCLUSIVE'; result.blocker = 'Concurrency scenario or audit failed; no capacity claim is valid'; }
  finally {
    fs.mkdirSync(c.evidence, { recursive: true });
    const file = path.join(c.evidence, `${m.runId}-race.json`);
    if (fs.existsSync(file)) throw Error('Race evidence already exists; use fresh fixtures');
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ status: result.status, successfulBookings: result.successfulBookings, expectedConflicts: result.expectedConflicts, integrityViolations: result.integrityViolations }));
    if (result.status !== 'PASS') process.exitCode = 1;
  }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { main };
