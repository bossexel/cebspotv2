const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(relativePath, imports = {}) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, require: (id) => {
      if (!(id in imports)) throw Error(`Unexpected import ${id}`);
      return imports[id];
    }, console,
  });
  return exports;
}
const tables = load('src/utils/tableInventory.ts');
const inventory = {
  sunset: [{ tableId:'VIP01', capacity:10, isReserved:false }],
  prime: [{ tableId:'VIP01', capacity:8, isReserved:true }, { tableId:'T01', capacity:2, isReserved:false }],
  late: [],
};

test('physical tables appear once with conservative capacity and availability', () => {
  const result = tables.getPhysicalTables(inventory);
  assert.equal(result.length, 2);
  assert.equal(result[0].tableId, 'VIP01');
  assert.equal(result[0].capacity, 8);
  assert.equal(result[0].isReserved, true);
});

test('owner edits update every stored copy without changing the original draft', () => {
  const result = tables.updatePhysicalTable(inventory, 'VIP01', { capacity:6, isReserved:false });
  assert.equal(result.sunset[0].capacity, 6);
  assert.equal(result.prime[0].capacity, 6);
  assert.equal(result.prime[0].isReserved, false);
  assert.equal(inventory.sunset[0].capacity, 10);
  assert.equal(inventory.prime[0].isReserved, true);
});

test('adding a table preserves inventory and assigns a unique stable ID', () => {
  const result = tables.addPhysicalTable(inventory);
  const physical = tables.getPhysicalTables(result);
  assert.equal(physical.length, 3);
  assert.ok(physical.some((table) => table.tableId === 'T02'));
  assert.ok(physical.some((table) => table.tableId === 'T01'));
  for (const key of ['sunset','prime','late']) assert.equal(result[key].at(-1).tableId, 'T02');
  assert.equal(tables.getPhysicalTables(tables.createEmptyTableInventory()).length, 0);
});

test('saving a lock/release toggle preserves capacity/service drafts and accepts the saved policy', () => {
  const previous = tables.normalizeStoredTableInventory({ sunset: [{ tableId: 'T01', capacity: 4, isReserved: false }] });
  const draft = tables.updatePhysicalTable(previous, 'T01', { capacity: 6, isReserved: true });
  const saved = tables.updatePhysicalTable(previous, 'T01', { bookingPolicy: 'walk_in_only' });
  const merged = tables.mergeTableInventoryDraft(draft, previous, saved);
  assert.equal(merged.sunset[0].capacity, 6);
  assert.equal(merged.sunset[0].isReserved, true);
  assert.equal(merged.sunset[0].bookingPolicy, 'walk_in_only');
  assert.equal(saved.sunset[0].capacity, 4);
  assert.equal(draft.sunset[0].bookingPolicy, 'online_and_walk_ins');
});

test('live inventory refresh accepts untouched server changes without resurrecting removed tables', () => {
  const previous = tables.normalizeStoredTableInventory({ sunset: [
    { tableId: 'T01', capacity: 4, isReserved: false }, { tableId: 'T02', capacity: 2, isReserved: false },
  ] });
  const draft = tables.addPhysicalTable(previous);
  const saved = tables.normalizeStoredTableInventory({ sunset: [{ tableId: 'T01', capacity: 8, isReserved: true, bookingPolicy: 'walk_in_only' }] });
  const merged = tables.mergeTableInventoryDraft(draft, previous, saved);
  assert.equal(merged.sunset[0].capacity, 8);
  assert.equal(merged.sunset[0].isReserved, true);
  assert.equal(merged.sunset[0].bookingPolicy, 'walk_in_only');
  assert.equal(merged.sunset.some(table => table.tableId === 'T02'), false);
  assert.equal(merged.sunset.some(table => table.tableId === 'T03'), true);
});

function serviceFixture(error = null) {
  const updates = [];
  const client = { from: () => ({ update(payload) {
    updates.push(payload);
    return { eq: () => ({ select: () => ({ single: async () => ({ data: { id:'spot', ...payload }, error }) }) }) };
  } }) };
  const { spotService } = load('src/services/spotService.ts', {
    '../constants/sampleData': { sampleSpots:[] },
    '../lib/supabase': { hasSupabaseConfig:true, supabase:client },
    '../utils/tableInventory': tables,
    '../utils/reservations': { calculateReservationFee: (row) => row.reservation_fee,
      getSpotReservationType: (row) => row.reservation_fee > 0 ? 'paid':'free',
      isPaymentRequired: (row) => row.reservation_fee > 0 },
  });
  return { spotService, updates, client };
}

test('price and table inventory publish together without introducing a duration', async () => {
  const api = serviceFixture();
  const saved = await api.spotService.updateReservationSettings('spot', { reservationFee:250, tableInventory:inventory }, api.client);
  assert.equal(api.updates.length, 1);
  assert.equal(api.updates[0].gcash_amount, 250);
  assert.equal(api.updates[0].reservation_duration_minutes, undefined);
  assert.equal(api.updates[0].table_inventory, inventory);
  assert.equal(Object.hasOwn(api.updates[0], 'is_reservable'), false);
  assert.equal(saved.reservation_fee, 250);
});

test('missing backend columns never report a partial save as successful', async () => {
  const api = serviceFixture({ message:'table_inventory column missing', code:'PGRST204' });
  await assert.rejects(api.spotService.updateReservationSettings('spot', { reservationFee:250, tableInventory:inventory }, api.client));
  assert.equal(api.updates.length, 1);
});

test('invalid owner settings fail before any database update', async () => {
  const api = serviceFixture();
  await assert.rejects(api.spotService.updateReservationSettings('spot', { reservationFee:NaN, tableInventory:inventory }, api.client), /amount/);
  assert.equal(api.updates.length, 0);
});
