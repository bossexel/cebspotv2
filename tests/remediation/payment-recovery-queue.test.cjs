const {test}=require('node:test');
const assert=require('node:assert/strict');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
const {fixture}=require('./payment-handler-harness.cjs');
test('legacy manual backlog cannot starve a recoverable checkout; settled history is never retried',async()=>{
  const db=await startDatabase();
  try{
    await seed(db);await db.as(ids.a);
    const statuses=['pending','pending','pending','pending','pending','pending','paid','expired'];
    const legacyIds=[];
    for(let i=0;i<statuses.length;i++)legacyIds.push((await booking(db,{reservation_date:`2030-12-${String(i+1).padStart(2,'0')}`})).id);
    const current=await booking(db,{reservation_date:'2030-12-20'});
    await db.exec('reset role');
    for(const [i,status] of statuses.entries()){
      await db.query("insert into reservation_payments(reservation_id,user_id,spot_id,amount,status,attempt_state,created_at) values($1,$2,$3,150,$4,'reconciliation_required',now()-interval '2 days')",[legacyIds[i],ids.a,ids.venue,status]);
    }
    const before=(await db.query('select to_jsonb(p) body from reservation_payments p where reservation_id=any($1::uuid[]) order by id',[legacyIds])).rows;
    const f=fixture(db,{userId:ids.a});f.state.loseProviderResponseOnce=true;
    assert.equal((await f.invoke('paymongo-create-qrph-checkout',{reservationId:current.id})).status,503);
    await db.as(null,db,'service_role');
    const batch=(await db.query('select get_payment_recovery_batch(5) result')).rows[0].result;
    assert.equal(batch.manual_count,6);assert.equal(batch.attempts.length,1);
    assert.equal(batch.attempts[0].reservation_id,current.id);
    const response=await f.invoke('payment-maintenance',{}, {token:f.env.PAYMENT_WORKER_TOKEN});
    assert.equal(response.status,503,'manual reconciliation must remain visible');
    const body=await response.json();assert.equal(body.counts.manual,6);assert.equal(body.counts.recovered,1);
    assert.equal(f.sessions.size,1);
    const creates=f.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/v2/checkout_sessions'));
    assert.equal(creates.length,2);assert.equal(creates[0].key,creates[1].key);
    assert.deepEqual(creates[0].payload,creates[1].payload);
    assert.deepEqual((await db.query('select to_jsonb(p) body from reservation_payments p where reservation_id=any($1::uuid[]) order by id',[legacyIds])).rows,before);
    for(const id of [null,ids.a,ids.b,ids.owner,ids.other,ids.admin]){
      await db.as(id,db,id?'authenticated':'anon');
      await assert.rejects(db.query('select get_payment_recovery_batch(5)'),/permission denied/);
    }
  }finally{await db.close();}
});
