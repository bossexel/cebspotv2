const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
let db;
const ids = Object.fromEntries(['a','b','owner','other','admin','spot','booking','submission','request'].map((name,i) => [name, `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
const actor = async name => db.exec(`reset role; select set_config('request.jwt.claim.sub','${ids[name] || ''}',false); set role ${name === 'anon' ? 'anon' : 'authenticated'};`);
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table profiles(id uuid primary key,email text,role text,display_name text);
    create table spots(id uuid primary key,owner_id uuid,is_public boolean);
    create table reservations(id uuid primary key,user_id uuid,spot_id uuid);
    create table owner_spot_access(spot_id uuid,owner_id uuid);
    create table spot_submissions(id uuid primary key,submitter_id uuid,status text);
    create table owner_access_requests(id uuid primary key,requester_id uuid);
    create table activities(id text primary key,user_id uuid,type text,target_id text,spot_id uuid,content text,created_at timestamptz default now());
    create function public.is_current_user_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
    grant usage on schema public,auth to anon,authenticated;
    grant select,insert,update,delete on all tables in schema public to authenticated;
    grant select on activities to anon;
    insert into profiles values ('${ids.a}','a@example.test','user','A'),('${ids.b}','b@example.test','user','B'),('${ids.owner}','owner@example.test','owner','Owner'),('${ids.other}','other@example.test','owner','Other'),('${ids.admin}','admin@example.test','admin','Admin');
    insert into spots values ('${ids.spot}','${ids.owner}',true);
    insert into reservations values ('${ids.booking}','${ids.a}','${ids.spot}');
    insert into spot_submissions values ('${ids.submission}','${ids.a}','pending');
    insert into owner_access_requests values ('${ids.request}','${ids.a}');
    insert into activities values
      ('reservation','${ids.a}','reservation','${ids.booking}','${ids.spot}','private',now()),
      ('payment','${ids.a}','payment_received','${ids.booking}','${ids.spot}','private',now()),
      ('approval','${ids.a}','reservation_approved','${ids.booking}','${ids.spot}','private',now()),
      ('reminder','${ids.a}','reservation_reminder','${ids.booking}','${ids.spot}','private',now()),
      ('checkin','${ids.a}','reservation_checked_in','${ids.booking}','${ids.spot}','private',now()),
      ('noshow','${ids.a}','reservation_no_show','${ids.booking}','${ids.spot}','private',now()),
      ('unknown','${ids.a}','future_secret_event',null,null,'private',now()),
      ('legacy','${ids.a}','reservation_approved','${ids.spot}','${ids.spot}','private',now()),
      ('pending-submission','${ids.a}','submission','${ids.submission}',null,'private',now()),
      ('owner-request','${ids.a}','owner_access','${ids.request}',null,'private',now()),
      ('public','${ids.a}','discovery',null,'${ids.spot}','public',now());
    alter table activities enable row level security;
    create policy legacy_allow_everyone on activities for select using(true);`);
  await db.exec(fs.readFileSync(path.resolve('supabase/migrations/20261013000100_activity_privacy.sql'),'utf8'));
});
after(async () => db?.close());
const visible = async () => (await db.query('select id from activities order by id')).rows.map(r=>r.id);
for (const name of ['anon','b','other']) test(`${name} cannot read private events even with an overlapping allow-all policy`, async () => {
  await actor(name); assert.deepEqual(await visible(), ['public']);
});
for (const name of ['a','admin']) test(`${name} can read the intended private events`, async () => {
  await actor(name); assert.equal((await visible()).length,11);
});
test('assigned owner receives only authoritative reservation events', async () => {
  await actor('owner'); assert.deepEqual(await visible(), ['approval','checkin','noshow','payment','public','reminder','reservation']);
});
test('granted secondary owner has the same reservation visibility', async () => {
  await db.exec(`reset role; insert into owner_spot_access values ('${ids.spot}','${ids.other}')`);
  await actor('other'); assert.equal((await visible()).length,7);
  await db.exec('reset role; delete from owner_spot_access');
});
test('submission becomes public only after authoritative approval', async () => {
  await db.exec("reset role; update spot_submissions set status='approved'");
  await actor('anon'); assert.deepEqual(await visible(), ['pending-submission','public']);
  await db.exec("reset role; update spot_submissions set status='pending'");
});
test('customers cannot forge approval/payment events or another recipient', async () => {
  await actor('a');
  for (const type of ['reservation_approved','payment_received','future_secret_event']) {
    await assert.rejects(db.query('insert into activities(id,user_id,type,target_id,spot_id) values($1,$2,$3,$4,$5)', ['forged',ids.a,type,ids.booking,ids.spot]), /server-owned/);
  }
  await assert.rejects(db.query('insert into activities(id,user_id,type,target_id,spot_id) values($1,$2,$3,$4,$5)', ['forged',ids.b,'reservation',ids.booking,ids.spot]), /recipient|row-level/);
});
test('owned reminders are accepted, forged references rejected, and events cannot be republished', async () => {
  await actor('a');
  await db.query('insert into activities(id,user_id,type,target_id,spot_id,created_at) values($1,$2,$3,$4,$5,$6)', ['new-reminder',ids.a,'reservation_reminder',ids.booking,ids.spot,'2099-01-01']);
  assert.ok(new Date((await db.query("select created_at from activities where id='new-reminder'")).rows[0].created_at).getFullYear() < 2099);
  await assert.rejects(db.query('insert into activities(id,user_id,type,target_id,spot_id) values($1,$2,$3,$4,$5)', ['forged',ids.a,'reservation_reminder',ids.spot,ids.spot]), /owned reservation/);
  await assert.rejects(db.exec("update activities set type='discovery' where id='payment'"), /permission denied/);
});
test('customers cannot elevate profile identity or role to obtain admin visibility', async () => {
  await actor('b');
  await assert.rejects(db.query("update profiles set role='admin' where id=$1",[ids.b]), /server-owned/);
  await assert.rejects(db.query("update profiles set email='admin@example.test' where id=$1",[ids.b]), /server-owned/);
  assert.deepEqual(await visible(), ['public']);
});
