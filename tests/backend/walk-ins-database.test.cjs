const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after, beforeEach } = require('node:test');
const root = path.resolve(__dirname, '../..');
const nativePostgres = process.env.WALK_IN_NATIVE_PG === '1';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const guest = '33333333-3333-4333-8333-333333333333';
const venue = '44444444-4444-4444-8444-444444444444';
let db;
async function role(id = owner) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false), set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`);
}
const availability = () => db.query('select * from get_venue_table_availability($1)', [venue]);
const setPolicy = policy => db.query('select * from owner_set_table_booking_policy($1,$2,$3)', [venue, 'T01', policy]);
const seat = (table = 'T01', size = 2) => db.query('select * from owner_seat_walk_in($1,$2,$3)', [venue, table, size]);
async function reservation({ date = 'today', status = 'confirmed', table = 'T01', payment = false, slot = 'prime' } = {}, client = db) {
  const result = await client.query(`insert into reservations(user_id,spot_id,spot_name,reservation_date,reservation_time,
    table_id,slot_id,guest_count,guests,status,payment_status,payment_method,qr_code,payment_terms_accepted,guest_name,guest_email,guest_phone)
    values ($1,$2,'Ignored client name', case when $3 = 'today' then (now() at time zone 'Asia/Manila')::date
      else (now() at time zone 'Asia/Manila')::date + 1 end,'21:10',$4,$5,2,2,$6,$7,$8,gen_random_uuid()::text,true,'Guest','guest@example.test','09171234567') returning *`,
    [guest, venue, date, table, slot, status, payment ? 'pending' : 'not_required', payment ? 'paymongo_qrph' : null]);
  return result.rows[0];
}

before(async () => {
  db = nativePostgres ? await require('./walk-ins-postgres.cjs').startPostgres(root)
    : new (require(process.env.PGLITE_TEST_PATH || '@electric-sql/pglite').PGlite)();
  const schema = read('supabase-schema.sql');
  const locking = read('supabase-reservation-locking.sql');
  const audit = read('supabase/migrations/20261006000100_audit_authorization_hardening.sql');
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    ${schema.slice(schema.indexOf('create table if not exists profiles'), schema.indexOf('alter table profiles'))}
    ${locking.slice(locking.indexOf('alter table reservations'), locking.indexOf('create or replace function public.check_reservation_slot_available'))}
    create table owner_spot_access(spot_id uuid references spots(id), owner_id uuid references profiles(id));
    grant select on profiles,spots,owner_spot_access to authenticated;
    grant select,insert on reservations to authenticated;
    grant update on spots to authenticated;
    alter table reservations enable row level security;
    create policy reservations_insert_own on reservations for insert to authenticated with check (user_id=auth.uid());
    create policy reservations_select_own on reservations for select to authenticated using (user_id=auth.uid());
    alter table spots enable row level security;
    create policy spots_public_read on spots for select using (is_public);
    create policy spots_owner_update on spots for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
    ${audit.slice(audit.indexOf('create or replace function public.enforce_reservation_insert_boundary'), audit.indexOf('drop policy if exists "activities_read"'))}
    ${read('supabase/migrations/20261011000100_table_booking_policy_and_walk_ins.sql')}
  `);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`reset role; truncate spots,profiles,auth.users cascade;
    insert into auth.users values ('${owner}'),('${otherOwner}'),('${guest}');
    insert into profiles(id,email,role) values ('${owner}','owner@example.test','owner'),('${otherOwner}','other@example.test','owner'),('${guest}','guest@example.test','user');`);
  const tables = [{ tableId: 'T01', capacity: 4, isReserved: false }, { tableId: 'T02', capacity: 2, isReserved: false }];
  await db.query(`insert into spots(id,name,category,address,latitude,longitude,is_public,is_reservable,owner_id,table_inventory)
    values ($1,'Test venue','Cafe','Cebu',10,123,true,true,$2,$3)`, [venue, owner, JSON.stringify({ sunset: tables, prime: tables, late: tables })]);
  await role();
});

test('existing tables default to online and walk-ins, with a separate free state', async () => {
  const { rows } = await availability();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].booking_policy, 'online_and_walk_ins');
  assert.equal(rows[0].operational_state, 'free');
  assert.equal(rows[0].online_available, true);
});

test('policy persists across all inventory copies without altering any pricing fields', async () => {
  await db.exec('reset role');
  await db.query('update spots set reservation_fee=150,gcash_amount=150,payment_required=true,reservation_type=\'paid\' where id=$1', [venue]);
  await role();
  const { rows: [saved] } = await setPolicy('walk_in_only');
  for (const slot of ['sunset', 'prime', 'late']) assert.equal(saved.table_inventory[slot][0].bookingPolicy, 'walk_in_only');
  assert.equal(Number(saved.reservation_fee), 150);
  assert.equal(Number(saved.gcash_amount), 150);
  assert.equal(saved.payment_required, true);
  assert.equal(saved.reservation_type, 'paid');
});

test('walk-in-only policy rejects a direct guest insert, including a forged terminal status', async () => {
  await setPolicy('walk_in_only');
  await role(guest);
  for (const status of ['pending_payment', 'confirmed', 'completed']) {
    await assert.rejects(reservation({ status }), /Walk-ins only/);
  }
  assert.equal((await db.query('select count(*)::integer n from reservations')).rows[0].n, 0);
});

test('new and legacy availability both exclude walk-in-only tables', async () => {
  await setPolicy('walk_in_only');
  await role(guest);
  assert.equal((await availability()).rows[0].online_available, false);
  assert.equal((await availability()).rows[0].booking_policy, 'walk_in_only');
  const day = (await db.query("select (now() at time zone 'Asia/Manila')::date::text d")).rows[0].d;
  assert.deepEqual((await db.query('select get_reserved_table_ids($1,$2,$3) ids', [venue, day, 'prime'])).rows[0].ids, ['T01']);
  assert.equal((await db.query('select check_reservation_slot_available($1,$2,$3,$4) available', [venue, day, 'prime', 'T01'])).rows[0].available, false);
});

test('a policy change after availability rejects the later hold without creating a payment', async () => {
  assert.equal((await availability()).rows[0].online_available, true);
  await setPolicy('walk_in_only');
  await role(guest);
  await assert.rejects(reservation({ payment: true }), /Walk-ins only/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::integer n from reservation_payments')).rows[0].n, 0);
});

test('an authorized owner seats a fitting walk-in-only table immediately without a reservation or payment', async () => {
  await setPolicy('walk_in_only');
  const visit = (await seat()).rows[0];
  assert.equal(visit.status, 'checked_in');
  assert.equal(visit.party_size, 2);
  const table = (await availability()).rows[0];
  assert.equal(table.operational_state, 'occupied');
  assert.equal(table.walk_in_visit_id, visit.id);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::integer n from reservations')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::integer n from reservation_payments')).rows[0].n, 0);
});

test('standard tables still accept walk-ins, and seating blocks online requests for every slot', async () => {
  await seat();
  await role(guest);
  assert.equal((await availability()).rows[0].online_available, false);
  await assert.rejects(reservation({ slot: 'sunset' }), /occupied or cleaning/);
  await assert.rejects(reservation({ date: 'tomorrow' }), /occupied or cleaning/);
});

test('held and due tables are excluded from walk-in seating; their policies cannot change', async () => {
  await role(guest);
  const booking = await reservation();
  await role();
  assert.equal((await availability()).rows[0].operational_state, 'due');
  await assert.rejects(seat(), /no longer free/);
  await assert.rejects(setPolicy('walk_in_only'), /not clear/);
  await db.exec(`reset role; update reservations set status='pending_payment',payment_status='pending',payment_method='paymongo_qrph' where id='${booking.id}'`);
  await role();
  assert.equal((await availability()).rows[0].operational_state, 'held');
  await assert.rejects(seat(), /no longer free/);
  await assert.rejects(setPolicy('walk_in_only'), /not clear/);
});

test('future confirmed bookings lock policy without cancellation or payment changes', async () => {
  await role(guest);
  const booking = await reservation({ date: 'tomorrow' });
  await role();
  await assert.rejects(setPolicy('walk_in_only'), /not clear/);
  await db.exec('reset role');
  const saved = (await db.query('select * from reservations where id=$1', [booking.id])).rows[0];
  assert.equal(saved.status, booking.status);
  assert.equal(saved.payment_status, booking.payment_status);
  assert.equal(saved.reservation_date.toString(), booking.reservation_date.toString());
});

test('occupied and cleaning tables stay unavailable until explicit completion and ready', async () => {
  const visit = (await seat()).rows[0];
  await assert.rejects(seat(), /no longer free/);
  await assert.rejects(setPolicy('walk_in_only'), /not clear/);
  await assert.rejects(db.query('select owner_mark_table_ready($1,$2)', [venue, 'T01']), /Complete the active visit/);
  await db.query('select owner_complete_walk_in($1)', [visit.id]);
  assert.equal((await availability()).rows[0].operational_state, 'cleaning');
  await assert.rejects(seat(), /no longer free/);
  await assert.rejects(setPolicy('walk_in_only'), /not clear/);
  await db.query('select owner_mark_table_ready($1,$2)', [venue, 'T01']);
  assert.equal((await availability()).rows[0].operational_state, 'free');
  assert.equal((await availability()).rows[0].online_available, true);
});

test('undersized and operationally unavailable tables cannot seat walk-ins', async () => {
  await assert.rejects(seat('T02', 3), /does not fit/);
  await assert.rejects(seat('T01', 0), /party size/);
  await db.query(`update spots set table_inventory = jsonb_set(table_inventory, '{prime,0,isReserved}', 'true') where id=$1`, [venue]);
  assert.equal((await availability()).rows[0].operational_state, 'unavailable');
  await assert.rejects(seat(), /no longer free/);
});

test('guest and unrelated owner cannot change policy, seat, complete, or mark ready', async () => {
  const visit = (await seat()).rows[0];
  for (const id of [guest, otherOwner]) {
    await role(id);
    await assert.rejects(setPolicy('walk_in_only'), /authorized venue owner/);
    await assert.rejects(seat(), /authorized venue owner/);
    await assert.rejects(db.query('select owner_complete_walk_in($1)', [visit.id]), /authorized venue owner/);
    await assert.rejects(db.query('select owner_mark_table_ready($1,$2)', [venue, 'T01']), /authorized venue owner/);
    await assert.rejects(db.query('insert into walk_in_visits(spot_id,table_id,party_size,seated_by) values ($1,\'T02\',2,$2)', [venue, id]), /permission denied/);
    await assert.rejects(db.query('update venue_table_states set state=\'free\' where spot_id=$1', [venue]), /permission denied/);
  }
});

test('stale inventory saves preserve a policy field omitted by older clients', async () => {
  await setPolicy('walk_in_only');
  const tables = [{ tableId: 'T01', capacity: 3, isReserved: false }, { tableId: 'T02', capacity: 2, isReserved: false }];
  await db.query('update spots set table_inventory=$2 where id=$1', [venue, JSON.stringify({ sunset: tables, prime: tables, late: tables })]);
  assert.equal((await availability()).rows[0].booking_policy, 'walk_in_only');
});

test('direct inventory PATCH cannot change policy or remove a table with an active booking', async () => {
  await role(guest);
  const booking = await reservation();
  await role();
  const original = (await db.query('select table_inventory from spots where id=$1', [venue])).rows[0].table_inventory;
  const changed = JSON.parse(JSON.stringify(original));
  for (const slot of ['sunset', 'prime', 'late']) changed[slot][0].bookingPolicy = 'walk_in_only';
  await assert.rejects(db.query('update spots set table_inventory=$2 where id=$1', [venue, changed]), /not clear/);
  for (const slot of ['sunset', 'prime', 'late']) changed[slot] = changed[slot].slice(1);
  await assert.rejects(db.query('update spots set table_inventory=$2 where id=$1', [venue, changed]), /not clear/);
  await db.exec('reset role');
  assert.equal((await db.query('select status from reservations where id=$1', [booking.id])).rows[0].status, booking.status);
});

test('a granted secondary owner can set policy and seat walk-ins; guests cannot read visit details', async () => {
  await db.exec(`reset role; insert into owner_spot_access values ('${venue}','${otherOwner}');`);
  await role(otherOwner);
  await setPolicy('walk_in_only');
  await seat();
  await role(guest);
  const table = (await availability()).rows[0];
  assert.equal(table.operational_state, 'occupied');
  assert.equal(table.walk_in_visit_id, null);
  assert.equal(table.walk_in_party_size, null);
  assert.equal((await db.query('select count(*)::integer n from walk_in_visits')).rows[0].n, 0);
});

test('competing RPC callers get one successful seating and one rejection', async () => {
  // PGlite queues SQL on one connection. This executes the real RPC and unique
  // constraint, but a multi-session PostgreSQL lock race needs the separate harness.
  const results = await Promise.allSettled([seat(), seat()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal((await db.query("select count(*)::integer n from walk_in_visits where status='checked_in'")).rows[0].n, 1);
});

test('separate owner sessions wait on the venue lock and cannot both seat one table', { skip: !nativePostgres }, async () => {
  await db.exec(`reset role; insert into owner_spot_access values ('${venue}','${otherOwner}');`);
  const first = await db.connect();
  const second = await db.connect();
  try {
    for (const [connection, id] of [[first, owner], [second, otherOwner]]) {
      await connection.query(`begin; set lock_timeout='5s'; select set_config('request.jwt.claim.sub','${id}',true), set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;`);
    }
    await first.query('select owner_seat_walk_in($1,$2,$3)', [venue, 'T01', 2]);
    const secondPid = (await second.query('select pg_backend_pid() id')).rows[0].id;
    const competing = second.query('select owner_seat_walk_in($1,$2,$3)', [venue, 'T01', 2]).then(value => ({ value }), error => ({ error }));
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const activity = await db.query('select wait_event_type from pg_stat_activity where pid=$1', [secondPid]);
      if (activity.rows[0]?.wait_event_type === 'Lock') { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(blocked, true, 'Second device must wait while the first seating is uncommitted');
    await first.query('commit');
    assert.match((await competing).error?.message || '', /no longer free/);
    await second.query('rollback');
    assert.equal((await db.query("select count(*)::integer n from walk_in_visits where status='checked_in'")).rows[0].n, 1);
  } finally {
    await first.query('rollback').catch(() => {});
    await second.query('rollback').catch(() => {});
    await first.end(); await second.end();
  }
});

test('a checked-in online reservation also completes through cleaning and ready', async () => {
  await role(guest);
  const booking = await reservation();
  await db.exec(`reset role; update reservations set status='checked_in' where id='${booking.id}'`);
  await role();
  assert.equal((await availability()).rows[0].operational_state, 'occupied');
  await db.query('select owner_complete_reservation_visit($1)', [booking.id]);
  assert.equal((await availability()).rows[0].operational_state, 'cleaning');
  await db.query('select owner_mark_table_ready($1,$2)', [venue, 'T01']);
  assert.equal((await availability()).rows[0].operational_state, 'free');
});

test('expired PayMongo holds release the table and expire their payment; the new fee stays authoritative', async () => {
  await db.exec(`reset role; update spots set reservation_fee=150,gcash_amount=150,payment_required=true,reservation_type='paid' where id='${venue}'`);
  await role(guest);
  const hold = await reservation({ payment: true });
  assert.equal(hold.status, 'pending_payment');
  assert.equal(Number(hold.reservation_fee), 150);
  // The existing insert boundary clears untrusted payment_method. The checkout
  // backend subsequently attaches PayMongo, as simulated here.
  await db.exec(`reset role; update reservations set payment_method='paymongo_qrph',created_at=now()-interval '10 minutes' where id='${hold.id}'`);
  await db.query('insert into reservation_payments(reservation_id,user_id,spot_id,amount) values ($1,$2,$3,150)', [hold.id, guest, venue]);
  await role(guest);
  const day = (await db.query("select (now() at time zone 'Asia/Manila')::date::text d")).rows[0].d;
  assert.equal((await db.query('select check_reservation_slot_available($1,$2,$3,$4) available', [venue, day, 'prime', 'T01'])).rows[0].available, true);
  const next = await reservation({ payment: true });
  assert.equal(next.status, 'pending_payment');
  assert.equal(Number(next.reservation_fee), 150);
  await db.exec('reset role');
  assert.equal((await db.query('select status from reservation_payments where reservation_id=$1', [hold.id])).rows[0].status, 'expired');
  assert.equal((await db.query('select status from reservations where id=$1', [hold.id])).rows[0].status, 'cancelled');
});

test('a pending paid reservation with no attached provider stays held after five minutes', async () => {
  await db.exec(`reset role; update spots set reservation_fee=150,gcash_amount=150,payment_required=true,reservation_type='paid' where id='${venue}'`);
  await role(guest);
  const hold = await reservation({ payment: true });
  await db.exec(`reset role; update reservations set created_at=now()-interval '10 minutes' where id='${hold.id}'`);
  await role();
  assert.equal((await availability()).rows[0].operational_state, 'held');
  await assert.rejects(seat(), /no longer free/);
  await assert.rejects(setPolicy('walk_in_only'), /not clear/);
});

for (const race of [
  { name: 'walk-in wins against an online hold', firstId: owner, secondId: guest,
    first: c => c.query('select owner_seat_walk_in($1,$2,2)', [venue, 'T01']), second: c => reservation({}, c), rejection: /occupied or cleaning/ },
  { name: 'online reservation wins against walk-in seating', firstId: guest, secondId: owner,
    first: c => reservation({}, c), second: c => c.query('select owner_seat_walk_in($1,$2,2)', [venue, 'T01']), rejection: /no longer free/ },
  { name: 'policy change wins against a stale online hold', firstId: owner, secondId: guest,
    first: c => c.query("select owner_set_table_booking_policy($1,$2,'walk_in_only')", [venue, 'T01']), second: c => reservation({}, c), rejection: /Walk-ins only/ },
  { name: 'online reservation locks policy on a second device', firstId: guest, secondId: owner,
    first: c => reservation({}, c), second: c => c.query("select owner_set_table_booking_policy($1,$2,'walk_in_only')", [venue, 'T01']), rejection: /not clear/ },
]) {
  test(`multi-session race: ${race.name}`, { skip: !nativePostgres }, async () => {
    await db.exec('reset role');
    const first = await db.connect(); const second = await db.connect();
    try {
      for (const [connection, id] of [[first, race.firstId], [second, race.secondId]]) {
        await connection.query(`begin; set lock_timeout='5s'; select set_config('request.jwt.claim.sub','${id}',true), set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;`);
      }
      await race.first(first);
      const secondPid = (await second.query('select pg_backend_pid() id')).rows[0].id;
      const pending = race.second(second).then(value => ({ value }), error => ({ error }));
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if ((await db.query('select wait_event_type from pg_stat_activity where pid=$1', [secondPid])).rows[0]?.wait_event_type === 'Lock') { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(blocked, true, 'Competing request did not wait for the first transaction');
      await first.query('commit');
      assert.match((await pending).error?.message || '', race.rejection);
      await second.query('rollback');
    } finally {
      await first.query('rollback').catch(() => {}); await second.query('rollback').catch(() => {});
      await first.end(); await second.end();
    }
  });
}
