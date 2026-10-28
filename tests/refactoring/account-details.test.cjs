const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('../remediation/load-client.cjs');

function fixture({profile={id:'alice',first_name:'Ana',last_name:'Dela Cruz',display_name:'Ana Dela Cruz'},authError=null,profileError=null,sessionId='alice',returnedId='alice'}={}){
  const calls=[];
  const {accountDetailsService,validateAccountNames}=load('src/services/accountDetailsService.ts',{
    '../lib/supabase':{hasSupabaseConfig:true,supabase:{auth:{
      getUser:async()=>({data:{user:{id:sessionId}},error:null}),
      updateUser:async attributes=>{calls.push(['auth',attributes]);return {data:{user:{id:returnedId}},error:authError}},
    }}},
    './profileService':{profileService:{
      getProfile:async id=>{calls.push(['getProfile',id]);if(profileError)throw profileError;return profile},
      updateProfile:async(id,updates)=>{calls.push(['updateProfile',id,updates]);return {id,...updates}},
    }},
  });
  return {service:accountDetailsService,validateAccountNames,calls};
}

test('name updates preserve multi-word/Unicode names and send only name metadata, never email, password or role',async()=>{
  const f=fixture();
  const result=await f.service.updateNames('alice',' Ana ',' Dela Cruz ');
  assert.equal(result.display_name,'Ana Dela Cruz');
  assert.equal(JSON.stringify(f.calls[0]),JSON.stringify(['auth',{data:{first_name:'Ana',last_name:'Dela Cruz',display_name:'Ana Dela Cruz',full_name:'Ana Dela Cruz'}}]));
  assert.equal(f.calls.some(call=>call[0]==='updateProfile'),false,'existing Auth trigger already synchronized the profile');
  assert.equal(f.validateAccountNames('José María',"O’Connor").display_name,'José María O’Connor');
});

test('a stale profile is repaired only in its three name fields, preserving identity and existing photo',async()=>{
  const f=fixture({profile:{id:'alice',first_name:'Old',last_name:'Name',photo_url:'existing.jpg',email:'same@example.test',role:'user'}});
  await f.service.updateNames('alice','Ana','Dela Cruz');
  const write=f.calls.find(call=>call[0]==='updateProfile');
  assert.equal(write[1],'alice');
  assert.equal(JSON.stringify(write[2]),JSON.stringify({first_name:'Ana',last_name:'Dela Cruz',display_name:'Ana Dela Cruz'}));
});

test('invalid or blank names and a changed session cannot write account data',async()=>{
  const f=fixture();
  for(const names of [['','Cruz'],['Ana','  '],['a'.repeat(101),'Cruz']])await assert.rejects(f.service.updateNames('alice',...names));
  assert.equal(f.calls.length,0);
  const other=fixture({sessionId:'bob'});
  await assert.rejects(other.service.updateNames('alice','Ana','Cruz'),/sign in again/);
  assert.equal(other.calls.length,0);
});

test('failed Auth requests never apply a profile-only name change',async()=>{
  const f=fixture({authError:new Error('Network request failed')});
  await assert.rejects(f.service.updateNames('alice','Ana','Cruz'),/connect/);
  assert.equal(f.calls.length,1);
});

test('a profile-read failure reports the already-saved account name and permits an idempotent retry',async()=>{
  const f=fixture({profileError:new Error('Synthetic database outage')});
  await assert.rejects(f.service.updateNames('alice','Ana','Cruz'),/account name was saved.*retry/i);
  assert.equal(f.calls.filter(call=>call[0]==='auth').length,1);
  assert.equal(f.calls.some(call=>call[0]==='updateProfile'),false);
});

test('a changed Auth response never repairs a different account profile',async()=>{
  const f=fixture({returnedId:'bob'});
  await assert.rejects(f.service.updateNames('alice','Ana','Cruz'),/session changed/);
  assert.equal(f.calls.length,1);
});
