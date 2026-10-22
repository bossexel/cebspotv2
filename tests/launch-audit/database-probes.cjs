// Actual repository SQL and RLS in a new loopback PostgreSQL cluster; synthetic data only.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const guest = '33333333-3333-4333-8333-333333333333';
const venue = '44444444-4444-4444-8444-444444444444';
const findings = [];
async function main() {
  const db = await require('../backend/walk-ins-postgres.cjs').startPostgres(root);
  const schema = read('supabase-schema.sql');
  const locking = read('supabase-reservation-locking.sql');
  const audit = read('supabase/migrations/20261006000100_audit_authorization_hardening.sql');
  const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b));
  async function asUser(id = guest, client = db) { await client.query(`reset role; select set_config('request.jwt.claim.sub','${id}',false),set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`); }
  async function reset() {
    await db.exec(`reset role; truncate spots,profiles,auth.users cascade;
      insert into auth.users values ('${owner}'),('${guest}');
      insert into profiles(id,email,role) values ('${owner}','owner@example.test','owner'),('${guest}','guest@example.test','user');`);
    const inventory = { sunset: [{ tableId: 'T01', capacity: 4 }], prime: [{ tableId: 'T01', capacity: 4 }], late: [{ tableId: 'T01', capacity: 4 }] };
    await db.query(`insert into spots(id,name,category,address,latitude,longitude,is_public,is_reservable,owner_id,table_inventory,reservation_fee,gcash_amount,payment_required) values ($1,'Audit','Cafe','Cebu',10,123,true,true,$2,$3,150,150,true)`, [venue, owner, JSON.stringify(inventory)]);
    await asUser();
  }
  async function insert(overrides = {}, client = db, id = guest) {
    const values = { user_id: id, spot_id: venue, spot_name: 'Audit', reservation_date: '2030-01-01', reservation_time: '18:00', slot_id: 'sunset', table_id: 'T01', guest_count: 2, guests: 2, qr_code: 'synthetic-audit', guest_name: 'Guest', guest_email: 'guest@example.test', guest_phone: '09171234567', payment_terms_accepted: true, ...overrides };
    const keys = Object.keys(values);
    return client.query(`insert into reservations(${keys.join(',')}) values (${keys.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, Object.values(values));
  }
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      ${between(schema, 'create table if not exists profiles', 'alter table profiles')}
      ${between(locking, 'alter table reservations', 'create or replace function public.check_reservation_slot_available')}
      ${between(schema, 'create table if not exists activities', 'create table if not exists local_updates')}
      create table owner_spot_access(spot_id uuid references spots(id),owner_id uuid references profiles(id));
      grant select on profiles,spots,owner_spot_access to authenticated;
      grant select,insert on reservations to authenticated; grant update on spots to authenticated;
      alter table reservations enable row level security;
      create policy reservations_insert_own on reservations for insert to authenticated with check (user_id=auth.uid());
      create policy reservations_select_own on reservations for select to authenticated using (user_id=auth.uid());
      alter table spots enable row level security;
      create policy spots_public_read on spots for select using (is_public);
      create policy spots_owner_update on spots for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
      ${between(schema, 'create or replace function public.enforce_paid_reservation_checkout_details', 'alter table reservation_payments')}
      ${between(audit, 'create or replace function public.enforce_reservation_insert_boundary', 'drop policy if exists "activities_read"')}
      ${between(audit, 'create or replace function public.approve_paid_reservation', 'create or replace function public.promote_popular_spot_submissions')}
      ${read('supabase/migrations/20261011000100_table_booking_policy_and_walk_ins.sql')}`);
    await reset();
    const manual = (await insert({ payment_method: 'gcash', payment_reference: 'synthetic-proof-ref', payment_proof_url: guest + '/proof.jpg', payer_gcash_number: '09171234567' })).rows[0];
    await asUser(owner);
    let approval;
    try { await db.query('select * from approve_paid_reservation($1)', [manual.id]); approval = 'accepted'; }
    catch (e) { approval = e.message; }
    findings.push({ case: 'manual-proof-after-current-migrations', storedMethod: manual.payment_method, storedReference: manual.payment_reference, storedProof: manual.payment_proof_url, ownerApproval: approval });
    for (const [label, override] of [
      ['fake-paid-state-and-fee', { fee: 1, reservation_fee: 1, payment_required: false, status: 'confirmed', payment_status: 'paid' }],
      ['unknown-table', { table_id: 'NO-TABLE' }], ['invalid-slot', { slot_id: 'NO-SLOT' }],
      ['negative-guests', { guest_count: -1, guests: -1 }], ['over-capacity', { guest_count: 10, guests: 10 }],
      ['missing-contact', { guest_phone: '' }], ['malformed-contact', { guest_email: 'not-an-email', guest_phone: '+' }],
      ['mismatched-slot-time', { slot_id: 'late', reservation_time: '09:00' }],
      ['forged-creation-time', { created_at: '2099-01-01T00:00:00Z' }],
    ]) {
      await reset();
      try { const row = (await insert(override)).rows[0]; findings.push({ case: label, accepted: true, status: row.status, paymentStatus: row.payment_status, fee: row.fee }); }
      catch (e) { findings.push({ case: label, accepted: false, code: e.code, message: e.message }); }
    }
    await reset(); await db.exec('reset role');
    await db.exec(read('supabase-reservation-attendance.sql'));
    await db.query('update spots set reservation_fee=0,gcash_amount=0,payment_required=false where id=$1',[venue]);
    await asUser(); const free = (await insert({status:'confirmed'})).rows[0];
    await asUser(owner); let attendance;
    try {await db.query('select * from owner_record_reservation_attendance($1,$2)',[free.id,'checked_in']);attendance='accepted';}
    catch(e){attendance=e.message;}
    findings.push({case:'free-booking-owner-check-in',storedStatus:free.status,paymentRequired:free.payment_required,ownerAttendance:attendance});
    await reset(); await db.exec('reset role');
    const ids = Array.from({ length: 50 }, (_, i) => `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`);
    for (const [i, id] of ids.entries()) await db.query(`insert into auth.users values ($1);`, [id]);
    for (const [i, id] of ids.entries()) await db.query(`insert into profiles(id,email) values ($1,$2)`, [id, `guest-${i}@example.test`]);
    const clients = [];
    try {
      // Connection setup is outside the timed race; the existing helper has a
      // 500 ms connection timeout, so establish sessions one at a time.
      for (const id of ids) { const client = await db.connect(); client.on('error', () => {}); clients.push(client); }
      await Promise.all(clients.map((c, i) => asUser(ids[i], c)));
      const start = performance.now();
      const attempts = await Promise.all(clients.map(async (client, i) => {
        const t = performance.now();
        try { await insert({}, client, ids[i]); return { accepted: true, ms: performance.now() - t }; }
        catch (e) { return { accepted: false, code: e.code, message: e.message, ms: performance.now() - t }; }
      }));
      const count = (await db.query('select count(*)::integer as count from reservations')).rows[0].count;
      findings.push({ case: '50-distinct-users-same-table', ms: Math.round(performance.now() - start), accepted: attempts.filter(a => a.accepted).length, rejected: attempts.filter(a => !a.accepted).length, storedRows: count, attempts });
    } finally { await Promise.all(clients.map(c => c.end())); }
  } finally { await db.close(); fs.writeFileSync(path.join(__dirname, 'evidence/database-probes.json'), JSON.stringify({ kind: 'isolated-postgresql-source-slices-with-rls', findings }, null, 2)); }
  console.log(JSON.stringify(findings.map(({ attempts, ...f }) => f), null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
