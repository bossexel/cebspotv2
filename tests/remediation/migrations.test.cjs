const { test,before,after }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {startDatabase}=require('./database.cjs');
let db;
before(async()=>{db=await startDatabase();});
after(async()=>db?.close());
async function catalog(database) {
  const statements=[
    "select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
    "select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname",
    "select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname",
    "select p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by p.proname,args",
    "select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname"
  ];
  const result=[];
  for(const sql of statements) result.push((await database.query(sql)).rows);
  return result;
}
test('the complete timestamped migration chain creates required booking surfaces',async()=>{
  for(const table of ['profiles','spots','reservations','reservation_payments','activities','owner_spot_access','walk_in_visits','venue_table_states','review_helpful_votes','point_transactions','spot_edit_suggestions']) {
    assert.equal((await db.query('select to_regclass($1)::text name',['public.'+table])).rows[0].name,table);
  }
  for(const fn of ['physical_venue_tables','get_venue_table_availability','owner_seat_walk_in','approve_paid_reservation','get_reserved_table_ids','check_reservation_slot_available','is_current_user_admin','can_read_activity']) {
    assert.ok((await db.query("select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[fn])).rows.length,fn);
  }
});
test('fresh installation has no business/demo fixtures and does have required guards',async()=>{
  for(const table of ['profiles','spots','reservations','activities']) assert.equal((await db.query(`select count(*)::integer n from public.${table}`)).rows[0].n,0);
  assert.ok((await db.query("select 1 from pg_policies where tablename='activities' and policyname='activities_private_visibility_guard' and permissive='RESTRICTIVE'")).rows.length);
  assert.ok((await db.query("select 1 from pg_trigger where tgname='reservations_enforce_booking_insert'")).rows.length);
  assert.ok((await db.query("select 1 from pg_indexes where indexname='reservations_active_table_slot_unique_idx'")).rows.length);
});
test('migration version/checksum manifest is retained',async()=>{
  fs.writeFileSync('tests/remediation/evidence/migration-manifest.json',JSON.stringify({kind:'complete-native-postgresql-replay',limitations:'Auth/Storage schemas are contract fixtures; not a Supabase stack reset or API verification.',migrations:db.manifest},null,2)+'\n');
  assert.ok(db.manifest.length >= 7);
});
test('an isolated previous-version fixture upgrades to the same schema without losing business rows',async()=>{
  const previous=await startDatabase({through:'20261011000100_table_booking_policy_and_walk_ins.sql'});
  try {
    await previous.query("insert into auth.users(id,email) values('20000000-0000-4000-8000-000000000001','upgrade-fixture@example.test')");
    await previous.query("insert into spots(id,name,category,address,latitude,longitude) values('20000000-0000-4000-8000-000000000002','Upgrade fixture','Cafe','Fixture',10,123)");
    for(const name of fs.readdirSync('supabase/migrations').filter(name=>/^\d{14}_.+\.sql$/.test(name) && name>'20261011000100_table_booking_policy_and_walk_ins.sql').sort()) await previous.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
    assert.deepEqual(await catalog(previous),await catalog(db));
    assert.equal((await previous.query('select count(*)::integer n from spots')).rows[0].n,1);
    assert.equal((await previous.query('select count(*)::integer n from profiles')).rows[0].n,1);
  } finally { await previous.close(); }
});
test('all six roles retain activity isolation after complete schema replay',async()=>{
  const ids=Array.from({length:5},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
  const venue='66666666-6666-4666-8666-666666666666';
  for(const [i,id] of ids.entries()) await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,i===4?'testadmin6000@gmail.com':`fixture-${i}@example.test`]);
  await db.query("update profiles set role='owner' where id=any($1::uuid[])",[[ids[2],ids[3]]]);
  await db.query("insert into spots(id,name,category,address,latitude,longitude,owner_id,is_public,is_reservable,table_inventory) values($1,'Fixture venue','Cafe','Fixture address',10,123,$2,true,true,$3)",[venue,ids[2],JSON.stringify({prime:[{tableId:'T01',capacity:4}]})]);
  await db.as(ids[2]);
  await db.query('select confirm_client_venue_inventory($1,$2)',[venue,JSON.stringify({prime:[{tableId:'T01',capacity:4}]})]);
  await db.exec('reset role');
  const booking=(await db.query("insert into reservations(user_id,spot_id,spot_name,reservation_date,reservation_time,table_id,slot_id,qr_code) values($1,$2,'Fixture venue',current_date+1,'21:10','T01','prime','fixture-qr') returning id",[ids[0],venue])).rows[0].id;
  await db.query("insert into activities(user_id,user_name,type,target_id,spot_id,content) values($1,'Fixture','reservation_approved',$2,$3,'Synthetic private event')",[ids[0],booking,venue]);
  await db.exec('create policy intentionally_overlapping_permissive_test on activities for select using(true)');
  for(const [i,id] of [null,...ids].entries()) {
    await db.as(id,db,id?'authenticated':'anon');
    const count=(await db.query("select count(*)::integer n from activities where type='reservation_approved'")).rows[0].n;
    assert.equal(count,[1,3,5].includes(i)?1:0,`role index ${i}`);
  }
  await db.exec('reset role; drop policy intentionally_overlapping_permissive_test on activities');
});
