const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startDatabase}=require('./database.cjs');
let db;
const alice='28000000-0000-4000-8000-000000000001',bob='28000000-0000-4000-8000-000000000002';
before(async()=>{db=await startDatabase()});after(async()=>db?.close());

test('existing Auth trigger synchronizes edited names, preserves custom picture/email/role and original post attribution',async()=>{
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'alice@fixture.test',$2),($3,'bob@fixture.test','{}')",[alice,JSON.stringify({first_name:'Old',last_name:'Name',display_name:'Old Name',avatar_url:'provider-avatar.jpg'}),bob]);
  await db.as(alice);
  await db.query("update profiles set photo_url='custom-picture.jpg' where id=$1",[alice]);
  await db.query("insert into local_updates(user_id,user_name,title,body,location_name,source_type) values($1,'Old Name','Original post','Original caption','Cebu','community')",[alice]);
  await db.exec('reset role');
  const metadata={first_name:'Ana',last_name:'Dela Cruz',display_name:'Ana Dela Cruz',full_name:'Ana Dela Cruz'};
  await db.query('update auth.users set raw_user_meta_data=raw_user_meta_data || $2::jsonb where id=$1',[alice,JSON.stringify(metadata)]);
  await db.as(alice);
  const profile=(await db.query('select * from profiles where id=$1',[alice])).rows[0];
  assert.equal(profile.first_name,'Ana');assert.equal(profile.last_name,'Dela Cruz');assert.equal(profile.display_name,'Ana Dela Cruz');
  assert.equal(profile.photo_url,'custom-picture.jpg');assert.equal(profile.email,'alice@fixture.test');assert.equal(profile.role,'user');
  const post=(await db.query('select user_id,user_name,body from local_updates where user_id=$1',[alice])).rows[0];
  assert.equal(post.user_id,alice);assert.equal(post.user_name,'Old Name');assert.equal(post.body,'Original caption');
  assert.equal((await db.query("update profiles set first_name='Changed' where id=$1",[bob])).rowCount,0);
  await db.exec('reset role');
  // A later, unrelated identity sync must retain the saved names and custom photo.
  await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data || '{\"unrelated\":true}'::jsonb where id=$1",[alice]);
  const refreshed=(await db.query('select first_name,last_name,photo_url from profiles where id=$1',[alice])).rows[0];
  assert.deepEqual(refreshed,{first_name:'Ana',last_name:'Dela Cruz',photo_url:'custom-picture.jpg'});
});
