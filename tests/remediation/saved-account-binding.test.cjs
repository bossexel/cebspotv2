const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
function fixture(configured=true){
 let user='alice',reads=0,afterRead=()=>{};
 const prefix='cebspot_favorite_spot_ids:';
 const store=new Map([[prefix+'alice','["a","remove"]'],[prefix+'bob','["b"]']]);
 const writes=[];
 const api=load('src/services/savedSpotService.ts',{
  '@react-native-async-storage/async-storage':{default:{getItem:async key=>{const value=store.get(key);afterRead();return value},setItem:async(key,value)=>{writes.push({key,value});store.set(key,value)}}},
  '../lib/supabase':{hasSupabaseConfig:configured,supabase:{auth:{getSession:async()=>{reads++;return {data:{session:user?{user:{id:user}}:null},error:null}}}}},
 }).savedSpotService;
 return {api,store,writes,prefix,switchUser:value=>user=value,afterRead:fn=>afterRead=fn,get reads(){return reads}};
}
test('expected account mismatch rejects both bookmark reads and writes without touching storage',async()=>{
 const f=fixture();f.switchUser('bob');
 await assert.rejects(f.api.getSavedSpotIds('alice'),/account changed/i);
 await assert.rejects(f.api.saveSavedSpotIds(['a'],'alice'),/account changed/i);
 await assert.rejects(f.api.removeSavedSpotId('a','alice'),/account changed/i);
 assert.equal(f.writes.length,0);assert.equal(f.store.get(f.prefix+'bob'),'["b"]');
});
test('removal resolves identity once and cannot redirect an old-account list into a new account',async()=>{
 const f=fixture();f.afterRead(()=>f.switchUser('bob'));
 assert.equal(JSON.stringify(await f.api.removeSavedSpotId('remove','alice')),'["a"]');
 assert.equal(f.reads,1);assert.equal(f.writes[0].key,f.prefix+'alice');assert.equal(f.store.get(f.prefix+'bob'),'["b"]');
});
test('missing configuration or signed-out identity never falls back to guest storage for bound requests',async()=>{
 const f=fixture(false);await assert.rejects(f.api.getSavedSpotIds('alice'),/unavailable/i);await assert.rejects(f.api.saveSavedSpotIds(['a'],'alice'),/unavailable/i);assert.equal(f.writes.length,0);
 const g=fixture();g.switchUser(null);await assert.rejects(g.api.getSavedSpotIds('alice'),/account changed/i);assert.equal(g.writes.length,0);
});
test('corrupt bookmark storage remains an error rather than being overwritten with an empty list',async()=>{
 const f=fixture();f.store.set(f.prefix+'alice','broken JSON');await assert.rejects(f.api.getSavedSpotIds('alice'),/JSON|Unexpected/i);await assert.rejects(f.api.removeSavedSpotId('a','alice'),/JSON|Unexpected/i);assert.equal(f.writes.length,0);
});
