const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadClubFloorPlan() {
  const source = read('src/constants/clubFloorPlan.ts');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'require', 'module', '__filename', '__dirname', javascript)(
    module.exports,
    require,
    module,
    path.join(root, 'src/constants/clubFloorPlan.ts'),
    path.join(root, 'src/constants'),
  );
  return module.exports;
}

const floorPlan = loadClubFloorPlan();

test('club floor plan contains each public table exactly once', () => {
  const ids = floorPlan.clubBookableTables.map((table) => table.tableId);

  assert.equal(ids.length, 62);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.filter((id) => id.startsWith('C')).sort(),
    Array.from({ length: 42 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`).sort());
  assert.deepEqual(ids.filter((id) => id.startsWith('VVIP')).sort(), ['VVIP01', 'VVIP02', 'VVIP03', 'VVIP04']);
  assert.equal(ids.filter((id) => /^VIP/.test(id)).length, 16);
});

test('floor plan capacity and owner-only rules match the supplied layout', () => {
  const cocktailTables = floorPlan.clubBookableTables.filter((table) => table.kind === 'cocktail');
  const vipTables = floorPlan.clubBookableTables.filter((table) => table.kind !== 'cocktail');
  const ownerTables = floorPlan.clubFloorTables.filter((table) => table.kind === 'owner-vip');

  assert.ok(cocktailTables.every((table) => table.capacity === 4));
  assert.ok(vipTables.every((table) => table.capacity === 10));
  assert.equal(ownerTables.length, 2);
  assert.ok(ownerTables.every((table) => table.bookable === false));
});

test('each booking slot receives an independent complete inventory', () => {
  const inventory = floorPlan.defaultClubTableInventory;

  for (const slotId of ['sunset', 'prime', 'late']) assert.equal(inventory[slotId].length, 62);
  inventory.sunset[0].isReserved = true;
  assert.equal(inventory.prime[0].isReserved, false);
  inventory.sunset[0].isReserved = false;
});

test('normalization keeps the mapped IDs and applies saved availability', () => {
  const inventory = floorPlan.normalizeClubTableInventory({
    sunset: [
      { tableId: 'C01', capacity: 4, isReserved: true },
      { tableId: 'legacy-table', capacity: 100, isReserved: false },
    ],
  });

  assert.equal(inventory.sunset.length, 62);
  assert.equal(inventory.sunset.find((table) => table.tableId === 'C01').isReserved, true);
  assert.equal(inventory.sunset.some((table) => table.tableId === 'legacy-table'), false);
  assert.equal(inventory.prime.length, 62);
});

for (const sqlFile of ['supabase-schema.sql', 'supabase-club-floor-plan.sql']) {
  test(`${sqlFile} exposes live table occupancy without stale payment holds`, () => {
    const sql = read(sqlFile);

    assert.match(sql, /create or replace function public\.get_reserved_table_ids/i);
    assert.match(sql, /status not in \('cancelled', 'completed', 'no_show'\)/i);
    assert.match(sql, /created_at < now\(\) - interval '5 minutes'/i);
    assert.match(sql, /grant execute on function public\.get_reserved_table_ids\(uuid, date, text\) to anon, authenticated/i);
  });
}

test('booking requires an explicit club table and passes it through checkout', () => {
  const reservationScreen = read('app/reservation/[id].tsx');
  const checkoutScreen = read('app/checkout/[id].tsx');

  assert.match(reservationScreen, /selectedTableId/);
  assert.match(reservationScreen, /Select an available table from the floor plan before confirming/);
  assert.match(reservationScreen, /Reserved tables are dimmed and marked with an X/);
  assert.match(reservationScreen, /const reserved = Boolean\(savedTable\?\.isReserved\)/);
  assert.match(reservationScreen, /tableId: selectedTable\.tableId/);
  assert.match(checkoutScreen, /table_id: tableId/);
});

test('owner dashboard preserves the fixed club inventory when publishing pricing', () => {
  const ownerDashboard = read('app/owner-dashboard.tsx');

  assert.match(ownerDashboard, /normalizeClubTableInventory\(draftInventory\)/);
  assert.doesNotMatch(ownerDashboard, /changeTableCount/);
  assert.match(ownerDashboard, /mapped tables/);
});
