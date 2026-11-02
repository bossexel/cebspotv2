const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
const {paymentReadiness}=load('supabase/functions/_shared/paymentReadiness.ts');
const env={PAYMONGO_SECRET_KEY:'sk_test_synthetic',PAYMONGO_TEST_WEBHOOK_SECRET:'synthetic-webhook',PAYMENT_WORKER_TOKEN:'p'.repeat(32),PRIVATE_UPLOAD_WORKER_TOKEN:'u'.repeat(32),CHECKOUT_RETURN_BASE_URL:'https://synthetic.example.test/payment-return.html'};
test('payment readiness reports only contract and booleans, with no credential values',()=>{
  const result=paymentReadiness(name=>env[name]);assert.equal(result.configurationReady,true);
  assert.deepEqual(Object.keys(result).sort(),['checks','configurationReady','contract']);
  assert.ok(Object.values(result.checks).every(value=>typeof value==='boolean'));
  for(const value of Object.values(env))assert.equal(JSON.stringify(result).includes(value),false);
});
test('live/missing credentials and missing workers or return bridge fail closed',()=>{
  for(const [name,value] of [['PAYMONGO_SECRET_KEY','sk_live_synthetic'],['PAYMONGO_SECRET_KEY',''],['PAYMONGO_TEST_WEBHOOK_SECRET',''],['PAYMENT_WORKER_TOKEN','short'],['PRIVATE_UPLOAD_WORKER_TOKEN',''],['CHECKOUT_RETURN_BASE_URL','https://synthetic.example.test/other'],['CHECKOUT_RETURN_BASE_URL','http://synthetic.example.test/payment-return.html']]){
    const result=paymentReadiness(key=>key===name?value:env[key]);assert.equal(result.configurationReady,false,name);
  }
});
test('webhook GET stays unavailable and never invokes database, payment or signature handlers',async()=>{
  let handler;const forbidden=()=>{throw new Error('Readiness must have no side effects');};
  load('supabase/functions/paymongo-webhook/index.ts',{
    '../_shared/cors.ts':{corsHeaders:{},jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status})},
    '../_shared/paymongo.ts':{makeServiceClient:forbidden,paymongoRequest:forbidden},
    '../_shared/durableCheckout.ts':{paymentRpc:forbidden,PaymentDatabaseError:Error},
    '../_shared/privateUpload.ts':{readPrivateUpload:forbidden,UploadError:Error},
    '../_shared/paymentSignature.ts':{verifyTestPaymentSignature:forbidden,sha256:forbidden},
    '../_shared/paymentSnapshot.ts':{paymentSnapshot:forbidden},
    '../_shared/paymentReadiness.ts':{paymentReadiness},
  },{Request,Response,Deno:{env:{get:name=>env[name]},serve:fn=>{handler=fn}}});
  const response=await handler(new Request('https://synthetic.invalid/paymongo-webhook?readiness=1'));
  assert.equal(response.status,405);
  assert.equal((await handler(new Request('https://synthetic.invalid/paymongo-webhook'))).status,405);
});
test('standalone readiness can be deployed without replacing the existing payment webhook',async()=>{
  let handler;
  load('supabase/functions/payment-readiness/index.ts',{
    '../_shared/cors.ts':{corsHeaders:{},jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status})},
    '../_shared/paymentReadiness.ts':{paymentReadiness},
  },{Request,Response,Deno:{env:{get:name=>env[name]},serve:fn=>{handler=fn}}});
  const response=await handler(new Request('https://synthetic.invalid/payment-readiness'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('access-control-allow-methods'),'GET, OPTIONS');
  assert.equal((await handler(new Request('https://synthetic.invalid/payment-readiness',{method:'POST'}))).status,405);
});
