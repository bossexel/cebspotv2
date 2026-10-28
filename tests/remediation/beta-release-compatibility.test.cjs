const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {startDatabase}=require('./database.cjs');
const id=n=>`29000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [alice,bob,admin]=[id(1),id(2),id(3)];let db;
before(async()=>{
 db=await startDatabase({through:'20261011000100_table_booking_policy_and_walk_ins.sql'});
 for(const [user,email] of [[alice,'alice@fixture.test'],[bob,'bob@fixture.test'],[admin,'testadmin6000@gmail.com']])
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,email]);
 for(const file of ['20261013000700_circle_location_controls.sql','20261027000100_independent_spot_posts.sql','20261028000100_beta_identity_prerequisites.sql'])
  await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
});after(async()=>db?.close());

test('focused hosted upgrade supports independent linked posts without the older booking/account overhaul',async()=>{
 await db.as(alice);
 const a=(await db.query("insert into spot_submissions(name,description,category,address,latitude,longitude,submitter_id,images) values('Shared Cafe','Alice caption','Cafe','Cebu',10.3,123.9,$1,ARRAY['alice.jpg']) returning id",[alice])).rows[0].id;
 await db.as(admin);const spot=(await db.query('select (approve_spot_submission($1)).id',[a])).rows[0].id;
 await db.as(bob);
 const b=(await db.query("insert into spot_submissions(name,description,category,address,latitude,longitude,submitter_id,images,spot_id) values('Shared Cafe','Bob caption','Cafe','Cebu',10.3,123.9,$1,ARRAY['bob.jpg'],$2) returning id",[bob,spot])).rows[0].id;
 await db.query('select * from publish_spot_submission_local_update($1)',[b]);
 await db.exec('reset role');const posts=(await db.query('select user_id,body,media_urls,spot_id from local_updates where source_id=any($1::text[]) order by created_at',[ [a,b] ])).rows;
 assert.deepEqual(posts,[{user_id:alice,body:'Alice caption',media_urls:['alice.jpg'],spot_id:spot},{user_id:bob,body:'Bob caption',media_urls:['bob.jpg'],spot_id:spot}]);
 assert.equal((await db.query('select count(*)::int n from spots')).rows[0].n,1);
 assert.equal((await db.query("select to_regclass('public.account_deletion_requests') table_name")).rows[0].table_name,null);
});

test('focused upgrade makes Circle opt-in/stop/leave usable and blocks direct profile identity changes',async()=>{
 await db.as(alice);
 const circle=(await db.query("insert into circles(name,owner_id,members) values('Release circle',$1,ARRAY[$1::uuid]) returning id",[alice])).rows[0].id;
 const sharing=(await db.query('select * from set_circle_location_sharing(true)')).rows[0];
 await db.query('select publish_circle_location($1,10.3,123.9)',[sharing.generation]);
 assert.equal((await db.query('select * from get_circle_members($1)',[circle])).rows[0].location.lat,10.3);
 await db.query('select set_circle_location_sharing(false)');
 assert.equal((await db.query('select * from get_circle_members($1)',[circle])).rows[0].location,null);
 await assert.rejects(db.query("update profiles set email='fake@fixture.test' where id=$1",[alice]),/server-owned/);
 await db.query("update profiles set first_name='Alicia' where id=$1",[alice]);
 await db.query('select leave_circle($1)',[circle]);
 await db.exec('reset role');
 await db.query("update auth.users set email='confirmed-new@fixture.test' where id=$1",[alice]);
 assert.equal((await db.query('select email from profiles where id=$1',[alice])).rows[0].email,'confirmed-new@fixture.test');
});
