const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
function fixture(file,options={}) {
  const query={select(){return this},order(){return this},limit(){return this},eq(){return this},then(resolve){return Promise.resolve({data:options.data??[],error:options.error??null}).then(resolve)}};
  const client={from(){return query}};
  return load(file,{'../lib/supabase':{hasSupabaseConfig:options.configured??true,supabase:client}});
}
for(const [file,name,method,args] of [['src/services/localUpdateService.ts','localUpdateService','getLocalUpdates',[]],['src/services/activityService.ts','activityService','getRecentActivities',[20,'synthetic-user']]]) {
  test(`${name} distinguishes successful empty results from failed or unconfigured service`,async()=>{
    assert.equal((await fixture(file)[name][method](...args)).length,0);
    const real={id:'real-result',created_at:'2026-10-13T00:00:00Z'};
    assert.equal((await fixture(file,{data:[real]})[name][method](...args))[0].id,real.id);
    await assert.rejects(fixture(file,{error:{message:'Synthetic outage'}})[name][method](...args));
    await assert.rejects(fixture(file,{configured:false})[name][method](...args),/not configured/);
  });
}
