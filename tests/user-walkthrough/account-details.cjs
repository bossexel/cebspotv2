// Real Profile, Account Details and password screens. All Auth/storage are fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const {buildFixtureBundle}=require('./location-edit.cjs');
const root=path.resolve(__dirname,'../..'),artifacts=path.join(root,'.codex-tmp/account-details-review');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Profile from './app/profile';import Account from './app/account-details';import Reset from './app/reset-password';
const f=window.__account={route:'/profile',params:{},version:0,dark:false,permission:true,authFailure:false,uploadFailure:false,alerts:[],authWrites:[],profileWrites:[],uploads:0,resetRequests:[],recovery:'idle',passwordChanged:false,
 user:{id:'alice',email:'alice@example.test',email_confirmed_at:'2026-10-01',user_metadata:{first_name:'Alice',last_name:'Cruz'}},profile:{id:'alice',role:'user',email:'alice@example.test',first_name:'Alice',last_name:'Cruz',display_name:'Alice Cruz',photo_url:null}};
window.__picker=f;f.emit=()=>{f.version++;window.dispatchEvent(new Event('account'))};f.go=r=>{f.route=typeof r==='string'?r:r.pathname;f.params=typeof r==='string'?{}:r.params;f.emit()};
f.router={push:f.go,replace:f.go,canGoBack:()=>true,back:()=>f.go('/profile')};
f.refreshProfile=async()=>f.emit();f.logOut=async()=>{f.user=null;f.profile=null;f.emit()};
f.resetPassword=async email=>{f.resetRequests.push(email)};f.verifyCode=async(email,code)=>{if(code!=='123456')throw Error('Invalid verification code');f.recovery='ready';f.emit()};
f.completePasswordRecovery=async password=>{if(f.recovery!=='ready')throw Error('Verification required');f.passwordChanged=true;f.recovery='idle';f.user=null;f.profile=null;f.emit()};
function App(){React.useSyncExternalStore(fn=>{window.addEventListener('account',fn);return()=>window.removeEventListener('account',fn)},()=>f.version);return f.route==='/profile'?<Profile/>:f.route==='/account-details'?<Account/>:f.route==='/reset-password'?<Reset/>:<div>{f.route}</div>}
createRoot(document.getElementById('root')).render(<App/>);`;
function adapter(name){
  if(name==='react-native')return `export * from ${JSON.stringify(require.resolve('react-native-web'))};export const Alert={alert:(...args)=>window.__account.alerts.push(args)};`;
  if(name==='expo-router')return `import React from 'react';export const useRouter=()=>window.__account.router,useLocalSearchParams=()=>window.__account.params,useFocusEffect=fn=>React.useEffect(fn,[fn]);`;
  if(name==='expo-image-picker')return `export const requestMediaLibraryPermissionsAsync=async()=>({granted:window.__account.permission}),launchImageLibraryAsync=async()=>({canceled:false,assets:[{uri:'fixture-photo.jpg',width:400,fileSize:1024}]});`;
  if(name.endsWith('/hooks/useAuth'))return `import React from 'react';export const useAuth=()=>{const f=window.__account;React.useSyncExternalStore(fn=>{window.addEventListener('account',fn);return()=>window.removeEventListener('account',fn)},()=>f.version);return {user:f.user,profile:f.profile,isSignedIn:!!f.user,refreshProfile:f.refreshProfile,logOut:f.logOut,passwordRecoveryStatus:f.recovery,passwordRecoveryError:null,resetPassword:f.resetPassword,verifyPasswordRecoveryCode:f.verifyCode,completePasswordRecovery:f.completePasswordRecovery}};`;
  if(name.endsWith('/components/ScreenContainer'))return `import React from 'react';import {ScrollView} from 'react-native';export const ScreenContainer=({children,appColors,keyboardShouldPersistTaps})=><ScrollView testID="screen-scroll-view" style={{flex:1,backgroundColor:appColors.surface}} keyboardShouldPersistTaps={keyboardShouldPersistTaps} contentContainerStyle={{padding:16}}>{children}</ScrollView>;`;
  if(name.endsWith('/lib/supabase'))return `export const hasSupabaseConfig=true,supabase={auth:{getUser:async()=>({data:{user:window.__account.user},error:null}),updateUser:async attrs=>{const f=window.__account;f.authWrites.push(attrs);if(f.authFailure)return {data:{user:null},error:Error('Network request failed')};f.user={...f.user,user_metadata:{...f.user.user_metadata,...attrs.data}};f.profile={...f.profile,first_name:attrs.data.first_name,last_name:attrs.data.last_name,display_name:attrs.data.display_name};f.emit();return {data:{user:f.user},error:null}}}};`;
  if(name.endsWith('/profileService'))return `export const profileService={getProfile:async()=>{if(window.__account.profileReadFailure)throw Error('Synthetic read outage');return window.__account.profile},updateProfile:async(id,attrs)=>{const f=window.__account;f.profileWrites.push(attrs);f.profile={...f.profile,...attrs};f.emit();return f.profile}};`;
  if(name.endsWith('/services/profilePhotoService'))return `export const profilePhotoService={upload:async()=>{const f=window.__account;f.uploads++;if(f.uploadFailure)throw Error('Network request failed');return 'https://media.test/avatar.png?v='+f.uploads}};`;
  const serviceName=name.split('/').pop(),methods={reservationService:'getUserReservations:async()=>[]',savedSpotService:'getSavedSpotIds:async()=>[]',gamificationService:'getSummary:async()=>null'};
  if(Object.hasOwn(methods,serviceName))return 'export const '+serviceName+'={'+methods[serviceName]+'};';
  throw Error('Unexpected adapter '+name);
}
async function main(){
  fs.mkdirSync(artifacts,{recursive:true});
  const bundle=await buildFixtureBundle(entry,{filter:/^(react-native|expo-router|expo-image-picker|\.\/profileService)$|\/(hooks\/useAuth|components\/ScreenContainer|lib\/supabase|services\/(profileService|profilePhotoService|reservationService|savedSpotService|gamificationService))$/,adapter});
  const html='<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="/bundle.js"></script></html>';
  const browser=await chromium.launch({channel:process.env.MAP_TEST_CHANNEL||'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='account.test')return route.fulfill({contentType:url.pathname==='/bundle.js'?'application/javascript':'text/html',body:url.pathname==='/bundle.js'?bundle:html});return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#FA5F00"/></svg>'});});
    await page.goto('https://account.test');await page.getByRole('button',{name:'Account Details',exact:true}).click();
    const first=page.getByRole('textbox',{name:'First name',exact:true}),last=page.getByRole('textbox',{name:'Last name',exact:true}),save=page.getByRole('button',{name:'Save name',exact:true});
    await expect(first).toHaveValue('Alice');await expect(last).toHaveValue('Cruz');await expect(save).toBeDisabled();
    assert.equal(await page.getByRole('textbox').count(),2,'account email remains read-only');
    await first.fill('');await expect(save).toBeDisabled();
    await first.fill(' Alicia ');await last.fill(' Dela Cruz ');
    await page.evaluate(()=>{window.__account.permission=false});
    await page.getByRole('button',{name:'Change profile picture',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__account.uploads),0);
    await page.evaluate(()=>{window.__account.permission=true;window.__account.uploadFailure=true});
    await page.getByRole('button',{name:'Change profile picture',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('connect');
    await page.evaluate(()=>{window.__account.uploadFailure=false});
    await page.getByRole('button',{name:'Change profile picture',exact:true}).click();
    await expect(page.getByRole('img',{name:'Your profile picture',exact:true})).toBeVisible();
    await expect(first).toHaveValue(' Alicia ');
    await page.evaluate(()=>{window.__account.authFailure=true});await save.click();
    await expect(page.getByRole('alert')).toContainText('connect');await expect(first).toHaveValue(' Alicia ');
    assert.equal(await page.evaluate(()=>window.__account.profile.first_name),'Alice');
    await page.evaluate(()=>{window.__account.authFailure=false;window.__account.profileReadFailure=true});await save.click();
    await expect(page.getByRole('alert')).toContainText('account name was saved');
    await expect(save).toBeEnabled();
    await page.evaluate(()=>{window.__account.profileReadFailure=false});await save.click();
    await expect(page.getByText('Your name was saved.',{exact:true})).toBeVisible();await expect(first).toHaveValue('Alicia');await expect(last).toHaveValue('Dela Cruz');
    await page.getByRole('button',{name:'Back to Profile',exact:true}).click();
    await expect(page.getByText('Alicia Dela Cruz',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Account Details',exact:true}).click();
    await expect(first).toHaveValue('Alicia');await first.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,'account-details-light.png')});
    await page.evaluate(()=>{window.__account.dark=true;window.dispatchEvent(new Event('theme'))});
    await page.screenshot({path:path.join(artifacts,'account-details-dark.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.setViewportSize({width:320,height:640});await page.getByRole('button',{name:'Change password',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,'account-details-small.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const writes=await page.evaluate(()=>window.__account.authWrites);
    assert.ok(writes.every(attrs=>Object.keys(attrs).join(',')==='data'),'name saves never issue an email/password update');
    await page.getByRole('button',{name:'Change password',exact:true}).click();
    await expect(page.getByText('Change password',{exact:true})).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toHaveValue('alice@example.test');
    assert.equal(await page.evaluate(()=>window.__account.passwordChanged),false);
    await page.getByRole('button',{name:'Send verification code',exact:true}).click();
    await expect(page.getByPlaceholder('000000')).toBeVisible();
    await page.getByPlaceholder('000000').fill('123');await expect(page.getByRole('button',{name:'Verify code',exact:true})).toBeDisabled();
    await page.getByPlaceholder('000000').fill('123456');await page.getByRole('button',{name:'Verify code',exact:true}).click();
    await page.getByPlaceholder('Enter new password').fill('weak');await page.getByPlaceholder('Enter it again').fill('weak');
    await expect(page.getByRole('button',{name:'Update password',exact:true})).toBeDisabled();
    await page.getByPlaceholder('Enter new password').fill('FixtureNew123');await page.getByPlaceholder('Enter it again').fill('Mismatch123');
    await expect(page.getByRole('button',{name:'Update password',exact:true})).toBeDisabled();
    await page.getByPlaceholder('Enter it again').fill('FixtureNew123');await page.getByRole('button',{name:'Update password',exact:true}).click();
    await expect(page.getByText('Password changed',{exact:true})).toBeVisible();
    assert.equal(await page.evaluate(()=>window.__account.passwordChanged),true);
    assert.deepEqual(await page.evaluate(()=>window.__account.resetRequests),['alice@example.test']);
    await page.getByRole('button',{name:'Return to login',exact:true}).click();await expect(page.getByText('/login',{exact:true})).toBeVisible();
    assert.deepEqual(errors,[]);
    console.log('PASS: Profile Account Details navigation, names/picture saves and persistence, permission/error recovery, confirmed email display, verified password flow with validation, light/dark and small-screen layouts.');
  }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
