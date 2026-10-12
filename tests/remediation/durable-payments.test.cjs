const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
let db,sequence=0;
before(async()=>{db=await startDatabase();await seed(db);});after(async()=>db?.close());
async function fresh() {
  await db.as(ids.a);
  const date=new Date(Date.now()+(++sequence+1)*86400000).toISOString().slice(0,10);
  return booking(db,{reservation_date:date});
}
async function begin(r,method='qrph',client=db,replace=false) {
  await db.as(null,client,'service_role');
  return (await client.query('select begin_checkout_attempt($1,$2,$3,$4) result',[r.id,ids.a,method,replace])).rows[0].result;
}
function request(p) {return {data:{attributes:{reference_number:p.reservation_id,metadata:{reservation_id:p.reservation_id,checkout_attempt_id:p.id},line_items:[{amount:15000,currency:'PHP',quantity:1}]}}};}
function session(p,{paid=false,id=`cs_${p.id.replaceAll('-','')}`,payment=`pay_${randomUUID().replaceAll('-','')}`}={}) {
  return {id,attributes:{livemode:false,reference_number:p.reservation_id,metadata:{reservation_id:p.reservation_id,checkout_attempt_id:p.id},
    line_items:[{amount:15000,currency:'PHP',quantity:1}],checkout_url:`https://checkout.paymongo.com/${id}`,status:'active',
    payments:paid?[{id:payment,attributes:{amount:15000,currency:'PHP',status:'paid',livemode:false,payment_intent_id:`pi_${p.id.replaceAll('-','')}`}}]:[]}};
}
async function allocate(r) {
  const result=await begin(r);const p=result.attempt;const body=request(p);
  await db.query('select prepare_checkout_request($1,$2)',[p.id,JSON.stringify(body)]);
  return p;
}
async function record(p,s=session(p)) {return db.query('select * from record_checkout_session($1,$2)',[p.id,JSON.stringify(s)]);}
async function ingest(p,s,event=`evt_${randomUUID().replaceAll('-','')}`,hash=createHash('sha256').update(JSON.stringify(s)).digest('hex')) {
  await db.as(null,db,'service_role');
  await db.query('select ingest_paymongo_event($1,$2,$3,$4,$5,$6)',[event,hash,'checkout_session.payment.paid',s.id,p.id,p.reservation_id]);
  return event;
}
async function apply(p,s,event=undefined,client=db) {
  event ??= await ingest(p,s);
  await db.as(null,client,'service_role');
  return (await client.query('select apply_paymongo_snapshot($1,$2,$3) result',[event,p.id,JSON.stringify(s)])).rows[0].result;
}
async function reservation(id) {await db.exec('reset role');return (await db.query('select * from reservations where id=$1',[id])).rows[0];}

test('customer, owner, administrator and anonymous JWTs cannot call trusted payment RPCs',async()=>{
  const r=await fresh();
  for(const actor of [null,ids.a,ids.b,ids.owner,ids.other,ids.admin]) {
    await db.as(actor,db,actor?'authenticated':'anon');
    await assert.rejects(db.query('select begin_checkout_attempt($1,$2,$3,false)',[r.id,ids.a,'qrph']),/permission denied/);
  }
});
test('attempt exists before provider interaction; concurrent claim returns one durable attempt and one creator',async()=>{
  const r=await fresh();const clients=await Promise.all([db.connect(),db.connect()]);
  try {
    const results=await Promise.all(clients.map(client=>begin(r,'qrph',client)));
    assert.deepEqual(results.map(x=>x.action).sort(),['busy','create']);assert.equal(results[0].attempt.id,results[1].attempt.id);
    await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from reservation_payments where reservation_id=$1',[r.id])).rows[0].n,1);
  } finally {for(const client of clients)await client.end();}
});
test('retry after an uncertain outcome keeps the idempotency key and exact provider request',async()=>{
  const r=await fresh();const p=await allocate(r);const original=request(p);
  await db.exec('reset role');await db.query("update reservation_payments set lease_expires_at=now()-interval '1 second',attempt_state='reconciliation_required' where id=$1",[p.id]);
  const retry=await begin(r);assert.equal(retry.action,'create');assert.equal(retry.attempt.idempotency_key,p.idempotency_key);
  assert.deepEqual(retry.attempt.checkout_request,original);
  const changed=structuredClone(original);changed.data.attributes.line_items[0].amount=1;
  const stored=(await db.query('select prepare_checkout_request($1,$2) saved',[p.id,JSON.stringify(changed)])).rows[0].saved;
  assert.deepEqual(stored,original);
});
test('active sessions are reused; replaced sessions must be retired before another attempt can be created',async()=>{
  const r=await fresh();const p=await allocate(r);await record(p);
  const reused=await begin(r);assert.equal(reused.action,'reuse');assert.equal(reused.attempt.id,p.id);
  assert.equal((await begin(r,'gcash')).action,'retire');assert.equal((await begin(r,'gcash')).action,'reconcile');
  const jobs=(await db.query('select * from claim_payment_retirements(10)')).rows;assert.ok(jobs.some(job=>job.attempt_id===p.id));
  await db.query('select finish_payment_retirement($1,false)',[p.id]);assert.equal((await begin(r,'gcash')).action,'reconcile');
  await db.query('select finish_payment_retirement($1,true)',[p.id]);const replacement=await begin(r,'gcash');
  assert.equal(replacement.action,'create');assert.notEqual(replacement.attempt.id,p.id);assert.notEqual(replacement.attempt.idempotency_key,p.idempotency_key);
});
test('session reference, metadata, amount, PHP currency and explicit test mode are required',async()=>{
  const r=await fresh();const p=await allocate(r);
  for(const mutate of [s=>s.attributes.livemode=true,s=>s.attributes.livemode=undefined,s=>s.attributes.reference_number=randomUUID(),
    s=>s.attributes.metadata.reservation_id=randomUUID(),s=>s.attributes.metadata.checkout_attempt_id=randomUUID(),
    s=>s.attributes.line_items[0].currency='USD',s=>s.attributes.line_items[0].amount=14999,s=>s.attributes.checkout_url='https://attacker.invalid/']) {
    const bad=session(p);mutate(bad);await assert.rejects(record(p,bad),/does not match/);
  }
  assert.equal((await record(p)).rows[0].attempt_state,'active');
});
test('paid event atomically credits reservation and payment; duplicate event and second delivery preserve paid_at',async()=>{
  const r=await fresh();const p=await allocate(r);const s=session(p,{paid:true});await record(p,s);const event=await ingest(p,s);
  assert.equal(await apply(p,s,event),'paid');const first=await reservation(r.id);
  assert.equal(first.status,'confirmed');assert.equal(first.payment_status,'paid');assert.equal(first.hold_expires_at,null);
  assert.equal(await apply(p,s,event),'paid');assert.equal(await apply(p,s),'duplicate');
  const again=await reservation(r.id);assert.equal(again.paid_at.getTime(),first.paid_at.getTime());
  const payment=(await db.query('select * from reservation_payments where id=$1',[p.id])).rows[0];assert.equal(payment.paid_at.getTime(),first.paid_at.getTime());
  assert.equal((await db.query("select count(*)::int n from activities where target_id=$1 and type='payment_received'",[r.id])).rows[0].n,1);
});
test('unique event identity cannot be reused for another payload',async()=>{
  const r=await fresh();const p=await allocate(r);const s=session(p);const event=await ingest(p,s);
  await assert.rejects(ingest(p,s,event,'f'.repeat(64)),/different content/);
});
test('wrong paid amount/currency/mode and duplicate payment ids never credit a reservation',async()=>{
  const r=await fresh();const p=await allocate(r);
  for(const mutate of [s=>s.attributes.payments[0].attributes.amount=1,s=>s.attributes.payments[0].attributes.currency='USD',s=>s.attributes.payments[0].attributes.livemode=true]) {
    const bad=session(p,{paid:true});mutate(bad);await assert.rejects(apply(p,bad),/mismatch/);
    assert.equal((await reservation(r.id)).payment_status,'pending');
  }
  const duplicateId='pay_shared_fixture';const s=session(p,{paid:true,payment:duplicateId});assert.equal(await apply(p,s),'paid');
  const r2=await fresh();const p2=await allocate(r2);await assert.rejects(apply(p2,session(p2,{paid:true,payment:duplicateId})),/duplicate key/);
  assert.equal((await reservation(r2.id)).payment_status,'pending');
});
test('injected database failure rolls payment, reservation and event processing back together',async()=>{
  const r=await fresh();const p=await allocate(r);const s=session(p,{paid:true});const event=await ingest(p,s);
  await db.exec('reset role');await db.exec("create function reject_paid_fixture() returns trigger language plpgsql as $$ begin raise exception 'Injected database failure'; end $$; create trigger reject_paid_fixture before insert on activities for each row execute function reject_paid_fixture()");
  await assert.rejects(apply(p,s,event),/Injected database failure/);
  const current=await reservation(r.id);assert.equal(current.payment_status,'pending');
  assert.equal((await db.query('select status from reservation_payments where id=$1',[p.id])).rows[0].status,'pending');
  assert.equal((await db.query('select state from payment_webhook_events where event_id=$1',[event])).rows[0].state,'pending');
  await db.exec('drop trigger reject_paid_fixture on activities; drop function reject_paid_fixture()');assert.equal(await apply(p,s,event),'paid');
});
test('paid after cancellation is retained for resolution without restoring the table; void cannot erase it',async()=>{
  const r=await fresh();const p=await allocate(r);await record(p);
  await db.as(ids.a);await db.query('select void_unpaid_reservation($1,$2)',[r.id,'Synthetic cancellation']);
  assert.equal(await apply(p,session(p,{paid:true})),'resolution_required');const current=await reservation(r.id);
  assert.equal(current.status,'cancelled');assert.equal(current.payment_status,'refund_pending');assert.equal(current.financial_resolution,'resolution_required');
  assert.equal((await db.query('select reservation_blocks_table(r) blocked from reservations r where id=$1',[r.id])).rows[0].blocked,false);
  await db.as(ids.a);await assert.rejects(db.query('select void_unpaid_reservation($1)',[r.id]),/unresolved payment/);
});
test('payment after hold expiry without a sweep cannot restore a table claim',async()=>{
  const r=await fresh();const p=await allocate(r);await record(p);
  await db.exec('reset role');await db.query("update reservations set hold_expires_at=now()-interval '1 second' where id=$1",[r.id]);
  assert.equal(await apply(p,session(p,{paid:true})),'resolution_required');const current=await reservation(r.id);assert.equal(current.status,'cancelled');
  assert.equal((await db.query('select reservation_blocks_table(r) blocked from reservations r where id=$1',[r.id])).rows[0].blocked,false);
});
test('a replaced session paid later enters resolution and does not confirm its replacement',async()=>{
  const r=await fresh();const p=await allocate(r);await record(p);await begin(r,'gcash');
  await db.query('select finish_payment_retirement($1,true)',[p.id]);await begin(r,'gcash');
  assert.equal(await apply(p,session(p,{paid:true})),'resolution_required');assert.equal((await reservation(r.id)).status,'cancelled');
});
test('concurrent webhook deliveries credit once; concurrent cancellation reaches a consistent financial outcome',async()=>{
  const r=await fresh();const p=await allocate(r);const s=session(p,{paid:true});await record(p,s);
  const e1=await ingest(p,s);const e2=await ingest(p,s);const clients=await Promise.all([db.connect(),db.connect()]);
  try {
    const results=await Promise.all([apply(p,s,e1,clients[0]),apply(p,s,e2,clients[1])]);assert.deepEqual(results.sort(),['duplicate','paid']);
  } finally {for(const client of clients)await client.end();}
  const r2=await fresh();const p2=await allocate(r2);const s2=session(p2,{paid:true});await record(p2,s2);const event=await ingest(p2,s2);
  const connections=await Promise.all([db.connect(),db.connect()]);
  try {
    await db.as(ids.a,connections[0]);
    const results=await Promise.allSettled([connections[0].query('select void_unpaid_reservation($1)',[r2.id]),apply(p2,s2,event,connections[1])]);
    assert.equal(results[1].status,'fulfilled');if(results[0].status==='rejected')assert.match(results[0].reason.message,/paid|voided/);
    const current=await reservation(r2.id);
    assert.ok((current.status==='confirmed'&&current.payment_status==='paid')||(current.status==='cancelled'&&current.payment_status==='refund_pending'));
  } finally {for(const client of connections)await client.end();}
});
test('out-of-order failure/expiry cannot downgrade a previously credited payment',async()=>{
  const r=await fresh();const p=await allocate(r);const paid=session(p,{paid:true});await apply(p,paid);
  const stale=session(p);stale.attributes.status='expired';assert.equal(await apply(p,stale),'unchanged');
  assert.equal((await reservation(r.id)).payment_status,'paid');
});
