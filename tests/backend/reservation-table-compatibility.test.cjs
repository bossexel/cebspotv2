const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../remediation/load-client.cjs');
const { getReservationTableAvailability: availability, getLiveReservationTableAvailability: liveAvailability } = load('src/services/reservationTableService.ts', {
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
const confirmed={...legacy,id:'66666666-6666-4666-8666-666666666666',reservation_inventory_verified_at:'2026-10-28T00:00:00Z'};
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

test('legacy venue flags and reserved IDs cannot bypass release verification', async () => {
  const api = client();
  await assert.rejects(availability(legacy,'2030-01-01','prime',api),/verified|discovery-only/);
  assert.equal(api.calls.length,0);
});

test('current table availability remains authoritative, including an empty result', async () => {
  const api = client(['booked'], null);
  assert.equal((await availability(confirmed, '2030-01-01', 'prime', api)).length, 0);
  assert.equal(api.calls.length, 1);
  const liveRow = { table_id: 'free', capacity: 4, booking_policy: 'online_and_walk_ins', operational_state: 'occupied', online_available: false };
  const tables = await availability(confirmed, '2030-01-01', 'prime', {
    rpc: async name => { assert.equal(name, 'get_venue_table_availability'); return { data: [liveRow], error: null }; },
  });
  assert.equal(tables[0].onlineAvailable, false);
  assert.equal(tables[0].state, 'occupied');
});

test('verification-enabled venues never fall back to unverified legacy availability', async () => {
  for (const verification of [null, '2030-01-01T00:00:00Z']) {
    const api = client();
    await assert.rejects(availability({ ...confirmed, reservation_inventory_verified_at: verification }, '2030-01-01', 'prime', api));
    assert.equal(api.calls.length, verification ? 1 : 0);
  }
});

test('network, permission, and unrelated missing-function errors do not enable legacy mode', async () => {
  for (const error of [new Error('Offline'), { code: '42501', message: 'Permission denied' }, { code: 'PGRST202', message: 'Missing a different function' }]) {
    const api = client([], error);
    await assert.rejects(availability(confirmed, '2030-01-01', 'prime', api));
    assert.equal(api.calls.length, 1);
  }
});

test('legacy reserved-ID responses are never consulted for unverified venues', async () => {
  for (const response of [null, {}, ['booked', null], [''], [123]]) {
    const api=client(response);
    await assert.rejects(availability(legacy, '2030-01-01', 'prime', api), /verified|discovery-only/);
    assert.equal(api.calls.length,0);
  }
});

test('legacy availability never invents inventory or enables a disabled venue', async () => {
  for (const table_inventory of [null, {}, { prime: [] }, { prime: [{ capacity: 4 }] }]) {
    const api=client([]);
    await assert.rejects(availability({ ...confirmed, table_inventory }, '2030-01-01', 'prime', api),/verified|discovery-only/);
    assert.equal(api.calls.length,0);
  }
  await assert.rejects(availability({ ...confirmed, is_reservable: false }, '2030-01-01', 'prime', client([])),/verified|discovery-only/);
});

test('checkout re-reads current inventory and stops after an owner makes it walk-in-only', async () => {
  const api=client([]),reads=[];
  api.from=table=>({select:fields=>({eq:(key,value)=>({maybeSingle:async()=>{
    reads.push({table,fields,key,value});
    return {data:{...confirmed,table_inventory:{prime:[{tableId:'owner-changed-table',capacity:2,bookingPolicy:'walk_in_only'}]}},error:null};
  }})})});
  await assert.rejects(liveAvailability(confirmed.id,'2030-01-01','prime',api),/verified|discovery-only/);
  assert.deepEqual(reads,[{table:'spots',fields:'*',key:'id',value:confirmed.id}]);
  assert.equal(api.calls.length,0);
});

test('checkout never checks or books tables after a missing venue, changed identity or failed inventory read', async () => {
  for(const result of [{data:null,error:null},{data:{...legacy,id:'other-venue'},error:null},{data:null,error:Error('Network request failed')}]){
    const api=client([]);api.from=()=>({select:()=>({eq:()=>({maybeSingle:async()=>result})})});
    await assert.rejects(liveAvailability(legacy.id,'2030-01-01','prime',api));assert.equal(api.calls.length,0);
  }
  for(const slot of [null,'','unknown']){
    const api=client([]);await assert.rejects(liveAvailability(legacy.id,'2030-01-01',slot,api),/choose a reservation time slot/);
    assert.equal(api.calls.length,0);
  }
});
