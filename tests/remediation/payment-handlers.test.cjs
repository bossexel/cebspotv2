const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {startDatabase}=require('./database.cjs');const {ids,seed,booking}=require('./fixtures.cjs');const {fixture}=require('./payment-handler-harness.cjs');
let db,sequence=0;
before(async()=>{db=await startDatabase();await seed(db);});after(async()=>db?.close());
test('payment maintenance serves CORS preflight without accessing payment state',async()=>{
  const {f}=await fresh();const response=await f.invoke('payment-maintenance',{}, {token:'',method:'OPTIONS'});
  assert.equal(response.status,200);assert.ok(response.headers.get('access-control-allow-origin'));
});
test('provider diagnostics retain safe categories, never provider details, and preserve the durable request',async()=>{
  for (const [status,code,expected] of [[400,'parameter_invalid','provider_400_parameter_invalid'],[503,'private-unrecognized-code','provider_503_unclassified']]) {
    const {f,r}=await fresh();f.state.failProvider=true;f.state.providerStatus=status;f.state.providerErrorCode=code;
    const response=await checkout(f,r);assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/Private provider|parameter_invalid|private-unrecognized/);
    const attempt=(await db.query('select * from reservation_payments where reservation_id=$1',[r.id])).rows[0];
    assert.equal(attempt.last_error_code,expected);assert.ok(attempt.checkout_request);assert.equal(attempt.attempt_state,'reconciliation_required');
    const worker=await f.invoke('payment-maintenance',{}, {token:f.env.PAYMENT_WORKER_TOKEN});assert.equal(worker.status,503);
    assert.equal((await db.query('select last_error_code from reservation_payments where id=$1',[attempt.id])).rows[0].last_error_code,expected);
  }
});
async function fresh(options={}){
  await db.as(ids.a);const r=await booking(db,{reservation_date:new Date(Date.now()+(++sequence+1)*86400000).toISOString().slice(0,10)});
  await db.exec('reset role');return {r,f:fixture(db,{userId:ids.a,...options})};
}
async function checkout(f,r,method='qrph'){return f.invoke(`paymongo-create-${method}-checkout`,{reservationId:r.id,successUrl:'https://attacker.invalid/'});}
async function saved(id){await db.exec('reset role');return (await db.query('select * from reservations where id=$1',[id])).rows[0];}
for(const method of ['gcash','qrph']){
  test(`${method}: checkout admission stays closed until the coordinated release is explicitly enabled`,async()=>{
    const {r}=await fresh();
    for(const value of [undefined,'false','1']){
      const f=fixture(db,{userId:ids.a,env:{PAYMENT_CHECKOUT_ENABLED:value}});
      const response=await checkout(f,r,method);assert.equal(response.status,503);assert.equal((await response.json()).retryable,true);assert.equal(f.calls.length,0);
      assert.equal((await db.query('select count(*)::int n from reservation_payments where reservation_id=$1',[r.id])).rows[0].n,0);
    }
  });
  test(`${method}: authenticated owner of reservation only; no provider calls for missing/other identity`,async()=>{
    const {f,r}=await fresh();assert.equal((await f.invoke(`paymongo-create-${method}-checkout`,{reservationId:r.id},{token:''})).status,401);
    const other=fixture(db,{userId:ids.b});assert.equal((await checkout(other,r,method)).status,503);assert.equal(other.calls.length,0);assert.equal(f.calls.length,0);
  });
  test(`${method}: durable pending checkout uses saved PHP amount/contact and an HTTPS return bridge`,async()=>{
    const {f,r}=await fresh();const response=await checkout(f,r,method);assert.equal(response.status,200);const result=await response.json();
    const attrs=f.calls[0].payload.data.attributes;assert.equal(attrs.line_items[0].amount,15000);assert.equal(attrs.line_items[0].currency,'PHP');
    assert.equal(attrs.payment_method_types[0],method);assert.equal(attrs.billing.email,r.guest_email);assert.equal(attrs.billing.phone,r.guest_phone);
    assert.ok(attrs.success_url.startsWith('https://admin.fixture.invalid/payment-return.html?'));assert.equal(attrs.metadata.reservation_id,r.id);assert.equal(attrs.metadata.checkout_attempt_id,result.attemptId);
    assert.equal((await saved(r.id)).payment_status,'pending');
    assert.equal((await checkout(f,r,method)).status,200);assert.equal(f.calls.length,1);
  });
  test(`${method}: provider timeout retains an attempt; retry uses same durable key and exact body`,async()=>{
    const {f,r}=await fresh();f.state.loseProviderResponseOnce=true;assert.equal((await checkout(f,r,method)).status,503);
    assert.equal((await db.query('select count(*)::int n from reservation_payments where reservation_id=$1',[r.id])).rows[0].n,1);
    assert.equal((await checkout(f,r,method)).status,200);assert.equal(f.sessions.size,1);assert.equal(f.calls[0].key,f.calls[1].key);assert.deepEqual(f.calls[0].payload,f.calls[1].payload);
  });
  test(`${method}: incomplete creation response is retrieved and strictly verified before returning checkout`,async()=>{
    const {f,r}=await fresh();f.state.omitCreationReference=true;
    const response=await checkout(f,r,method);assert.equal(response.status,200);const result=await response.json();
    assert.equal(f.calls.length,2);assert.equal(f.calls[1].method,'GET');assert.ok(f.calls[1].url.endsWith('/'+result.checkoutSessionId));
    assert.equal(f.sessions.size,1);assert.equal((await checkout(f,r,method)).status,200);assert.equal(f.calls.length,2);
  });
  test(`${method}: provider success followed by local persistence failure is reconciled without another session`,async()=>{
    const {f,r}=await fresh();f.state.failPersistOnce=true;assert.equal((await checkout(f,r,method)).status,503);
    assert.equal((await checkout(f,r,method)).status,200);assert.equal(f.sessions.size,1);assert.equal(f.calls[0].key,f.calls[1].key);
  });
  test(`${method}: database failure before attempt persistence cannot create a provider session`,async()=>{
    const {f,r}=await fresh();f.state.failDatabase=true;assert.equal((await checkout(f,r,method)).status,503);assert.equal(f.calls.length,0);
  });
}
test('test release refuses live credentials and live provider responses',async()=>{
  const {r}=await fresh();const live=fixture(db,{userId:ids.a,env:{PAYMONGO_SECRET_KEY:'sk_live_fixture'}});
  assert.equal((await checkout(live,r)).status,503);assert.equal(live.calls.length,0);
  const f=fixture(db,{userId:ids.a});f.state.liveResponse=true;assert.equal((await checkout(f,r)).status,503);assert.equal((await saved(r.id)).payment_status,'pending');
});
test('concurrent HTTP retries share one attempt and one provider creation',async()=>{
  const {f,r}=await fresh();const replies=await Promise.all([checkout(f,r),checkout(f,r)]);assert.ok(replies.some(reply=>reply.status===200));assert.ok(replies.every(reply=>[200,409].includes(reply.status)));assert.equal(f.sessions.size,1);
});
test('webhook requires fresh test signature, explicit test mode and unique identity',async()=>{
  const {f,r}=await fresh();const result=await (await checkout(f,r)).json();f.paid(result.checkoutSessionId);const payload=f.event(result.checkoutSessionId);
  assert.equal((await f.webhook(payload,{secret:'wrong'})).status,401);assert.equal((await f.webhook(payload,{timestamp:1})).status,401);
  const live=structuredClone(payload);live.data.attributes.livemode=true;assert.equal((await f.webhook(live)).status,400);
  assert.equal((await f.webhook(payload)).status,200);const original=(await saved(r.id)).paid_at.getTime();assert.equal((await f.webhook(payload)).status,200);assert.equal((await saved(r.id)).paid_at.getTime(),original);
  payload.data.attributes.type='checkout_session.expired';assert.equal((await f.webhook(payload)).status,422);
});
test('wrong amount and currency never mark payment or reservation paid',async()=>{
  for(const payment of [{amount:1},{currency:'USD'}]){
    const {f,r}=await fresh();const result=await (await checkout(f,r)).json();f.paid(result.checkoutSessionId,payment);
    assert.equal((await f.webhook(f.event(result.checkoutSessionId))).status,422);assert.equal((await saved(r.id)).payment_status,'pending');
  }
});
test('provider retrieval or database failure returns retryable delivery failure, then same event recovers',async()=>{
  const {f,r}=await fresh();const result=await (await checkout(f,r)).json();f.paid(result.checkoutSessionId);const payload=f.event(result.checkoutSessionId);
  f.state.failRetrieval=true;assert.equal((await f.webhook(payload)).status,503);assert.equal((await saved(r.id)).payment_status,'pending');
  f.state.failRetrieval=false;f.state.failDatabase=true;assert.equal((await f.webhook(payload)).status,503);
  f.state.failDatabase=false;assert.equal((await f.webhook(payload)).status,200);assert.equal((await saved(r.id)).payment_status,'paid');
});
test('signed webhook recovers provider success before local session persistence',async()=>{
  const {f,r}=await fresh();f.state.failPersistOnce=true;assert.equal((await checkout(f,r)).status,503);const id=[...f.sessions.keys()][0];f.paid(id);
  assert.equal((await f.webhook(f.event(id))).status,200);assert.equal((await saved(r.id)).payment_status,'paid');
});
test('paid-after-cancellation is recorded for refund review without reclaiming the table',async()=>{
  const {f,r}=await fresh();const result=await (await checkout(f,r)).json();await db.as(ids.a);await db.query('select void_unpaid_reservation($1)',[r.id]);await db.exec('reset role');
  f.paid(result.checkoutSessionId);assert.equal((await f.webhook(f.event(result.checkoutSessionId))).status,200);const current=await saved(r.id);
  assert.equal(current.status,'cancelled');assert.equal(current.payment_status,'refund_pending');assert.equal(current.financial_resolution,'resolution_required');
});
test('scheduled maintenance recovers unknown provider outcome, reconciles payment and retires cancelled sessions',async()=>{
  await db.exec('reset role');
  await db.query("update payment_session_retirements set state='complete'");
  await db.query("update reservation_payments set attempt_state='retired' where status<>'paid'");
  const {f,r}=await fresh();f.state.loseProviderResponseOnce=true;assert.equal((await checkout(f,r)).status,503);
  const id=[...f.sessions.keys()][0];f.paid(id);
  const response=await f.invoke('payment-maintenance',{}, {token:f.env.PAYMENT_WORKER_TOKEN});assert.equal(response.status,200);assert.equal((await saved(r.id)).payment_status,'paid');
  const second=await fresh();const result=await (await checkout(second.f,second.r)).json();await db.as(ids.a);await db.query('select void_unpaid_reservation($1)',[second.r.id]);await db.exec('reset role');
  // This fixture's provider contains only its own sessions; mark other fixture
  // outbox rows complete so maintenance cannot contact a different fake adapter.
  await db.query("update payment_session_retirements set state='complete' where attempt_id<>$1",[result.attemptId]);
  await db.query("update reservation_payments set attempt_state='retired' where id<>$1 and status<>'paid'",[result.attemptId]);
  assert.equal((await second.f.invoke('payment-maintenance',{}, {token:second.f.env.PAYMENT_WORKER_TOKEN})).status,200);
  assert.equal(second.f.sessions.get(result.checkoutSessionId).attributes.status,'expired');
});
test('ordinary user cannot invoke maintenance; unsafe return configuration fails before provider creation',async()=>{
  const {f,r}=await fresh();assert.equal((await f.invoke('payment-maintenance')).status,401);
  const unsafe=fixture(db,{userId:ids.a,env:{CHECKOUT_RETURN_BASE_URL:'https://attacker.invalid/arbitrary'}});
  assert.equal((await checkout(unsafe,r)).status,503);assert.equal(unsafe.calls.length,0);
});
test('complete database outage after provider creation is recovered by the scheduled worker',async()=>{
  const {f,r}=await fresh();f.state.failDbAfterCreationOnce=true;
  assert.equal((await checkout(f,r)).status,503);assert.equal(f.sessions.size,1);
  f.state.failDatabase=false;
  assert.equal((await f.invoke('payment-maintenance',{}, {token:f.env.PAYMENT_WORKER_TOKEN})).status,200);
  assert.equal(f.sessions.size,1);const calls=f.calls.filter(call=>call.url.endsWith('/v2/checkout_sessions'));
  assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);assert.deepEqual(calls[0].payload,calls[1].payload);
});
test('unknown attempts older than provider key retention require manual reconciliation and never create again',async()=>{
  await db.exec('reset role');await db.query("update reservation_payments set attempt_state='retired' where status<>'paid'");
  await db.query("update payment_session_retirements set state='complete'");
  const {f,r}=await fresh();f.state.loseProviderResponseOnce=true;assert.equal((await checkout(f,r)).status,503);
  await db.query("update reservation_payments set created_at=now()-interval '25 hours' where reservation_id=$1",[r.id]);
  const count=f.calls.length;const response=await f.invoke('payment-maintenance',{}, {token:f.env.PAYMENT_WORKER_TOKEN});
  assert.equal(response.status,503);assert.equal((await response.json()).counts.manual,1);assert.equal(f.calls.length,count);
});
