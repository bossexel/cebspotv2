const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
function load(file, imports = {}) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, Date, Math, require(id) { if (!(id in imports)) throw Error(`Unexpected import: ${id}`); return imports[id]; },
  });
  return exports;
}
const inventory = load('src/utils/tableInventory.ts');
const { venueTableService: service, canSeatWalkIn } = load('src/services/venueTableService.ts', { '../lib/supabase': { supabase: {} } });
const row = overrides => ({ table_id: 'T01', capacity: 4, booking_policy: 'online_and_walk_ins', operational_state: 'free', online_available: true, policy_locked: false, ...overrides });
const client = (data, error = null) => ({ rpc: async () => ({ data, error }) });

test('physical inventory retains the strictest policy across slots and table edits', () => {
  const table = { tableId: 'T01', capacity: 4, isReserved: false };
  const stored = { sunset: [table], prime: [{ ...table, bookingPolicy: 'walk_in_only' }], late: [] };
  assert.equal(inventory.getPhysicalTables(stored)[0].bookingPolicy, 'walk_in_only');
  const updated = inventory.updatePhysicalTable(stored, 'T01', { bookingPolicy: 'walk_in_only', capacity: 6 });
  assert.equal(updated.sunset[0].bookingPolicy, 'walk_in_only');
  assert.equal(updated.prime[0].bookingPolicy, 'walk_in_only');
  assert.equal(stored.sunset[0].bookingPolicy, undefined);
});

test('free tables of either policy fit walk-ins; every unavailable state and undersized party fails', () => {
  for (const bookingPolicy of ['online_and_walk_ins', 'walk_in_only']) {
    const table = { state: 'free', capacity: 4, bookingPolicy };
    assert.equal(canSeatWalkIn(table, 4), true);
    for (const state of ['held', 'due', 'occupied', 'cleaning', 'unavailable']) assert.equal(canSeatWalkIn({ ...table, state }, 2), false);
    for (const size of [0, -1, 5, 101, 1.5, NaN]) assert.equal(canSeatWalkIn(table, size), false);
  }
});

test('availability never promotes walk-in-only or occupied tables, even on inconsistent server data', async () => {
  for (const overrides of [{ booking_policy: 'walk_in_only' }, { operational_state: 'occupied' }, { operational_state: 'cleaning' }]) {
    assert.equal((await service.getAvailability('venue', null, null, client([row(overrides)])))[0].onlineAvailable, false);
  }
  const normalized = (await service.getAvailability('venue', null, null, client([row({ policy_locked: undefined })])))[0];
  assert.equal(normalized.policyLocked, true);
});

test('availability errors and malformed rows fail closed instead of returning demo tables', async () => {
  for (const data of [null, {}, [row({ operational_state: 'unknown' })], [row({ booking_policy: 'unknown' })], [row({ capacity: 0 })]]) {
    await assert.rejects(service.getAvailability('venue', null, null, client(data)), /could not be verified/);
  }
  await assert.rejects(service.getAvailability('venue', null, null, client(null, Error('Offline'))), /Offline/);
});

test('seating sends the table and party size and requires confirmed checked-in data', async () => {
  const calls = [];
  const rpc = { rpc: async (name, input) => { calls.push({ name, input }); return { data: { id: 'visit', table_id: 'T01', party_size: 3, status: 'checked_in' } }; } };
  assert.equal((await service.seatWalkIn('venue', 'T01', 3, rpc)).id, 'visit');
  assert.equal(calls[0].name, 'owner_seat_walk_in');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].input)), { target_spot_id: 'venue', target_table_id: 'T01', party_size_input: 3 });
  await assert.rejects(service.seatWalkIn('venue', 'T01', 3, client(null)), /not confirmed/);
  await assert.rejects(service.seatWalkIn('venue', 'T01', 3, client({ id: 'visit', status: 'checked_in', table_id: 'T02', party_size: 3 })), /not confirmed/);
  await assert.rejects(service.seatWalkIn('venue', 'T01', 3, client(null, Error('Table no longer free'))), /no longer free/);
});

test('completion and readiness cannot report success without confirmed backend state', async () => {
  await service.completeWalkIn('visit', client({ id: 'visit', status: 'completed' }));
  await service.completeReservation('booking', client({ id: 'booking', status: 'completed' }));
  await service.markReady('venue', 'T01', client({ table_id: 'T01', state: 'free' }));
  await assert.rejects(service.completeWalkIn('visit', client(null)), /not confirmed/);
  await assert.rejects(service.completeReservation('booking', client({ id: 'booking', status: 'checked_in' })), /not confirmed/);
  await assert.rejects(service.markReady('venue', 'T01', client({ table_id: 'T01', state: 'cleaning' })), /not confirmed/);
});

test('live updates subscribe to table state and table policy for the selected venue and clean up', () => {
  const events = []; let removed = false;
  const channel = { on: (kind, filter, callback) => { events.push({ kind, filter, callback }); return channel; }, subscribe: () => channel };
  const callback = () => {};
  const unsubscribe = service.subscribe('venue', callback, { channel: () => channel, removeChannel: removedChannel => { removed = removedChannel === channel; } });
  assert.equal(events[0].filter.table, 'venue_table_states');
  assert.equal(events[0].filter.filter, 'spot_id=eq.venue');
  assert.equal(events[1].filter.table, 'spots');
  assert.equal(events[1].filter.filter, 'id=eq.venue');
  assert.equal(events[0].callback, callback);
  unsubscribe(); assert.equal(removed, true);
});
