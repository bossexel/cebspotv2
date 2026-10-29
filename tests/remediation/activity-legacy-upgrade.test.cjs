// Focused application of the existing privacy migration on a representative
// pre-booking-overhaul schema. Never connects to the configured hosted backend.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
const migration='supabase/migrations/20261013000100_activity_privacy.sql';
const beta=['20261013000700_circle_location_controls.sql','20261027000100_independent_spot_posts.sql','20261028000100_beta_identity_prerequisites.sql'];
const reservationTypes=['reservation','reservation_approved','reservation_checked_in','reservation_no_show','reservation_reminder','reservation_cancelled','reservation_rescheduled','payment_received','payment_failed'];
let db,bookingId,beforeColumns,beforeRows,beforeCommerce;
const columns=async()=> (await db.query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name=any($1::text[]) order by table_name,ordinal_position",[['profiles','spots','reservations','reservation_payments']])).rows;
const rows=async()=> (await db.query('select id,user_id,type,target_id,spot_id,content,created_at from activities order by id')).rows;
const commerce=async()=>({reservations:(await db.query('select * from reservations order by id')).rows,payments:(await db.query('select * from reservation_payments order by id')).rows});
const visible=async(actor,role='authenticated')=>{await db.as(actor,db,role);return (await db.query('select type from activities order by type')).rows.map(r=>r.type)};
before(async()=>{
 db=await startDatabase({through:'20261006000100_audit_authorization_hardening.sql'});
 for(const file of beta)await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await seed(db,{confirm:false,fee:150});bookingId=(await booking(db)).id;
 await db.query("insert into reservation_payments(reservation_id,user_id,spot_id,provider,provider_checkout_session_id,provider_payment_id,amount,currency,status,paid_at) values($1,$2,$3,'paymongo','fixture-checkout-session','fixture-paid-ledger',150,'PHP','paid','2026-10-01T12:00:00Z')",[bookingId,ids.a,ids.venue]);
 for(const type of [...reservationTypes,'future_secret_event','discovery'])await db.query("insert into activities(user_id,user_name,type,target_id,spot_id,content) values($1,'Synthetic recipient',$2,$3,$4,'Synthetic local-only event')",[ids.a,type,bookingId,ids.venue]);
 // Model the observed hosted visibility, not an assumed exact hosted catalog:
 // this older local baseline already has a narrower restrictive guard. The
 // hosted private-event reads prove that equivalent protection is ineffective
 // there. Remove it only in this new synthetic cluster to test the missing-guard
 // path, while retaining the overlapping permissive policy throughout upgrade.
 await db.exec('alter table activities enable row level security; drop policy if exists activities_private_visibility_guard on activities; create policy legacy_overlapping_allow_all on activities for select to anon,authenticated using(true)');
 beforeColumns=await columns();beforeRows=await rows();beforeCommerce=await commerce();
});
after(async()=>db?.close());

test('the legacy overlap reproduces anonymous and unrelated reservation-event exposure before the existing correction',async()=>{
 for(const [actor,role] of [[null,'anon'],[ids.b,'authenticated']])assert.equal((await visible(actor,role)).filter(t=>reservationTypes.includes(t)).length,reservationTypes.length);
 await db.exec('reset role');
 assert.equal((await db.query("select to_regclass('walk_in_visits') name")).rows[0].name,null);
 assert.equal(beforeColumns.some(c=>['hold_expires_at','reservation_inventory_verified_at','financial_resolution','idempotency_key'].includes(c.column_name)),false);
});

test('the timestamped privacy migration applies alone without booking/payment schema changes or deleting activity rows',async()=>{
 await db.exec('reset role');await db.exec(fs.readFileSync(migration,'utf8'));
 assert.deepEqual(await columns(),beforeColumns);assert.deepEqual(await rows(),beforeRows);assert.deepEqual(await commerce(),beforeCommerce);
 const guard=(await db.query("select permissive from pg_policies where tablename='activities' and policyname='activities_private_visibility_guard'")).rows[0];
 assert.equal(guard.permissive,'RESTRICTIVE');
});

test('the focused legacy upgrade enforces negative and positive access for all six roles despite the permissive overlap',async()=>{
 for(const [actor,role] of [[null,'anon'],[ids.b,'authenticated'],[ids.other,'authenticated']])assert.deepEqual(await visible(actor,role),['discovery']);
 assert.equal((await visible(ids.a)).length,11);assert.equal((await visible(ids.admin)).length,11);
 const owner=await visible(ids.owner);assert.equal(owner.length,10);assert.equal(owner.includes('future_secret_event'),false);
 await db.exec('reset role');await db.query('insert into owner_spot_access(owner_id,spot_id) values($1,$2)',[ids.other,ids.venue]);
 assert.deepEqual(await visible(ids.other),owner);
 await db.exec('reset role');await db.query('delete from owner_spot_access where owner_id=$1',[ids.other]);
});

test('older-schema callers cannot forge a paid event, republish an event or elevate their identity after the focused correction',async()=>{
 await db.as(ids.a);
 await assert.rejects(db.query("insert into activities(user_id,user_name,type,target_id,spot_id) values($1,'Synthetic','payment_received',$2,$3)",[ids.a,bookingId,ids.venue]),/server-owned/);
 await assert.rejects(db.query("update activities set type='discovery' where user_id=$1",[ids.a]),/permission denied/);
 await assert.rejects(db.query("update profiles set role='admin' where id=$1",[ids.a]),/server-owned/);
 await db.query("update profiles set first_name='Synthetic updated name' where id=$1",[ids.a]);
});

test('reapplying the same privacy migration preserves business rows, the restrictive boundary and existing account prerequisites',async()=>{
 await db.exec('reset role');await db.exec(fs.readFileSync(migration,'utf8'));
 assert.deepEqual(await columns(),beforeColumns);assert.deepEqual(await rows(),beforeRows);assert.deepEqual(await commerce(),beforeCommerce);
 assert.deepEqual(await visible(ids.b),['discovery']);
 await db.exec('reset role');assert.ok((await db.query("select to_regprocedure('require_active_account()') name")).rows[0].name);
 assert.equal((await db.query('select count(*)::int n from reservations')).rows[0].n,1);
});

test('catalog-only preflight is read-only, checks actual prerequisites and does not collect business records',async()=>{
 await db.exec('reset role');const result=await db.exec(fs.readFileSync('supabase/verification/activity-privacy-preflight.sql','utf8'));
 const prerequisite=result.find(r=>r.fields?.some(f=>f.name==='prerequisite_matches'));
 assert.ok(prerequisite);assert.ok(prerequisite.rows.length>20);assert.ok(prerequisite.rows.every(r=>r.prerequisite_matches));
 assert.deepEqual(await rows(),beforeRows);assert.deepEqual(await commerce(),beforeCommerce);
 assert.equal((await db.query('show transaction_read_only')).rows[0].transaction_read_only,'off');
});
