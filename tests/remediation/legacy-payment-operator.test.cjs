const {test}=require('node:test');
const assert=require('node:assert/strict');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
const {fixture}=require('./payment-handler-harness.cjs');
test('actual operator handler reconciles legacy test sessions with real SQL and isolated provider',async t=>{
  const db=await startDatabase();
  try{
    await seed(db);let sequence=0;
    async function legacy(){
      await db.as(ids.a);const r=await booking(db,{reservation_date:`2032-12-${String(++sequence).padStart(2,'0')}`});const f=fixture(db,{userId:ids.a});
      assert.equal((await f.invoke('paymongo-create-qrph-checkout',{reservationId:r.id})).status,200);
      const sessionId=[...f.sessions.keys()][0];const session=f.sessions.get(sessionId);delete session.attributes.metadata.checkout_attempt_id;
      await db.exec('reset role');await db.query("update reservation_payments set checkout_request=null,attempt_state='reconciliation_required',raw_payload=$1 where reservation_id=$2",[JSON.stringify({data:{attributes:{livemode:false}}}),r.id]);
      const p=(await db.query('select * from reservation_payments where reservation_id=$1',[r.id])).rows[0];
      return {r,p,f,sessionId,session,invoke:action=>f.invoke('payment-reconcile-legacy-test',{action},{token:f.env.PAYMENT_WORKER_TOKEN})};
    }
    await t.test('verified paid outcome becomes a reviewed financial record without another checkout or expiry',async()=>{
      const {r,p,f,sessionId,invoke}=await legacy();f.paid(sessionId);const response=await invoke('reconcile-terminal');assert.equal(response.status,200);assert.equal((await response.json()).counts.paidRecorded,1);
      await db.exec('reset role');const after=(await db.query('select * from reservation_payments where id=$1',[p.id])).rows[0];assert.equal(after.status,'paid');assert.deepEqual(after.raw_payload,p.raw_payload);
      assert.equal((await db.query('select financial_resolution from reservations where id=$1',[r.id])).rows[0].financial_resolution,'resolution_required');
      assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url.endsWith('/v2/checkout_sessions')).length,1);assert.equal(f.calls.some(c=>c.url.endsWith('/expire')),false);
    });
    await t.test('open session remains unchanged until the explicit retire action, which verifies provider expiry',async()=>{
      const {p,f,sessionId,invoke}=await legacy();const first=await invoke('reconcile-terminal');assert.equal(first.status,200);assert.equal((await first.json()).counts.openUnchanged,1);
      await db.exec('reset role');assert.deepEqual((await db.query('select * from reservation_payments where id=$1',[p.id])).rows[0],p);assert.equal(f.calls.some(c=>c.url.endsWith('/expire')),false);
      const second=await invoke('retire-unused');assert.equal(second.status,200);assert.equal((await second.json()).counts.expiredRecorded,1);assert.equal(f.sessions.get(sessionId).attributes.status,'expired');
      assert.deepEqual(f.calls.filter(c=>c.url.includes('/checkout_sessions/'+sessionId)).slice(-3).map(c=>c.method),['GET','POST','GET']);
      const expireCalls=f.calls.filter(c=>c.url.endsWith('/expire')).length;assert.equal((await invoke('retire-unused')).status,200);assert.equal(f.calls.filter(c=>c.url.endsWith('/expire')).length,expireCalls);
    });
    await t.test('a payment racing expiry is recorded as paid and is never downgraded',async()=>{
      const {p,f,sessionId,session,invoke}=await legacy();let status='active';Object.defineProperty(session.attributes,'status',{configurable:true,enumerable:true,get:()=>status,set:value=>{if(value==='expired'){f.paid(sessionId);status='active';}else status=value;}});
      const result=await invoke('retire-unused');assert.equal(result.status,200);assert.equal((await result.json()).counts.paidRecorded,1);await db.exec('reset role');assert.equal((await db.query('select status from reservation_payments where id=$1',[p.id])).rows[0].status,'paid');
    });
    await t.test('lost expiry response is resolved by retrieving the same session, without creating another session',async()=>{
      const {p,f,session,invoke}=await legacy();let status='active';Object.defineProperty(session.attributes,'status',{configurable:true,enumerable:true,get:()=>status,set:value=>{status=value;throw Error('Synthetic response interrupted after expiry');}});
      const result=await invoke('retire-unused');assert.equal(result.status,200);assert.equal((await result.json()).counts.expiredRecorded,1);await db.exec('reset role');assert.equal((await db.query('select status from reservation_payments where id=$1',[p.id])).rows[0].status,'expired');
      assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url.endsWith('/v2/checkout_sessions')).length,1);
    });
    await t.test('provider failure leaves the payment untouched and cannot be reported as successful reconciliation',async()=>{
      const {p,f,invoke}=await legacy();f.state.failRetrieval=true;const response=await invoke('retire-unused');assert.equal(response.status,503);assert.equal((await response.json()).counts.failed,1);
      await db.exec('reset role');assert.deepEqual((await db.query('select * from reservation_payments where id=$1',[p.id])).rows[0],p);assert.equal(f.calls.some(c=>c.url.endsWith('/expire')),false);
    });
    await t.test('client tokens, live keys, arbitrary targets and invalid actions cannot reach provider or SQL writes',async()=>{
      const f=fixture(db,{userId:ids.a});assert.equal((await f.invoke('payment-reconcile-legacy-test',{action:'retire-unused'})).status,401);assert.equal(f.calls.length,0);
      const live=fixture(db,{userId:ids.a,env:{PAYMONGO_SECRET_KEY:'sk_live_synthetic'}});assert.equal((await live.invoke('payment-reconcile-legacy-test',{action:'retire-unused'},{token:live.env.PAYMENT_WORKER_TOKEN})).status,503);assert.equal(live.calls.length,0);
      for(const body of [{action:'mark-paid'},{action:'retire-unused',target_attempt_id:ids.b},{action:'retire-unused',after:'invalid'}])assert.equal((await f.invoke('payment-reconcile-legacy-test',body,{token:f.env.PAYMENT_WORKER_TOKEN})).status,400);
      assert.equal(f.calls.length,0);
    });
  }finally{await db.close();}
});
