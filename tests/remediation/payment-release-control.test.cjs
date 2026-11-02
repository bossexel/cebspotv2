const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
const load=require('./load-client.cjs');
const origin='https://abcdefghijklmnopqrst.supabase.co';const token='synthetic-worker-token-at-least-32-characters';const secret='synthetic-signing-secret';
const hook=(id,livemode=false,url=origin+'/functions/v1/paymongo-webhook')=>({id,type:'webhook',attributes:{livemode,url,status:'enabled',events:['payment.paid','checkout_session.payment.paid'],secret_key:secret}});
function fixture({key='sk_test_synthetic',hooks=[hook('hook_synthetic'),hook('hook_live',true)],failPut=false,losePut=false,rpcFail=false}={}){
  let handler;const calls=[];const env={PAYMENT_WORKER_TOKEN:token,PAYMONGO_SECRET_KEY:key,SUPABASE_URL:origin,PAYMONGO_TEST_WEBHOOK_SECRET:secret};
  load('supabase/functions/payment-release-control/index.ts',{
    '../_shared/cors.ts':{corsHeaders:{},jsonResponse:(body,status=200)=>Response.json(body,{status})},
    '../_shared/paymongo.ts':{getRequiredEnv:name=>{if(!env[name])throw Error('Missing fixture setting');return env[name];},makeServiceClient:()=>({rpc:async(name,args)=>{assert.equal(name,'configure_test_payment_maintenance');assert.equal(args.worker_token,token);calls.push({operation:'schedule'});return {data:{scheduled:true,secretStoredInVault:true},error:rpcFail?{}:null};}})},
    '../_shared/paymentSignature.ts':{sha256:async s=>createHash('sha256').update(s).digest('hex')},
    '../_shared/privateUpload.ts':{readPrivateUpload:async(request,_timeout,limit)=>{const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length>limit)throw Error('Too large');return bytes;}},
  },{Request,Response,Headers,URL,AbortSignal,btoa,Deno:{serve:fn=>{handler=fn;}},fetch:async(url,init)=>{
    calls.push({url,method:init.method||'GET',redirect:init.redirect});assert.equal(init.redirect,'error');assert.equal(new URL(url).origin,'https://api.paymongo.com');
    if((init.method||'GET')==='GET'){assert.equal(url,'https://api.paymongo.com/v1/webhooks');return Response.json({data:hooks});}
    assert.equal(init.method,'PUT');assert.equal(url,'https://api.paymongo.com/v1/webhooks/hook_synthetic');
    if(failPut)return Response.json({secret:'provider-private-body'},{status:503});
    Object.assign(hooks.find(h=>h.id==='hook_synthetic').attributes,JSON.parse(init.body).data.attributes);
    if(losePut){losePut=false;throw Error('Provider accepted but transport interrupted');}return Response.json({data:hooks[0]});
  }});
  return {calls,hooks,invoke:({auth=token,method='GET',body}={})=>handler(new Request(origin+'/control',{method,headers:auth?{Authorization:'Bearer '+auth}:{},...(method==='POST'?{body:JSON.stringify(body)}:{})}))};
}
test('release control inspection is read-only, test-scoped and returns no webhook identifiers or secrets',async()=>{
  const f=fixture();const r=await f.invoke();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const d=await r.json();assert.equal(d.readOnly,true);assert.equal(d.matchingEnabledTestHooks,1);assert.equal(d.secretMatches,true);assert.equal(d.routedToDurableTestHandler,false);assert.equal(f.calls.length,1);
  for(const value of [secret,'hook_synthetic','hook_live','sk_test_synthetic'])assert.equal(JSON.stringify(d).includes(value),false);
});
test('only an authorized operator with a test key can inspect or change routing',async()=>{
  for(const auth of ['', 'wrong']){const f=fixture();assert.equal((await f.invoke({auth})).status,401);assert.equal(f.calls.length,0);}
  const live=fixture({key:'sk_live_synthetic'});assert.equal((await live.invoke()).status,503);assert.equal(live.calls.length,0);
  const wrong=fixture();assert.equal((await wrong.invoke({method:'DELETE'})).status,405);assert.equal(wrong.calls.length,0);
});
test('activation preserves the live endpoint and signing secrets, verifies read-back and is repeatable',async()=>{
  const f=fixture();const liveBefore=JSON.stringify(f.hooks[1]);const before=await(await f.invoke()).json();const changed=await f.invoke({method:'POST',body:{action:'activate-test-webhook',expectedScopeHash:before.scopeHash}});assert.equal(changed.status,200);const after=await changed.json();assert.equal(after.changed,true);assert.equal(after.routedToDurableTestHandler,true);assert.equal(JSON.stringify(f.hooks[1]),liveBefore);assert.equal(f.hooks[0].attributes.secret_key,secret);assert.deepEqual(f.hooks[0].attributes.events,['checkout_session.payment.paid']);
  const again=await(await f.invoke({method:'POST',body:{action:'activate-test-webhook',expectedScopeHash:after.scopeHash}})).json();assert.equal(again.changed,false);assert.equal(f.calls.filter(c=>c.method==='PUT').length,1);
});
test('unknown, duplicate, mismatched and stale webhook configurations cannot be changed',async()=>{
  for(const hooks of [[],[hook('hook_synthetic'),hook('hook_other')],[hook('hook_synthetic',true)],[{...hook('hook_synthetic'),attributes:{...hook('hook_synthetic').attributes,secret_key:'another-secret'}}]]){
    const f=fixture({hooks});const before=await(await f.invoke()).json();assert.equal((await f.invoke({method:'POST',body:{action:'activate-test-webhook',expectedScopeHash:before.scopeHash}})).status,409);assert.equal(f.calls.some(c=>c.method==='PUT'),false);
  }
  const f=fixture();assert.equal((await f.invoke({method:'POST',body:{action:'activate-test-webhook',expectedScopeHash:'0'.repeat(64)}})).status,409);assert.equal(f.calls.some(c=>c.method==='PUT'),false);
});
test('interrupted activation requires reinspection, then reuses the completed configuration without another write',async()=>{
  const f=fixture({losePut:true});const before=await(await f.invoke()).json();assert.equal((await f.invoke({method:'POST',body:{action:'activate-test-webhook',expectedScopeHash:before.scopeHash}})).status,503);const current=await(await f.invoke()).json();assert.equal(current.routedToDurableTestHandler,true);assert.equal((await(await f.invoke({method:'POST',body:{action:'activate-test-webhook',expectedScopeHash:current.scopeHash}})).json()).changed,false);assert.equal(f.calls.filter(c=>c.method==='PUT').length,1);
});
test('provider errors and invalid operator payloads fail explicitly without leaking provider data',async()=>{
  const f=fixture({failPut:true});const before=await(await f.invoke()).json();const response=await f.invoke({method:'POST',body:{action:'activate-test-webhook',expectedScopeHash:before.scopeHash}});assert.equal(response.status,503);assert.equal((await response.text()).includes('provider-private-body'),false);
  for(const body of [{},{action:'refund',expectedScopeHash:before.scopeHash},{action:'activate-test-webhook',expectedScopeHash:before.scopeHash,url:'https://untrusted.invalid'}]){const g=fixture();assert.equal((await g.invoke({method:'POST',body})).status,400);assert.equal(g.calls.some(c=>c.method==='PUT'),false);}
});
test('maintenance configuration requires verified test routing, passes the server token only to the service RPC and surfaces failures',async()=>{
  const f=fixture();let summary=await(await f.invoke()).json();assert.equal((await f.invoke({method:'POST',body:{action:'configure-maintenance',expectedScopeHash:summary.scopeHash}})).status,409);assert.equal(f.calls.some(c=>c.operation==='schedule'),false);
  await f.invoke({method:'POST',body:{action:'activate-test-webhook',expectedScopeHash:summary.scopeHash}});summary=await(await f.invoke()).json();const result=await(await f.invoke({method:'POST',body:{action:'configure-maintenance',expectedScopeHash:summary.scopeHash}})).json();assert.equal(result.maintenanceScheduled,true);assert.equal(JSON.stringify(result).includes(token),false);
  const bad=fixture({hooks:structuredClone(f.hooks),rpcFail:true});const current=await(await bad.invoke()).json();assert.equal((await bad.invoke({method:'POST',body:{action:'configure-maintenance',expectedScopeHash:current.scopeHash}})).status,503);
});
