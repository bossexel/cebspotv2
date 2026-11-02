const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {startDatabase}=require('./database.cjs');
const {fromCatalog}=require('./catalog-fixture.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
const migration='supabase/migrations/20261102124004_legacy_test_payment_reconciliation.sql';
async function exercise(db,t){
  try{
    await seed(db);let sequence=0;
    async function legacy(extra={}){
      await db.as(ids.a);const r=await booking(db,{reservation_date:`2031-12-${String(++sequence).padStart(2,'0')}`});await db.exec('reset role');
      const raw={data:{attributes:{livemode:false,original:'synthetic-preserved-payload'}}};
      const p=(await db.query("insert into reservation_payments(reservation_id,user_id,spot_id,provider,payment_method,amount,currency,status,attempt_state,provider_checkout_session_id,raw_payload) values($1,$2,$3,'paymongo','qrph',150,'PHP','pending','reconciliation_required',$4,$5) returning *",[r.id,ids.a,ids.venue,'cs_legacy_synthetic_'+sequence,JSON.stringify(extra.raw??raw)])).rows[0];
      const snapshot={id:p.provider_checkout_session_id,type:'checkout_session',attributes:{livemode:false,reference_number:r.id,metadata:{reservation_id:r.id},line_items:[{amount:15000,currency:'PHP',quantity:1}],status:'active',payments:[{id:'pay_legacy_synthetic_'+sequence,attributes:{amount:15000,currency:'PHP',status:'paid',livemode:false,payment_intent_id:'pi_legacy_synthetic_'+sequence}}]}};
      return {r,p,snapshot};
    }
    const call=async(p,s,connection=db)=>{await db.as(null,connection,'service_role');return(await connection.query('select reconcile_legacy_test_checkout($1,$2) result',[p.id,JSON.stringify(s)])).rows[0].result;};
    const payment=async p=>{await db.exec('reset role');return(await db.query('select * from reservation_payments where id=$1',[p.id])).rows[0];};
    await t.test('migration rerun preserves original shared guards',async()=>{
      await db.exec('reset role');const before=(await db.query("select pg_get_functiondef('public.require_active_account()'::regprocedure) a,pg_get_functiondef('public.guard_profile_identity()'::regprocedure) b")).rows[0];
      await db.exec(fs.readFileSync(migration,'utf8'));await db.exec(fs.readFileSync(migration,'utf8'));
      assert.deepEqual((await db.query("select pg_get_functiondef('public.require_active_account()'::regprocedure) a,pg_get_functiondef('public.guard_profile_identity()'::regprocedure) b")).rows[0],before);
    });
    await t.test('all six client roles are denied financial reconciliation',async()=>{
      const {p,snapshot}=await legacy();for(const id of [null,ids.a,ids.b,ids.owner,ids.other,ids.admin]){await db.as(id,db,id?'authenticated':'anon');await assert.rejects(db.query('select reconcile_legacy_test_checkout($1,$2)',[p.id,JSON.stringify(snapshot)]),/permission denied/);}
    });
    await t.test('paid legacy session records one reviewed payment without reopening inventory or overwriting original financial data',async()=>{
      const {r,p,snapshot}=await legacy();assert.equal(await call(p,snapshot),'paid_resolution_required');const after=await payment(p);
      for(const key of ['id','reservation_id','user_id','spot_id','amount','currency','raw_payload','idempotency_key','created_at','provider_checkout_session_id'])assert.deepEqual(after[key],p[key],key);
      assert.equal(after.status,'paid');assert.equal(after.attempt_state,'complete');assert.equal(after.provider_payment_id,snapshot.attributes.payments[0].id);
      const current=(await db.query('select status,payment_status,financial_resolution from reservations where id=$1',[r.id])).rows[0];assert.deepEqual(current,{status:'cancelled',payment_status:'refund_pending',financial_resolution:'resolution_required'});
      assert.equal(await call(p,snapshot),'paid_resolution_required');assert.deepEqual((await payment(p)).paid_at,after.paid_at);
      assert.equal((await db.query('select count(*)::int n from payment_webhook_events where attempt_id=$1',[p.id])).rows[0].n,1);
    });
    await t.test('concurrent delivery makes one transition and stale expiry cannot downgrade payment',async()=>{
      const {p,snapshot}=await legacy();const connections=await Promise.all([db.connect(),db.connect()]);
      try{assert.deepEqual(await Promise.all(connections.map(c=>call(p,snapshot,c))),['paid_resolution_required','paid_resolution_required']);}finally{await Promise.all(connections.map(c=>c.end()));}
      const before=await payment(p);const expired=structuredClone(snapshot);expired.attributes.payments=[];expired.attributes.status='expired';assert.equal(await call(p,expired),'duplicate');assert.deepEqual(await payment(p),before);
    });
    await t.test('identity, currency, amount, mode and duplicate-payment mismatches roll back without financial writes',async()=>{
      const {p,snapshot}=await legacy();for(const alter of [s=>{s.id='cs_wrong';},s=>{s.attributes.metadata.reservation_id=ids.b;},s=>{s.attributes.metadata.checkout_attempt_id=ids.b;},s=>{s.attributes.reference_number=ids.b;},s=>{s.attributes.livemode=true;},s=>{s.attributes.line_items[0].amount=99;},s=>{s.attributes.payments[0].attributes.currency='USD';},s=>{s.attributes.payments[0].attributes.livemode=true;},s=>{s.attributes.payments.push(structuredClone(s.attributes.payments[0]));}]){
        const changed=structuredClone(snapshot);alter(changed);await assert.rejects(call(p,changed),/mismatch|Multiple payments/);assert.deepEqual(await payment(p),p);
      }
    });
    await t.test('an open unpaid session cannot be cleared; verified provider expiry preserves the booking',async()=>{
      const {r,p,snapshot}=await legacy();snapshot.attributes.payments=[];await assert.rejects(call(p,snapshot),/terminal provider state/);assert.deepEqual(await payment(p),p);
      await db.exec('reset role');const before=(await db.query('select to_jsonb(r) value from reservations r where id=$1',[r.id])).rows[0].value;
      snapshot.attributes.status='expired';assert.equal(await call(p,snapshot),'expired');const current=await payment(p);assert.equal(current.status,'expired');assert.equal(current.attempt_state,'retired');assert.equal((await db.query('select to_jsonb(r) value from reservations r where id=$1',[r.id])).rows[0].value.status,before.status);
      assert.deepEqual((await db.query('select to_jsonb(r) value from reservations r where id=$1',[r.id])).rows[0].value,before);
    });
    await t.test('records marked live cannot be relabelled by a test-mode response',async()=>{
      const {p,snapshot}=await legacy({raw:{livemode:true}});await assert.rejects(call(p,snapshot),/identity or amount mismatch/);assert.deepEqual(await payment(p),p);
    });
    await t.test('a test attempt cannot alter a booking with historical live or unknown-mode obligations',async()=>{
      const {r,p,snapshot}=await legacy();await db.exec('reset role');
      await db.query("insert into reservation_payments(reservation_id,user_id,spot_id,provider,payment_method,amount,currency,status,attempt_state,provider_checkout_session_id,raw_payload) values($1,$2,$3,'paymongo','qrph',150,'PHP','expired','reconciliation_required','cs_synthetic_live_sibling',$4)",[r.id,ids.a,ids.venue,JSON.stringify({livemode:true})]);
      await assert.rejects(call(p,snapshot),/Mixed or unknown/);assert.deepEqual(await payment(p),p);
    });
  }finally{await db.close();}
}
test('legacy test reconciliation on fresh full-chain database',async t=>exercise(await startDatabase(),t));
test('legacy test reconciliation on captured beta plus focused upgrades',{skip:!process.env.RESERVATION_SCHEMA_CAPTURE},async t=>{
  const capture=JSON.parse(fs.readFileSync(process.env.RESERVATION_SCHEMA_CAPTURE,'utf8').replace(/^\uFEFF/,''));const db=await fromCatalog(capture.rows[0].catalog);
  try{for(const file of ['20261101192553_align_reservation_backend.sql','20261102070521_reservation_private_upload_dependencies.sql','20261102124004_legacy_test_payment_reconciliation.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));}catch(e){await db.close();throw e;}
  await exercise(db,t);
});
