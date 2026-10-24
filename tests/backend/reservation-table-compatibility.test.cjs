const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../remediation/load-client.cjs');
const { getReservationTableAvailability: availability } = load('src/services/reservationTableService.ts', {
  '../lib/supabase': { supabase: {} },
});

const missing = { code: 'PGRST202', message: 'Could not find the function public.get_venue_table_availability in the schema cache' };
const legacy = {
  id: 'legacy-venue', is_public: true, is_reservable: true,
  table_inventory: { prime: [
    { tableId: 'free', capacity: 4 },
    { tableId: 'booked', capacity: 4 },
    { tableId: 'disabled', capacity: 4, isReserved: true },
    { tableId: 'walk-in', capacity: 4, bookingPolicy: 'walk_in_only' },
  ], late: [{ tableId: 'other-slot', capacity: 6 }] },
};
function client(reserved = ['booked'], venueError = missing, reservedError = null) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'get_venue_table_availability') return { data: [], error: venueError };
      assert.equal(name, 'get_reserved_table_ids');
      return { data: reserved, error: reservedError };
    },
  };
}

test('legacy booking uses live reserved IDs with stored tables and their policies', async () => {
  const api = client();
  const tables = await availability(legacy, '2030-01-01', 'prime', api);
  assert.equal(tables.length, 4);
  assert.equal(tables.find(t => t.tableId === 'free').onlineAvailable, true);
  for (const id of ['booked', 'disabled', 'walk-in']) {
    assert.equal(tables.find(t => t.tableId === id).onlineAvailable, false);
  }
  assert.equal(tables.find(t => t.tableId === 'booked').state, 'due');
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls[1])), {
    name: 'get_reserved_table_ids',
    args: { target_spot_id: 'legacy-venue', target_reservation_date: '2030-01-01', target_slot_id: 'prime' },
  });
});

test('current table availability remains authoritative, including an empty result', async () => {
  const api = client(['booked'], null);
  assert.equal((await availability(legacy, '2030-01-01', 'prime', api)).length, 0);
  assert.equal(api.calls.length, 1);
  const liveRow = { table_id: 'free', capacity: 4, booking_policy: 'online_and_walk_ins', operational_state: 'occupied', online_available: false };
  const tables = await availability(legacy, '2030-01-01', 'prime', {
    rpc: async name => { assert.equal(name, 'get_venue_table_availability'); return { data: [liveRow], error: null }; },
  });
  assert.equal(tables[0].onlineAvailable, false);
  assert.equal(tables[0].state, 'occupied');
});

test('verification-enabled venues never fall back to unverified legacy availability', async () => {
  for (const verification of [null, '2030-01-01T00:00:00Z']) {
    const api = client();
    await assert.rejects(availability({ ...legacy, reservation_inventory_verified_at: verification }, '2030-01-01', 'prime', api));
    assert.equal(api.calls.length, 1);
  }
});

test('network, permission, and unrelated missing-function errors do not enable legacy mode', async () => {
  for (const error of [new Error('Offline'), { code: '42501', message: 'Permission denied' }, { code: 'PGRST202', message: 'Missing a different function' }]) {
    const api = client([], error);
    await assert.rejects(availability(legacy, '2030-01-01', 'prime', api));
    assert.equal(api.calls.length, 1);
  }
});

test('failed or malformed legacy availability never advertises free tables', async () => {
  for (const response of [null, {}, ['booked', null], [''], [123]]) {
    await assert.rejects(availability(legacy, '2030-01-01', 'prime', client(response)), /could not be verified/);
  }
  await assert.rejects(availability(legacy, '2030-01-01', 'prime', client([], missing, Error('Legacy RPC unavailable'))), /unavailable/);
});

test('legacy availability never invents inventory or enables a disabled venue', async () => {
  for (const table_inventory of [null, {}, { prime: [] }, { prime: [{ capacity: 4 }] }]) {
    const tables = await availability({ ...legacy, table_inventory }, '2030-01-01', 'prime', client([]));
    assert.equal(tables.length, 0);
  }
  const tables = await availability({ ...legacy, is_reservable: false }, '2030-01-01', 'prime', client([]));
  assert.ok(tables.every(t => !t.onlineAvailable));
});
