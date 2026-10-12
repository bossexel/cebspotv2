const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startDatabase}=require('./database.cjs');
const {ids,seed}=require('./fixtures.cjs');
let db,circle,generation,code;
before(async()=>{
  db=await startDatabase();await seed(db);
  await db.as(ids.a);circle=(await db.query("insert into circles(name,owner_id,members) values('Synthetic circle',$1,array[$1::uuid]) returning id",[ids.a])).rows[0].id;
  code=(await db.query('select * from get_or_create_circle_invite_code($1)',[circle])).rows[0].code;
  await db.as(ids.b);await db.query('select join_circle_by_code($1)',[code]);
});
after(async()=>db?.close());
const members=()=>db.query('select * from get_circle_members($1)',[circle]);
test('location is private by default and cannot be inserted into a general profile',async()=>{
  await db.as(ids.a);assert.ok((await members()).rows.every(m=>m.location===null));
  await assert.rejects(db.query("update profiles set location='{\"lat\":10,\"lng\":123}',last_location_update=now() where id=$1",[ids.a]),/consent-bound/);
  await assert.rejects(db.query('select publish_circle_location($1,10,123)',[ids.a]),/sharing stopped/);
});
test('only opted-in circle members can publish; direct raw coordinate reads remain own-account only',async()=>{
  for(const actor of [ids.owner,ids.other,ids.admin]) {await db.as(actor);await assert.rejects(db.query('select set_circle_location_sharing(true)'),/Join a circle/);assert.equal((await members()).rows.length,0);}
  await db.as(ids.a);generation=(await db.query('select (set_circle_location_sharing(true)).generation')).rows[0].generation;
  await db.query('select publish_circle_location($1,10.32,123.91)',[generation]);
  await db.as(ids.b);const a=(await members()).rows.find(m=>m.id===ids.a);assert.equal(a.location.lat,10.32);assert.ok(a.last_location_update);
  assert.equal((await db.query('select * from circle_location_shares where user_id=$1',[ids.a])).rows.length,0);
  await db.as(null,db,'anon');await assert.rejects(members(),/permission denied/);
});
test('stopping clears coordinates and invalidates queued updates even after re-enabling',async()=>{
  await db.as(ids.a);await db.query('select set_circle_location_sharing(false)');
  await assert.rejects(db.query('select publish_circle_location($1,10,123)',[generation]),/sharing stopped/);
  await db.as(ids.b);assert.equal((await members()).rows.find(m=>m.id===ids.a).location,null);
  await db.as(ids.a);const next=(await db.query('select (set_circle_location_sharing(true)).generation')).rows[0].generation;
  assert.notEqual(next,generation);await assert.rejects(db.query('select publish_circle_location($1,10,123)',[generation]),/sharing stopped/);
  await db.query('select publish_circle_location($1,10,123)',[next]);generation=next;
});
test('invalid and stale coordinates cannot be shared',async()=>{
  await db.as(ids.a);
  for(const latitude of [91,-91,'NaN','Infinity'])await assert.rejects(db.query('select publish_circle_location($1,$2,123)',[generation,latitude]),/Invalid coordinates/);
  await db.exec('reset role');await db.query("update circle_location_shares set updated_at=now()-interval '16 minutes' where user_id=$1",[ids.a]);
  await db.as(ids.b);assert.equal((await members()).rows.find(m=>m.id===ids.a).location,null);
});
test('concurrent stop and publish finish with no retained/shared location',async()=>{
  const publish=await db.connect(),stop=await db.connect();
  try{
    await db.as(ids.a,publish);await db.as(ids.a,stop);
    const result=await Promise.allSettled([publish.query('select publish_circle_location($1,10,123)',[generation]),stop.query('select set_circle_location_sharing(false)')]);
    assert.equal(result[1].status,'fulfilled');
  }finally{await publish.end();await stop.end();}
  await db.as(ids.b);assert.equal((await members()).rows.find(m=>m.id===ids.a).location,null);
});
test('leaving transfers ownership, revokes old invites, removes membership and stops sharing',async()=>{
  await db.as(ids.a);await db.query('select leave_circle($1)',[circle]);assert.equal((await members()).rows.length,0);
  await assert.rejects(db.query('select join_circle_by_code($1)',[code]),/invalid or expired/);
  await db.as(ids.b);const remaining=(await db.query('select * from circles where id=$1',[circle])).rows[0];assert.equal(remaining.owner_id,ids.b);assert.deepEqual(remaining.members,[ids.b]);assert.equal(remaining.invite_code,null);
  await assert.rejects(db.query('update circles set members=array[$1::uuid] where id=$2',[ids.a,circle]),/permission denied/);
  await db.query('select leave_circle($1)',[circle]);assert.equal((await db.query('select id from circles where id=$1',[circle])).rows.length,0);
});
