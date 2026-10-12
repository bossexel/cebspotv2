const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const load=require('./load-client.cjs');
function fixture(options={}) {
  let handler;const removals=[];let lookups=0;
  const token='synthetic-private-worker-credential';
  load('supabase/functions/private-upload-maintenance/index.ts',{
    '../_shared/cors.ts':{jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status})}},
    '../_shared/paymongo.ts':{getRequiredEnv(){return token},makeServiceClient(){return {
      async rpc(name,args){lookups++;assert.equal(name,'list_expired_private_uploads');assert.equal(args.batch_size,50);return {data:[{bucket_id:'payment-proofs',object_name:'synthetic-proof.png'},{bucket_id:'owner-verification-documents',object_name:'synthetic-document.pdf'}],error:options.lookupError?{}:null}},
      storage:{from(bucket){return {async remove(names){removals.push({bucket,names});return {error:options.removeError?{}:null}}}}}}}},
    '../_shared/paymentSignature.ts':{async sha256(value){return createHash('sha256').update(value).digest('hex')}},
  },{Request,Response,Deno:{serve(fn){handler=fn}}});
  return {removals,get lookups(){return lookups},call(auth=`Bearer ${token}`){return handler(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:auth}}))}};
}
test('orphan maintenance requires its server credential before database or storage access',async()=>{
  const f=fixture();assert.equal((await f.call('Bearer customer-session')).status,401);assert.equal(f.lookups,0);assert.equal(f.removals.length,0);
});
test('cleanup uses Storage removal for both private buckets and reports failures for retry',async()=>{
  const f=fixture();const response=await f.call();assert.equal(response.status,200);assert.equal((await response.json()).removed,2);
  assert.deepEqual(f.removals.map(r=>r.bucket),['payment-proofs','owner-verification-documents']);
  for(const options of [{lookupError:true},{removeError:true}])assert.equal((await fixture(options).call()).status,503);
});
