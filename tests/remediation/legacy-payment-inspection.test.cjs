const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const load=require('./load-client.cjs');
const {inspectLegacyTestPayments}=load('supabase/functions/_shared/legacyPaymentInspection.ts');
const row=(n=1,extra={})=>({id:'synthetic-attempt-'+n,reservation_id:'synthetic-booking-'+n,provider_checkout_session_id:'cs_synthetic_'+n,amount:1,currency:'PHP',status:'pending',checkout_request:null,raw_payload:{data:{attributes:{livemode:false,billing:{name:'synthetic-private-name'}}}},...extra});
const session=(r,extra={})=>({id:r.provider_checkout_session_id,type:'checkout_session',attributes:{livemode:false,reference_number:r.reservation_id,metadata:{reservation_id:r.reservation_id},line_items:[{amount:100,currency:'PHP',quantity:1}],payments:[],status:'active',...extra}});
const paid=r=>session(r,{payments:[{id:'pay_synthetic_1',attributes:{amount:100,currency:'PHP',livemode:false,status:'paid'}}]});

test('read-only legacy report verifies four paid matches and six open sessions across bounded batches',async()=>{
  const rows=Array.from({length:10},(_,i)=>row(i+1));const calls=[];
  const retrieve=async id=>{calls.push(id);const r=rows.find(r=>r.provider_checkout_session_id===id);return rows.indexOf(r)<4?paid(r):session(r);};
  const first=await inspectLegacyTestPayments(rows,retrieve);assert.equal(first.checked,5);assert.equal(first.nextOffset,5);assert.equal(first.checks.paidMatching,4);assert.equal(first.checks.unpaidOpen,1);
  const second=await inspectLegacyTestPayments(rows,retrieve,5);assert.equal(second.checked,5);assert.equal(second.nextOffset,null);assert.equal(second.checks.unpaidOpen,5);assert.equal(calls.length,10);
  const report=JSON.stringify([first,second]);for(const sensitive of ['synthetic-private-name','cs_synthetic_','synthetic-booking-','pay_synthetic_'])assert.equal(report.includes(sensitive),false);
});
test('recorded live, unknown, non-checkout and durable attempts are never sent to the provider',async()=>{
  let calls=0;const rows=[row(1,{raw_payload:{livemode:true}}),row(2,{raw_payload:{}}),row(3,{provider_checkout_session_id:'pi_synthetic'}),row(4,{checkout_request:{data:{}}})];
  const result=await inspectLegacyTestPayments(rows,async()=>{calls++;throw Error('Forbidden');});
  assert.equal(calls,0);for(const key of ['liveModeSkipped','unknownModeSkipped','unsupportedSessionSkipped','durableRequestsSkipped'])assert.equal(result.scope[key],1);
});
for(const [label,alter,expected] of [
  ['wrong session',s=>{s.id='cs_another';},'referenceMismatch'],
  ['wrong booking reference',s=>{s.attributes.reference_number='another-booking';},'referenceMismatch'],
  ['missing reservation metadata',s=>{s.attributes.metadata={};},'referenceMismatch'],
  ['live provider session',s=>{s.attributes.livemode=true;},'modeMismatch'],
  ['wrong amount',s=>{s.attributes.line_items[0].amount=999;},'amountOrCurrencyMismatch'],
  ['wrong currency',s=>{s.attributes.line_items[0].currency='USD';},'amountOrCurrencyMismatch'],
  ['wrong paid amount',s=>{s.attributes.payments[0].attributes.amount=999;},'amountOrCurrencyMismatch'],
  ['live payment',s=>{s.attributes.payments[0].attributes.livemode=true;},'modeMismatch'],
  ['two paid transactions',s=>{s.attributes.payments.push(structuredClone(s.attributes.payments[0]));},'unexpectedStatus'],
  ['missing payment evidence',s=>{delete s.attributes.payments;},'unexpectedStatus'],
])test('legacy report fails closed for '+label,async()=>{
  const r=row();const s=paid(r);alter(s);const result=await inspectLegacyTestPayments([r],async()=>s);assert.equal(result.checks[expected],1);assert.equal(result.checks.paidMatching,0);
});
test('provider failure remains cannot-verify and a retry can observe the real status without writes',async()=>{
  const r=row();const failure=await inspectLegacyTestPayments([r],async()=>{throw Error('provider private response');});assert.equal(failure.checks.cannotVerify,1);assert.equal(JSON.stringify(failure).includes('private response'),false);
  const retry=await inspectLegacyTestPayments([r],async()=>session(r,{status:'expired'}));assert.equal(retry.checks.expired,1);
});

function handlerFixture({rows=[row()],key='sk_test_synthetic',dbError=false,providerStatus=200}={}){
  let handler;const calls=[];const token='synthetic-operator-token-of-at-least-32-characters';
  const env={PAYMENT_WORKER_TOKEN:token,PAYMONGO_SECRET_KEY:key};
  const query={select(columns){calls.push({operation:'select',columns});return this;},eq(){return this;},order(){return this;},limit(){return Promise.resolve({data:rows,error:dbError?{}:null});}};
  load('supabase/functions/payment-reconciliation-report/index.ts',{
    '../_shared/cors.ts':{corsHeaders:{},jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status})},
    '../_shared/paymongo.ts':{getRequiredEnv:name=>env[name],makeServiceClient:()=>({from(table){assert.equal(table,'reservation_payments');return query;}})},
    '../_shared/paymentSignature.ts':{sha256:async value=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex')},
    '../_shared/legacyPaymentInspection.ts':{inspectLegacyTestPayments},
  },{Request,Response,Headers,URL,AbortSignal,btoa,Deno:{serve:fn=>{handler=fn;}},fetch:async(url,init)=>{
    calls.push({operation:'provider',url,method:init.method,redirect:init.redirect});assert.ok(init.headers.Authorization.startsWith('Basic '));
    const r=rows.find(r=>url.endsWith('/'+r.provider_checkout_session_id));return Response.json(providerStatus===200?{data:paid(r)}:{private:'provider detail'},{status:providerStatus});
  }});
  return {calls,invoke:({auth=token,method='GET',query=''}={})=>handler(new Request('https://synthetic.invalid/report'+query,{method,headers:auth?{Authorization:'Bearer '+auth}:{}}))};
}
test('actual report handler authenticates operator, restricts provider calls to GET, and returns no identifiers',async()=>{
  const f=handlerFixture();const response=await f.invoke();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const result=await response.json();assert.equal(result.checks.paidMatching,1);assert.match(result.scopeHash,/^[a-f0-9]{64}$/);
  const provider=f.calls.find(c=>c.operation==='provider');assert.equal(provider.url,'https://api.paymongo.com/v1/checkout_sessions/cs_synthetic_1');assert.equal(provider.method,'GET');assert.equal(provider.redirect,'error');
  const text=JSON.stringify(result);for(const privateValue of ['cs_synthetic_1','synthetic-private-name','sk_test_synthetic'])assert.equal(text.includes(privateValue),false);
});
test('missing or incorrect operator token cannot query database or provider',async()=>{
  for(const auth of ['', 'wrong']){const f=handlerFixture();assert.equal((await f.invoke({auth})).status,401);assert.equal(f.calls.length,0);}
});
test('live keys, invalid offset and mutation methods fail before database or provider access',async()=>{
  const live=handlerFixture({key:'sk_live_synthetic'});assert.equal((await live.invoke()).status,503);assert.equal(live.calls.length,0);
  for(const query of ['?offset=-1','?offset=1.5','?offset=100','?apply=1']){const f=handlerFixture();assert.equal((await f.invoke({query})).status,400);assert.equal(f.calls.length,0);}
  for(const method of ['POST','PUT','DELETE']){const f=handlerFixture();assert.equal((await f.invoke({method})).status,405);assert.equal(f.calls.length,0);}
});
test('database failure, oversize scope and provider failure stay explicit without leaking private details',async()=>{
  const bad=handlerFixture({dbError:true});assert.equal((await bad.invoke()).status,503);assert.equal(bad.calls.some(c=>c.operation==='provider'),false);
  const large=handlerFixture({rows:Array.from({length:101},(_,i)=>row(i))});assert.equal((await large.invoke()).status,409);assert.equal(large.calls.some(c=>c.operation==='provider'),false);
  const provider=handlerFixture({providerStatus:503});const result=await(await provider.invoke()).json();assert.equal(result.checks.cannotVerify,1);assert.equal(JSON.stringify(result).includes('provider detail'),false);
});
