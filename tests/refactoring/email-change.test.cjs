const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('../remediation/load-client.cjs');

function fixture(options={}) {
  const calls=[];
  let user={id:'alice',email:'alice@example.test',email_confirmed_at:'2026-10-01',...options.user};
  let profile={id:'alice',role:'user',email:'alice@example.test',...options.profile};
  const {emailChangeService:service}=load('src/services/emailChangeService.ts',{
    '../lib/supabase':{hasSupabaseConfig:true,supabase:{auth:{
      getUser:async()=>({data:{user},error:options.readError??null}),
      updateUser:async(attributes,config)=>{
        calls.push({attributes,config});
        if(options.updateError)return {data:{user:null},error:options.updateError};
        user={...user,new_email:attributes.email,email_change_sent_at:new Date().toISOString()};
        if(options.lostResponse)throw Error('Network request failed');
        return {data:{user:{...user,id:options.responseId??user.id}},error:null};
      },
      refreshSession:async()=>{calls.push('refresh');return {data:{user},error:options.refreshError??null}},
    }}},
    './profileService':{profileService:{getProfile:async()=>{if(options.profileError)throw Error('private DB detail');return profile}}},
  });
  return {service,calls,setUser:updates=>user={...user,...updates},setProfile:updates=>profile={...profile,...updates}};
}

test('requests only the normalized Auth email and dedicated redirect, retaining current email while pending',async()=>{
  const f=fixture(),state=await f.service.requestChange('alice',' New@Example.test ');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{attributes:{email:'new@example.test'},config:{emailRedirectTo:'cebspot://auth/email-change'}}]);
  assert.equal(state.userId,'alice');assert.equal(state.currentEmail,'alice@example.test');
  assert.equal(state.pendingEmail,'new@example.test');assert.equal(state.profileSynced,true);
  // One inbox confirmation still leaves Auth's pending address unchanged.
  assert.equal((await f.service.getState('alice')).pendingEmail,'new@example.test');
  f.setUser({email:'new@example.test',new_email:''});
  assert.equal((await f.service.getState('alice')).profileSynced,false,'Auth confirmation alone does not claim profile synchronization');
  f.setProfile({email:'new@example.test'});
  const complete=await f.service.refreshIdentity('alice');
  assert.equal(complete.currentEmail,'new@example.test');assert.equal(complete.pendingEmail,null);assert.equal(complete.profileSynced,true);
  assert.equal(f.calls.at(-1),'refresh');
});

test('invalid, unchanged and reserved addresses never send a change',async()=>{
  const f=fixture();
  for(const email of ['bad',' Alice@example.test ','testadmin6000@gmail.com','testowner@cebspot.com','a'.repeat(250)+'@a.test'])
    await assert.rejects(f.service.requestChange('alice',email));
  assert.equal(f.calls.length,0);
});

test('managed accounts, unconfirmed identities, mismatched sessions and stale profiles cannot request changes',async()=>{
  for(const options of [
    {profile:{role:'owner'}},{profile:{role:'admin'}},{user:{email:'testadmin6000@gmail.com'}},
    {user:{email_confirmed_at:null}},{user:{id:'bob'}},{profile:{id:'bob'}},{profile:{email:'stale@example.test'}},
  ]) {
    const f=fixture(options);await assert.rejects(f.service.requestChange('alice','new@example.test'));
    assert.equal(f.calls.length,0);
  }
  const changed=fixture({responseId:'bob'});await assert.rejects(changed.service.requestChange('alice','new@example.test'),/session changed/);
});

test('duplicate, throttled and unknown failures give safe errors without exposing server details',async()=>{
  for(const [updateError,expected] of [
    [{code:'email_exists',message:'private duplicate detail'},/cannot be used/],
    [{code:'email_address_not_authorized'},/Email delivery is not available/],
    [{code:'over_email_send_rate_limit'},/Please wait/],
    [{code:'session_not_found'},/sign in again/],
    [{code:'unexpected_failure',message:'private DB detail'},/could not be confirmed/],
  ]) {
    const f=fixture({updateError});await assert.rejects(f.service.requestChange('alice','new@example.test'),expected);
  }
  await assert.rejects(fixture({profileError:true}).service.getState('alice'),error=>!error.message.includes('private DB'));
});

test('a lost response does not imply a failed request; status recovers the server pending address',async()=>{
  const f=fixture({lostResponse:true});
  await assert.rejects(f.service.requestChange('alice','new@example.test'),/Check status/);
  const next=await f.service.getState('alice');
  assert.equal(next.currentEmail,'alice@example.test');assert.equal(next.pendingEmail,'new@example.test');assert.equal(f.calls.length,1);
});

test('an Auth status network error is recoverable without incorrectly requiring another sign-in',async()=>{
  const f=fixture({readError:{code:'unexpected_failure',message:'Network request failed'}});
  await assert.rejects(f.service.getState('alice'),error=>/connection.*Check status/.test(error.message)&&!/sign in/.test(error.message));
  await assert.rejects(f.service.requestChange('alice','new@example.test'),/Check status/);
  assert.equal(f.calls.length,0,'unknown status must prevent another email request');
  const refreshing=fixture({refreshError:{message:'Network request failed'}});
  await assert.rejects(refreshing.service.refreshIdentity('alice'),/Check status/);
});

test('email return links match the dedicated app origin and route only',()=>{
  const {isEmailChangeCallback}=load('src/utils/emailChange.ts');
  for(const url of ['cebspot://auth/email-change','cebspot://auth/email-change/#access_token=untrusted','cebspot://auth/email-change?error=expired'])assert.equal(isEmailChangeCallback(url),true);
  for(const url of ['https://auth/email-change','cebspot://evil/email-change','cebspot://auth/callback?next=email-change','cebspot://auth/email-change-other','malformed'])assert.equal(isEmailChangeCallback(url),false);
});

test('profile initialization cannot overwrite confirmed server email from a stale session',async()=>{
  const row={id:'alice',email:'confirmed@example.test',role:'user',display_name:'Alice',photo_url:'alice.jpg'};
  let writes=0;
  const {profileService}=load('src/services/profileService.ts',{'../lib/supabase':{supabase:{from:()=>({
    select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error:null})})}),
    update:()=>{writes++;throw Error('No identity repair should be attempted')},
  })}}});
  assert.equal(await profileService.ensureProfile({id:'alice',email:'old@example.test',display_name:'Alice',photo_url:'alice.jpg'}),row);
  assert.equal(writes,0);
});
