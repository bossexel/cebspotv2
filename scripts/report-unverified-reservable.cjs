#!/usr/bin/env node
'use strict';

const APPROVED_RESERVATION_VENUE = '66666666-6666-4666-8666-666666666666';

function hasBookableInventory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).some(tables => Array.isArray(tables) && tables.some(table =>
    table && typeof table.tableId === 'string' && Number.isInteger(Number(table.capacity)) && Number(table.capacity) > 0
      && table.isReserved !== true && table.bookingPolicy !== 'walk_in_only'));
}

async function reportUnverifiedReservable({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.ALLOW_READONLY_PROBE !== '1') throw new Error('Refusing report: set ALLOW_READONLY_PROBE=1 to acknowledge read-only access.');
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Missing required report environment variables.');
  const url = new URL('/rest/v1/spots', env.SUPABASE_URL);
  url.search = new URLSearchParams({
    select: 'id,name,is_reservable,is_public,reservation_inventory_verified_at,table_inventory,reservation_fee,gcash_amount',
    is_public: 'eq.true',
    is_reservable: 'eq.true',
    limit: '1000',
  }).toString();
  const response = await fetchImpl(url, { method: 'GET', headers: { apikey: env.SUPABASE_ANON_KEY, Accept: 'application/json' }, redirect: 'error' });
  if (!response.ok) throw new Error(`Read-only venue report failed with HTTP ${response.status}.`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Venue report returned an invalid response shape.');
  const findings = rows.filter(row => row.is_public === true && row.is_reservable === true && (
    row.id !== APPROVED_RESERVATION_VENUE
    || !row.reservation_inventory_verified_at
    || !hasBookableInventory(row.table_inventory)
    || !(Number(row.reservation_fee) > 0 || Number(row.gcash_amount) > 0)
  )).map(row => ({ id: row.id, name: row.name }));
  return { checkedVisibleReservable: rows.length, findings };
}

if (require.main === module) {
  reportUnverifiedReservable().then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.findings.length) process.exitCode = 1;
  }).catch(error => {
    console.error(error instanceof Error ? error.message : 'Venue report failed.');
    process.exitCode = 1;
  });
}

module.exports = { APPROVED_RESERVATION_VENUE, hasBookableInventory, reportUnverifiedReservable };
