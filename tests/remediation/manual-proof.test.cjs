const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
let db,r,path;
before(async()=>{db=await startDatabase();await seed(db);});
after(async()=>db?.close());
const submit=(id=r.id,proof=path)=>db.query('select (submit_reservation_payment_proof($1,$2,$3,$4)).*',[id,proof,'SYNTHETIC-123456','09171234567']);
async function expire(id) {
  await db.exec('reset role');await db.query("update reservations set hold_expires_at=now()-interval '1 second' where id=$1",[id]);
}
async function store(proof,metadata={mimetype:'image/png',size:20}) {
  await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,metadata) values('payment-proofs',$1,$2)",[proof,JSON.stringify(metadata)]);
}
test('server owns timestamps, fee, status, and approval fields even when INSERT forges them',async()=>{
  await db.as(ids.a);
  r=await booking(db,{created_at:'2099-01-01',hold_expires_at:'2099-01-01',paid_at:'2020-01-01',approved_by:ids.a,
    proof_submitted_at:'2099-01-01',payment_status:'paid',status:'confirmed',fee:1,reservation_fee:1,payment_method:'gcash',payment_reference:'FORGED'});
  assert.equal(r.fee,'150.00');assert.equal(r.status,'pending_payment');assert.equal(r.payment_status,'pending');
  assert.equal(r.paid_at,null);assert.equal(r.approved_by,null);assert.equal(r.payment_reference,null);assert.equal(r.proof_submitted_at,null);
  assert.ok(Math.abs(Date.now()-r.created_at.getTime())<10000);assert.equal(r.hold_expires_at-r.created_at,300000);
  path=`${ids.a}/${r.id}/${randomUUID()}.png`;
});
test('anonymous, another customer, and owners cannot submit customer proof',async()=>{
  await store(path);
  for(const actor of [null,ids.b,ids.owner,ids.other,ids.admin]) {
    await db.as(actor,db,actor?'authenticated':'anon'); await assert.rejects(submit(),/permission denied|unavailable|Authentication/);
  }
});
test('customer cannot set paid, approved, fee, timestamps or insert arbitrary proof metadata directly',async()=>{
  await db.as(ids.a);
  for(const [column,value] of [['payment_status',"'paid'"],['status',"'confirmed'"],['fee','1'],['paid_at','now()'],['approved_by',`'${ids.a}'`],['created_at','now()'],['hold_expires_at',"now()+interval '1 year'"]]) {
    await assert.rejects(db.query(`update reservations set ${column}=${value} where id=$1`,[r.id]),/permission denied/);
  }
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('payment-proofs',$1,'{}')",[`${ids.a}/${r.id}/${randomUUID()}.png`]),/row-level security/);
});
test('proof must match customer and reservation, exist privately, and have validated MIME/size',async()=>{
  const wrong=`${ids.b}/${r.id}/${randomUUID()}.png`;
  const large=`${ids.a}/${r.id}/${randomUUID()}.png`;
  await store(wrong);await store(large,{mimetype:'image/png',size:5242881});
  await db.as(ids.a);
  for(const invalid of [wrong,large,`https://fixture.invalid/proof.png`,`${ids.a}/${r.id}/${randomUUID()}.png`]) await assert.rejects(submit(r.id,invalid),/validated proof/);
  await assert.rejects(db.query('select submit_reservation_payment_proof($1,$2,$3,$4)',[r.id,path,'x','123']),/valid payment reference/);
});
test('protected submission attaches proof but never marks paid; retry cannot extend 30-minute review',async()=>{
  await db.as(ids.a); const saved=(await submit()).rows[0];
  assert.equal(saved.payment_method,'gcash');assert.equal(saved.payment_proof_url,path);assert.equal(saved.payment_reference,'SYNTHETIC-123456');
  assert.equal(saved.payment_status,'pending');assert.equal(saved.paid_at,null);assert.equal(saved.approved_by,null);
  assert.equal(saved.hold_expires_at-saved.proof_submitted_at,1800000);
  const again=(await submit()).rows[0];assert.equal(again.hold_expires_at.getTime(),saved.hold_expires_at.getTime());
});
test('private proof is readable only by its customer, assigned owner and administrator, even with overlapping allow-all',async()=>{
  await db.exec('reset role');await db.exec('create policy legacy_allow_everything on storage.objects for all using(true) with check(true)');
  for(const [actor,visible] of [[null,false],[ids.a,true],[ids.b,false],[ids.owner,true],[ids.other,false],[ids.admin,true]]) {
    await db.as(actor,db,actor?'authenticated':'anon');
    assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,Number(visible),String(actor));
  }
  await db.as(ids.a);await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('payment-proofs',$1)",[`${ids.a}/${r.id}/${randomUUID()}.png`]),/row-level security/);
});
test('unrelated owner/customer cannot approve; assigned owner approval is atomic and duplicate preserves paid_at',async()=>{
  for(const actor of [ids.a,ids.b,ids.other]) {await db.as(actor);await assert.rejects(db.query('select approve_paid_reservation($1)',[r.id]),/assigned venue owner/);}
  await db.as(ids.owner);
  const approved=(await db.query('select (approve_paid_reservation($1)).*',[r.id])).rows[0];
  assert.equal(approved.status,'confirmed');assert.equal(approved.payment_status,'paid');assert.equal(approved.approved_by,ids.owner);
  assert.equal(approved.hold_expires_at,null);
  const again=(await db.query('select (approve_paid_reservation($1)).*',[r.id])).rows[0];assert.equal(again.paid_at.getTime(),approved.paid_at.getTime());
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from activities where type='reservation_approved' and target_id=$1",[r.id])).rows[0].n,1);
});
test('abandoned hold with no provider method expires, releases inventory, and allows a fresh claim',async()=>{
  await db.as(ids.a);const abandoned=await booking(db,{slot_id:'sunset'});assert.equal(abandoned.payment_method,null);
  await expire(abandoned.id);
  assert.equal((await db.query('select reservation_blocks_table(r) blocked from reservations r where id=$1',[abandoned.id])).rows[0].blocked,false);
  await db.as(ids.b);const replacement=await booking(db,{user_id:ids.b,slot_id:'sunset'});assert.ok(replacement.id);
  await db.exec('reset role');assert.equal((await db.query('select status from reservations where id=$1',[abandoned.id])).rows[0].status,'cancelled');
});
test('upload interruption or expired review cannot become paid or retake a released table',async()=>{
  await db.as(ids.a);const interrupted=await booking(db,{slot_id:'late'});
  const proof=`${ids.a}/${interrupted.id}/${randomUUID()}.png`;await store(proof);await expire(interrupted.id);
  await db.as(ids.a);await assert.rejects(submit(interrupted.id,proof),/no longer eligible/);
  await db.exec('reset role');await db.query('select expire_incomplete_reservation_holds()');
  await db.as(ids.a);const review=await booking(db,{slot_id:'late'});
  const reviewProof=`${ids.a}/${review.id}/${randomUUID()}.png`;await store(reviewProof);await db.as(ids.a);await submit(review.id,reviewProof);
  await expire(review.id);await db.as(ids.owner);await assert.rejects(db.query('select approve_paid_reservation($1)',[review.id]),/expired/);
  await db.as(ids.b);await booking(db,{user_id:ids.b,slot_id:'late'});
  await db.as(ids.admin);await assert.rejects(db.query('select approve_paid_reservation($1)',[review.id]),/expired/);
});
test('database failure rolls approval back and two concurrent approvals credit only once',async()=>{
  await db.exec('reset role');await db.query("update reservations set status='cancelled' where slot_id='sunset'");
  await db.as(ids.a);const pending=await booking(db,{slot_id:'sunset'});
  const proof=`${ids.a}/${pending.id}/${randomUUID()}.png`;await store(proof);await db.as(ids.a);await submit(pending.id,proof);
  await db.exec('reset role');await db.exec("create function reject_activity_fixture() returns trigger language plpgsql as $$ begin raise exception 'Injected activity failure'; end $$; create trigger reject_activity_fixture before insert on activities for each row execute function reject_activity_fixture()");
  await db.as(ids.owner);await assert.rejects(db.query('select approve_paid_reservation($1)',[pending.id]),/Injected/);
  await db.exec('reset role');assert.equal((await db.query('select payment_status from reservations where id=$1',[pending.id])).rows[0].payment_status,'pending');
  await db.exec('drop trigger reject_activity_fixture on activities; drop function reject_activity_fixture()');
  const clients=await Promise.all([db.connect(),db.connect()]);
  try {
    for(const client of clients) await db.as(ids.owner,client);
    const approved=await Promise.all(clients.map(client=>client.query('select paid_at from approve_paid_reservation($1)',[pending.id])));
    assert.equal(approved[0].rows[0].paid_at.getTime(),approved[1].rows[0].paid_at.getTime());
    assert.equal((await db.query("select count(*)::int n from activities where type='reservation_approved' and target_id=$1",[pending.id])).rows[0].n,1);
  } finally {for(const client of clients)await client.end();}
});
test('free bookings are not incomplete payment holds',async()=>{
  await db.exec('reset role');await db.query("update spots set gcash_amount=0,reservation_fee=0,payment_required=false,reservation_type='free' where id=$1",[ids.venue]);
  await db.query("update reservations set status='cancelled' where status <> 'confirmed'");
  await db.as(ids.a);const free=await booking(db,{slot_id:'late'});assert.equal(free.payment_required,false);assert.equal(free.hold_expires_at,null);
});
