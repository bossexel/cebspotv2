const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
const {startDatabase}=require('./database.cjs');
const {fixture}=require('./payment-handler-harness.cjs');
let db,sequence=0;
before(async()=>{db=await startDatabase();});after(async()=>db?.close());
async function context(options={}) {
 const id=`31000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;
 await db.exec('reset role');await db.query('insert into auth.users(id,email) values($1,$2)',[id,`synthetic-${sequence}@example.test`]);
 const client=fixture(db,{userId:id}).client;
 const state={faceStatus:200,failStorage:false,failAuth:false,failCompletion:false,...options};
 const calls=[];let handler;
 const token='synthetic.'+Buffer.from(JSON.stringify({sub:id,amr:[{method:options.method??'password',timestamp:Math.floor(Date.now()/1000)-(options.age??0)}]})).toString('base64url')+'.signature';
 client.auth.getUser=async jwt=>({data:{user:jwt===token&&(await db.query('select id from auth.users where id=$1',[id])).rows.length?{id}:null},error:null});
 client.auth.admin={async deleteUser(target){calls.push('auth-delete');assert.equal(target,id);if(state.failAuth)return {error:{}};await db.exec('reset role');await db.query('delete from auth.users where id=$1',[target]);return {error:null}}};
 client.storage = { from(bucket) { return { async remove(paths) {
  calls.push('storage-remove');if(state.failStorage)return {error:{}};
  await db.exec('reset role');await db.query('delete from storage.objects where bucket_id=$1 and name=any($2::text[])',[bucket,paths]);return {error:null};
 } }; } };
 const originalRpc=client.rpc;
 client.rpc=async(name,args)=>{calls.push(name);if(name==='account_deletion_files'){
  const rows=await db.query('select * from account_deletion_files($1)',[id]);return {data:rows.rows,error:null};
 }return originalRpc(name,args)};
 const originalFrom=client.from;
 client.from=name=>{
  const query=originalFrom(name);
  if(state.failCompletion&&name==='account_deletion_requests')query.update=()=>({eq(){return {then(resolve){return Promise.resolve(resolve({error:{}}))}}}});
  return query;
 };
 load('supabase/functions/delete-account/index.ts',{
  '../_shared/cors.ts':{corsHeaders:{},jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status})},
  '../_shared/paymongo.ts':{makeServiceClient:()=>client,getRequiredEnv:name=>({FACE_BLUR_API_URL:'https://face.synthetic.invalid',ACCOUNT_DELETION_WORKER_TOKEN:'synthetic-worker-token-at-least-32-characters'})[name]},
 },{Request,Response,AbortSignal,atob,fetch:async(url,init)=>{calls.push('face-cleanup');assert.equal(new URL(url).pathname,`/internal/account-jobs/${id}`);assert.equal(init.method,'DELETE');return new Response('{}',{status:state.faceStatus})},Deno:{serve(fn){handler=fn}}});
 return {id,state,calls,async run(auth=token){await db.exec('reset role');return handler(new Request('https://synthetic.invalid/delete-account',{method:'POST',headers:{authorization:'Bearer '+auth},body:JSON.stringify({customer_id:'attacker-chosen-target'})}))},async elapsed(){await db.exec('reset role');await db.query("update account_deletion_requests set erase_after=now()-interval '1 second' where user_id=$1",[id])},async file(){await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,owner_id) values('payment-proofs',$1,$2)",[`${id}/synthetic/file.png`,id])}};
}
test('unauthenticated and stale/refreshed/recovery sessions cannot start deletion',async()=>{
 const f=await context();assert.equal((await f.run('invalid')).status,401);assert.equal(f.calls.length,0);
 for(const options of [{age:601},{method:'token_refresh'},{method:'recovery'}]){const other=await context(options);assert.equal((await other.run()).status,401);assert.equal(other.calls.length,0);}
});
test('face cleanup failure cannot create a locked account or delete Auth',async()=>{
 const f=await context({faceStatus:503});assert.equal((await f.run()).status,503);
 assert.equal((await db.query('select * from account_deletion_requests where user_id=$1',[f.id])).rows.length,0);assert.ok(!f.calls.includes('auth-delete'));
});
test('quiescence is resumable, idempotent and never reports premature deletion',async()=>{
 const f=await context();const first=await f.run();assert.equal(first.status,202);assert.equal(first.headers.get('retry-after'),'30');assert.equal((await first.json()).status,'pending');
 assert.equal((await f.run()).status,202);assert.ok(!f.calls.includes('auth-delete'));
 await f.elapsed();assert.equal((await f.run()).status,200);assert.ok(f.calls.includes('auth-delete'));
 assert.equal((await db.query('select id from auth.users where id=$1',[f.id])).rows.length,0);
});
test('storage failure retries the same job and Auth waits for actual cleanup',async()=>{
 const f=await context();await f.file();await f.run();await f.elapsed();f.state.failStorage=true;
 assert.equal((await f.run()).status,503);assert.ok(!f.calls.includes('auth-delete'));
 f.state.failStorage=false;const response=await f.run();assert.equal(response.status,200);assert.equal((await response.json()).status,'deleted');
 assert.ok(f.calls.indexOf('storage-remove')<f.calls.indexOf('auth-delete'));
});
test('running photo jobs and Auth deletion failure remain pending and resumable',async()=>{
 const f=await context({faceStatus:202});await f.run();await f.elapsed();assert.equal((await f.run()).status,202);assert.ok(!f.calls.includes('auth-delete'));
 f.state.faceStatus=200;f.state.failAuth=true;assert.equal((await f.run()).status,503);
 assert.equal((await db.query('select state from account_deletion_requests where user_id=$1',[f.id])).rows[0].state,'ready');
 f.state.failAuth=false;assert.equal((await f.run()).status,200);
});
test('failed final bookkeeping cannot turn successful Auth deletion into a retryable failure',async()=>{
 const f=await context();await f.run();await f.elapsed();f.state.failCompletion=true;
 assert.equal((await f.run()).status,200);assert.equal((await db.query('select id from auth.users where id=$1',[f.id])).rows.length,0);
});
