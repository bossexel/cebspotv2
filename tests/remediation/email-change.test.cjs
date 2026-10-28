// Local PostgreSQL only. Auth confirmation is simulated, never a hosted request.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
let db;
before(async()=>{db=await startDatabase();await seed(db)});after(async()=>db?.close());

test('confirmed email synchronizes through the existing Auth trigger while UUID ownership and historical contacts stay intact',async()=>{
  await db.as(ids.a);
  await db.query("update profiles set first_name='Alice',last_name='Cruz',photo_url='custom-photo.jpg' where id=$1",[ids.a]);
  const reservation=await booking(db,{guest_email:'a@fixture.example.test'});
  const post=(await db.query("insert into local_updates(user_id,user_name,title,body,location_name,media_urls) values($1,'Alice Cruz','My post','Original caption','Cebu',ARRAY['original.jpg']) returning *",[ids.a])).rows[0];
  const circle=(await db.query("insert into circles(name,owner_id,members) values('Friends',$1,ARRAY[$1::uuid]) returning *",[ids.a])).rows[0];
  await db.exec('reset role');
  const review=(await db.query("insert into reviews(spot_id,user_id,user_name,rating,comment) values($1,$2,'Alice Cruz',4,'Unchanged review') returning *",[ids.venue,ids.a])).rows[0];
  const comment=(await db.query("insert into local_update_comments(local_update_id,user_id,user_name,body) values($1,$2,'Bob','Original thread') returning *",[post.id,ids.b])).rows[0];
  const media=(await db.query("insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2) returning *",[`${ids.a}/avatar.jpg`,ids.a])).rows[0];
  const payment=(await db.query("insert into reservation_payments(reservation_id,user_id,spot_id,amount,raw_payload) values($1,$2,$3,150,$4) returning *",[reservation.id,ids.a,ids.venue,JSON.stringify({billing:{email:'a@fixture.example.test'}})])).rows[0];
  const snapshots=[];
  for(const [table,row] of [['local_updates',post],['reviews',review],['local_update_comments',comment],['circles',circle],['reservations',reservation],['reservation_payments',payment]])
    snapshots.push([table,(await db.query(`select * from ${table} where id=$1`,[row.id])).rows[0]]);
  const before=(await db.query('select * from profiles where id=$1',[ids.a])).rows[0];
  // Auth performs this only after its configured confirmation policy completes.
  await db.query("update auth.users set email='confirmed@fixture.example.test' where id=$1",[ids.a]);
  const after=(await db.query('select * from profiles where id=$1',[ids.a])).rows[0];
  assert.deepEqual(after,{...before,email:'confirmed@fixture.example.test',updated_at:after.updated_at});
  for(const [table,row] of snapshots)
    assert.deepEqual((await db.query(`select * from ${table} where id=$1`,[row.id])).rows[0],row,table);
  assert.deepEqual((await db.query('select * from storage.objects where id=$1',[media.id])).rows[0],media);
  await db.as(ids.a);
  assert.equal((await db.query('select id from reservations where id=$1',[reservation.id])).rows[0].id,reservation.id);
  assert.equal((await db.query("update profiles set first_name='Alicia' where id=$1 returning id",[ids.a])).rows[0].id,ids.a);
  await assert.rejects(db.query("update profiles set email='client-bypass@fixture.test' where id=$1",[ids.a]),/identity|email|managed/i);
  await db.as(ids.b);
  assert.equal((await db.query('select id from reservations where id=$1',[reservation.id])).rows.length,0);
});
