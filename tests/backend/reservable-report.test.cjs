const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { APPROVED_RESERVATION_VENUE, hasBookableInventory, reportUnverifiedReservable } = require('../../scripts/report-unverified-reservable.cjs');

const env = { ALLOW_READONLY_PROBE: '1', SUPABASE_URL: 'https://project.invalid', SUPABASE_ANON_KEY: 'mock-anon' };
const valid = { id: APPROVED_RESERVATION_VENUE, name: 'Fixture Venue', is_public: true, is_reservable: true,
  reservation_inventory_verified_at: '2030-01-01T00:00:00Z', reservation_fee: 100,
  table_inventory: { prime: [{ tableId: 'P1', capacity: 4, isReserved: false, bookingPolicy: 'online_and_walk_ins' }] } };

test('inventory validator rejects empty, zero-capacity, reserved and walk-in-only tables', () => {
  for (const value of [null, {}, { prime: [] }, { prime: [{ tableId: 'P1', capacity: 0 }] },
    { prime: [{ tableId: 'P1', capacity: 4, isReserved: true }] },
    { prime: [{ tableId: 'P1', capacity: 4, bookingPolicy: 'walk_in_only' }] }]) assert.equal(hasBookableInventory(value), false);
  assert.equal(hasBookableInventory(valid.table_inventory), true);
});

test('report flags public venues with unverified/zero inventory, missing fee, or outside release scope', async () => {
  const rows = [valid, { ...valid, id: 'another-venue' }, { ...valid, id: 'zero-table', table_inventory: { prime: [] } },
    { ...valid, id: 'missing-fee', reservation_fee: null, gcash_amount: null }];
  let request;
  const result = await reportUnverifiedReservable({ env, fetchImpl: async (url, init) => { request = { url: new URL(url), init }; return Response.json(rows); } });
  assert.equal(request.init.method, 'GET');
  assert.equal(request.url.pathname, '/rest/v1/spots');
  assert.equal(request.url.searchParams.get('select').includes('table_inventory'), true);
  assert.equal(result.checkedVisibleReservable, 4);
  assert.deepEqual(result.findings.map(row => row.id), ['another-venue', 'zero-table', 'missing-fee']);
});

test('report refuses without opt-in and fails closed on API errors', async () => {
  await assert.rejects(() => reportUnverifiedReservable({ env: { ...env, ALLOW_READONLY_PROBE: '' }, fetchImpl: async () => { throw new Error('must not call'); } }), /ALLOW_READONLY_PROBE/);
  await assert.rejects(() => reportUnverifiedReservable({ env, fetchImpl: async () => Response.json([], { status: 503 }) }), /HTTP 503/);
});

test('manual flag cleanup is outside migrations and defaults to a count-only dry run', () => {
  const manualPath = path.resolve(__dirname, '../../supabase/manual/clear-unverified-reservable.sql');
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations');
  const sql = fs.readFileSync(manualPath, 'utf8');
  assert.equal(manualPath.startsWith(migrationPath + path.sep), false);
  assert.match(sql, /\\set apply_manual_change false/);
  assert.match(sql, /select count\(\*\) as affected_public_reservable_venues/);
  assert.match(sql, /\\if :apply_manual_change\s+update public\.spots/);
  assert.match(sql, /\\else\s+\\echo 'Dry run only\. No venue flags were changed\.'/);
});
