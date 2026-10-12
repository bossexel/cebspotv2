const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const load=require('./load-client.cjs');
const {ids}=require('./fixtures.cjs');
const helpers=load('supabase/functions/_shared/privateUpload.ts');
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
const resource='40000000-0000-4000-8000-000000000001';
function fixture(options={}) {
  let handler;const writes=[];let reads=0;
  const record={id:resource,user_id:ids.a,status:'pending_payment',payment_required:true,payment_status:'pending',payment_method:null,hold_expires_at:new Date(Date.now()+300000).toISOString(),...options.record};
  const client={from(){let matches=true;return {select(){reads++;return this},eq(key,value){matches &&= record[key]===value;return this},async single(){return {data:matches?record:null,error:null}}}},storage:{from(bucket){return {async upload(path,bytes,settings){writes.push({bucket,path,bytes,settings});return {error:options.failStorage?{}:null}}}}}};
  client.rpc=async(name,args)=>{
    reads++;
    if(options.rateLimited)return {data:{allowed:false,retry_after:60},error:null};
    const valid=args.customer_id===record.user_id && args.target_resource_id===record.id && record.payment_required
      && ['pending','pending_payment','rescheduled'].includes(record.status) && ['pending','unpaid','failed'].includes(record.payment_status)
      && (!record.payment_method || record.payment_method==='gcash') && Date.parse(record.hold_expires_at)>Date.now();
    return valid?{data:{allowed:true,id:webcrypto.randomUUID()},error:null}:{data:null,error:{code:'42501'}};
  };
  load('supabase/functions/private-upload/index.ts',{
    '../_shared/cors.ts':{corsHeaders:{},jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status})}},
    '../_shared/paymongo.ts':{makeServiceClient:()=>client,async getUserFromRequest(req){if(req.headers.get('authorization')!=='Bearer fixture-auth')throw Error('Auth');return {id:ids.a}}},
    '../_shared/privateUpload.ts':helpers,
  },{Request,Response,crypto:webcrypto,Deno:{serve(fn){handler=fn}}});
  return {writes,get reads(){return reads},call({body=png,mime='image/png',auth='Bearer fixture-auth',id=resource,kind='reservation_proof',method='POST'}={}){return handler(new Request(`https://fixture.invalid/private-upload?kind=${kind}&resourceId=${id}`,{method,headers:{authorization:auth,'content-type':mime},...(method==='POST'?{body}:{} )}))}};
}
test('unauthenticated upload is rejected before reading reservation or bytes',async()=>{
  const f=fixture();assert.equal((await f.call({auth:''})).status,401);assert.equal(f.reads,0);assert.equal(f.writes.length,0);
});
test('only an owned active reservation permits private upload',async()=>{
  for(const record of [{user_id:ids.b},{status:'cancelled'},{payment_status:'paid'},{payment_method:'paymongo_qrph'},{hold_expires_at:new Date(0).toISOString()},{payment_required:false}]) {
    const f=fixture({record});assert.ok([403,409].includes((await f.call()).status));assert.equal(f.writes.length,0);
  }
});
test('validated upload gets a private user/reservation/random-object path',async()=>{
  const f=fixture();const response=await f.call();assert.equal(response.status,201);
  const {path}=await response.json();assert.ok(path.startsWith(`${ids.a}/${resource}/`));assert.ok(path.endsWith('.png'));
  assert.equal(f.writes[0].bucket,'payment-proofs');assert.equal(f.writes[0].settings.upsert,false);assert.equal(f.writes[0].settings.contentType,'image/png');
});
test('MIME mismatch, empty files, excess bytes and unsupported request kinds do not write storage',async()=>{
  for(const input of [{mime:'image/jpeg'},{body:new Uint8Array()},{body:new Uint8Array(5*1024*1024+1)},{mime:'text/html'},{kind:'arbitrary_bucket'},{id:'../escape'}]) {
    const f=fixture();assert.ok([400,413,415].includes((await f.call(input)).status));assert.equal(f.writes.length,0);
  }
});
test('persistent admission refusal returns predictable 429 and Retry-After before storage writes',async()=>{
  const f=fixture({rateLimited:true});const response=await f.call();assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');assert.equal(f.writes.length,0);
});
test('storage failure has predictable 503 without exposing credentials or private content',async()=>{
  const f=fixture({failStorage:true});const response=await f.call();assert.equal(response.status,503);assert.deepEqual(Object.keys(await response.json()),['error']);
});
test('streaming body limit works without a Content-Length header and cancels the stream',async()=>{
  let cancelled=false;let chunks=0;
  const stream=new ReadableStream({pull(controller){chunks++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true}});
  await assert.rejects(helpers.readPrivateUpload(new Request('https://fixture.invalid',{method:'POST',body:stream,duplex:'half'})),error=>error.status===413);
  assert.equal(cancelled,true);assert.ok(chunks<=8);
});
test('stalled uploads time out and release the body reader',async()=>{
  let cancelled=false;const stream=new ReadableStream({pull(){return new Promise(()=>{})},cancel(){cancelled=true}});
  await assert.rejects(helpers.readPrivateUpload(new Request('https://fixture.invalid',{method:'POST',body:stream,duplex:'half'}),25),error=>error.status===408);
  assert.equal(cancelled,true);
});
