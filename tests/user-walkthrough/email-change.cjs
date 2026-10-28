// Actual AuthProvider, Account Details, return screen, card and email service.
// Network, Auth mail delivery and database are fixtures; no hosted mutations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const {buildFixtureBundle}=require('./location-edit.cjs');
const root=path.resolve(__dirname,'../..'),artifacts=path.join(root,'.codex-tmp/email-change-review');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {AuthProvider,useAuth} from './src/hooks/useAuth';import Account from './app/account-details';import Return from './app/auth/email-change';
const f=window.__email={route:'/account-details',params:{},version:0,dark:false,writes:[],setSessionCalls:0,exchangeCalls:0,refreshCalls:0,links:[],appStateListeners:[],authListeners:[],error:null,lostResponse:false,delay:false,readsFail:false,
 server:{id:'alice',email:'alice@example.test',email_confirmed_at:'2026-10-01',user_metadata:{first_name:'Alice',last_name:'Cruz'}},profile:{id:'alice',role:'user',email:'alice@example.test',first_name:'Alice',last_name:'Cruz',display_name:'Alice Cruz',photo_url:null}};
window.__picker=f;f.session={user:{...f.server},access_token:'fixture',refresh_token:'fixture'};
f.emit=()=>{f.version++;window.dispatchEvent(new Event('email'))};f.go=r=>{f.route=typeof r==='string'?r:r.pathname;f.params=typeof r==='string'?{}:r.params;f.emit()};
f.router={push:f.go,replace:f.go,canGoBack:()=>false,back:()=>f.go('/profile')};
f.notify=event=>f.authListeners.forEach(fn=>fn(event,f.session));f.confirm=()=>{f.server={...f.server,email:f.server.new_email,new_email:''};f.profile={...f.profile,email:f.server.email}};
f.link=url=>{f.links.forEach(fn=>fn({url}));f.go('/auth/email-change')};
function App(){React.useSyncExternalStore(fn=>{window.addEventListener('email',fn);return()=>window.removeEventListener('email',fn)},()=>f.version);
const auth=useAuth();return <><span data-testid="signed-in-id">{auth.user?.id||'signed-out'}</span>{f.route==='/account-details'?<Account/>:f.route==='/auth/email-change'?<Return/>:<div>{f.route}<span data-testid="route-email">{f.params.email}</span></div>}</>}
createRoot(document.getElementById('root')).render(<AuthProvider><App/></AuthProvider>);`;

function adapter(name){
  if(name==='react-native')return `export * from ${JSON.stringify(require.resolve('react-native-web'))};export const Alert={alert:()=>{}},AppState={currentState:'active',addEventListener:(type,fn)=>{window.__email.appStateListeners.push(fn);return {remove:()=>{window.__email.appStateListeners=window.__email.appStateListeners.filter(item=>item!==fn)}}}};`;
  if(name==='expo-router')return `import React from 'react';export const useRouter=()=>window.__email.router,useLocalSearchParams=()=>window.__email.params,useFocusEffect=fn=>React.useEffect(fn,[fn]);`;
  if(name==='expo-image-picker')return `export const requestMediaLibraryPermissionsAsync=async()=>({granted:false}),launchImageLibraryAsync=async()=>({canceled:true});`;
  if(name==='@react-native-async-storage/async-storage')return `export default {getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}};`;
  if(name==='expo-web-browser')return `export const maybeCompleteAuthSession=()=>{},openAuthSessionAsync=async()=>{throw Error('Unexpected browser sign in')};`;
  if(name==='expo-linking')return `export const parse=url=>({queryParams:Object.fromEntries(new URL(url).searchParams)}),createURL=path=>'cebspot://'+path,getInitialURL=async()=>null,addEventListener=(type,fn)=>{window.__email.links.push(fn);return {remove:()=>{window.__email.links=window.__email.links.filter(item=>item!==fn)}}};`;
  if(name.endsWith('/components/ScreenContainer'))return `import React from 'react';import {ScrollView} from 'react-native';export const ScreenContainer=({children,appColors})=><ScrollView style={{flex:1,backgroundColor:appColors.surface}} contentContainerStyle={{padding:16}}>{children}</ScrollView>;`;
  if(name.endsWith('/lib/supabase'))return `export const hasSupabaseConfig=true,supabaseAuthStorageKeys={app:'fixture'},clearSupabaseAuthStorage=async()=>{},supabase={auth:{
    getSession:async()=>({data:{session:window.__email.session},error:null}),
    getUser:async()=>{const f=window.__email;if(f.readsFail)return {data:{user:null},error:{message:'Network request failed'}};return {data:{user:f.server},error:null}},
    onAuthStateChange:fn=>{window.__email.authListeners.push(fn);return {data:{subscription:{unsubscribe:()=>{window.__email.authListeners=window.__email.authListeners.filter(item=>item!==fn)}}}}},
    updateUser:async(attributes,config)=>{const f=window.__email,actor=f.server;f.writes.push({attributes,config});if(f.delay)await new Promise(resolve=>f.release=resolve);if(f.error)return {data:{user:null},error:f.error};const updated={...actor,new_email:attributes.email,email_change_sent_at:new Date().toISOString()};if(f.server.id===actor.id){f.server=updated;f.session={...f.session,user:{...f.server}};f.notify('USER_UPDATED')};if(f.lostResponse)throw Error('Network request failed');return {data:{user:updated},error:null}},
    refreshSession:async()=>{const f=window.__email;f.refreshCalls++;f.session={...f.session,user:{...f.server}};f.notify('TOKEN_REFRESHED');return {data:{session:f.session,user:f.server},error:null}},
    setSession:async()=>{window.__email.setSessionCalls++;throw Error('Must never import email link tokens')},
    exchangeCodeForSession:async()=>{window.__email.exchangeCalls++;throw Error('Must never import email link code')},
    signOut:async()=>{},startAutoRefresh:async()=>{},stopAutoRefresh:async()=>{}
  }};`;
  if(name.endsWith('/profileService'))return `export const profileService={getProfile:async()=>window.__email.profile,ensureProfile:async()=>window.__email.profile};`;
  if(name.endsWith('/services/profilePhotoService'))return `export const profilePhotoService={};`;
  throw Error('Unexpected adapter '+name);
}

async function main(){
  fs.mkdirSync(artifacts,{recursive:true});
  const bundle=await buildFixtureBundle(entry,{filter:/^(react-native|expo-router|expo-image-picker|expo-linking|expo-web-browser|@react-native-async-storage\/async-storage|\.\/profileService)$|\/(components\/ScreenContainer|lib\/supabase|services\/(profileService|profilePhotoService))$/,adapter});
  const html='<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style><div id="root"></div><script src="/bundle.js"></script></html>';
  const browser=await chromium.launch({channel:process.env.MAP_TEST_CHANNEL||'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='email.test')return route.fulfill({contentType:url.pathname==='/bundle.js'?'application/javascript':'text/html',body:url.pathname==='/bundle.js'?bundle:html});return route.abort()});
    await page.clock.install({time:new Date('2026-10-28T01:00:00Z')});
    await page.goto('https://email.test');
    const change=page.getByRole('button',{name:'Change email',exact:true}),check=page.getByRole('button',{name:'Check email change status',exact:true}),send=page.getByRole('button',{name:'Send confirmation emails',exact:true}),input=page.getByRole('textbox',{name:'New email address',exact:true});
    await expect(change).toBeEnabled();await change.click();
    await input.fill('bad');await expect(send).toBeDisabled();
    await input.fill('alice@example.test');await expect(send).toBeDisabled();
    await input.fill('testadmin6000@gmail.com');await expect(send).toBeDisabled();
    assert.equal(await page.evaluate(()=>window.__email.writes.length),0);
    await input.fill(' New@Example.test ');
    await page.evaluate(()=>{window.__email.delay=true});await send.click();
    await expect(send).toBeDisabled();await expect(page.getByRole('textbox',{name:'First name',exact:true})).not.toBeEditable();
    assert.equal(await page.evaluate(()=>window.__email.writes.length),1);
    await page.evaluate(()=>{window.__email.delay=false;window.__email.release()});
    await expect(page.getByTestId('account-pending-email')).toHaveText('new@example.test');
    await expect(page.getByTestId('account-current-email')).toHaveText('alice@example.test');
    await expect(page.getByRole('button',{name:/Send again in/})).toBeDisabled();
    await expect(page.getByText('Your new email is confirmed.',{exact:false})).toHaveCount(0);
    await page.clock.fastForward(61_000);
    const resend=page.getByRole('button',{name:'Resend confirmation emails',exact:true});
    await expect(resend).toBeEnabled();await resend.click();
    await expect(page.getByRole('button',{name:/Send again in/})).toBeDisabled();
    assert.equal(await page.evaluate(()=>window.__email.writes.length),2);
    assert.equal(await page.evaluate(()=>window.__email.writes.at(-1).attributes.email),'new@example.test');
    await expect(page.getByTestId('account-current-email')).toHaveText('alice@example.test');
    // Simulate first secure-email link returning with tokens for another account.
    await page.evaluate(()=>window.__email.link('cebspot://auth/email-change#access_token=other-account&refresh_token=other-account&type=email_change'));
    await expect(page.getByRole('heading',{name:'Check email change',exact:true})).toBeVisible();
    await expect(page.getByTestId('account-pending-email')).toHaveText('new@example.test');
    await expect(page.getByTestId('signed-in-id')).toHaveText('alice');
    assert.equal(await page.evaluate(()=>window.__email.setSessionCalls+window.__email.exchangeCalls),0);
    await page.getByTestId('account-pending-email').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'email-pending-light.png')});
    await page.evaluate(()=>{window.__email.dark=true;window.dispatchEvent(new Event('theme'))});
    await page.screenshot({path:path.join(artifacts,'email-pending-dark.png')});
    await page.setViewportSize({width:320,height:640});await page.screenshot({path:path.join(artifacts,'email-pending-small.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    // Final confirmation on another device: check server, then refresh existing session/profile.
    await page.evaluate(()=>{const f=window.__email;f.confirm();f.readsFail=true});await check.click();
    await expect(page.getByRole('alert')).toContainText('Check status');
    await expect(page.getByRole('alert')).not.toContainText('sign in');
    await expect(page.getByTestId('account-current-email')).toHaveText('alice@example.test');
    await expect(change).toBeDisabled();
    // Regaining foreground after the connection returns refreshes the confirmed identity automatically.
    await page.evaluate(()=>{const f=window.__email;f.readsFail=false;f.appStateListeners.forEach(fn=>fn('active'))});
    await expect(page.getByTestId('account-current-email')).toHaveText('new@example.test');
    await expect(page.getByTestId('account-pending-email')).toHaveCount(0);
    await expect(page.getByText('This is the email currently confirmed for your signed-in account.',{exact:true})).toBeVisible();
    assert.equal(await page.evaluate(()=>window.__email.refreshCalls),1);
    await page.getByRole('button',{name:'Back to account',exact:true}).click();await change.click();
    await input.fill('taken@example.test');await page.evaluate(()=>{window.__email.error={code:'email_exists',message:'Secret server detail'}});await send.click();
    await expect(page.getByRole('alert')).toContainText('cannot be used');await expect(send).toBeDisabled();
    await page.evaluate(()=>{window.__email.error=null});await check.click();await expect(send).toBeEnabled();
    await page.evaluate(()=>{window.__email.error={code:'over_email_send_rate_limit'}});await send.click();
    await expect(page.getByRole('alert')).toContainText('Please wait');
    await page.evaluate(()=>{window.__email.error=null;window.__email.lostResponse=true});await check.click();await send.click();
    await expect(page.getByRole('alert')).toContainText('Check status');await expect(send).toBeDisabled();
    await page.evaluate(()=>{window.__email.lostResponse=false});await check.click();
    await expect(page.getByTestId('account-pending-email')).toHaveText('taken@example.test');
    await page.evaluate(()=>window.__email.go('/profile'));await page.evaluate(()=>window.__email.go('/account-details'));
    await expect(page.getByTestId('account-pending-email')).toHaveText('taken@example.test');
    await page.getByRole('button',{name:'Change password',exact:true}).click();
    await expect(page.getByTestId('route-email')).toHaveText('new@example.test');
    // An expired link is neutral and does not complete a pending change or import its code.
    await page.evaluate(()=>{window.__email.link('cebspot://auth/email-change?code=untrusted');window.__email.params={error:'expired'};window.__email.emit()});
    await expect(page.getByRole('alert')).toContainText('could not be used');
    await expect(page.getByTestId('account-pending-email')).toHaveText('taken@example.test');
    assert.equal(await page.evaluate(()=>window.__email.setSessionCalls+window.__email.exchangeCalls),0);
    // A known pending request can be explicitly reported complete only after the server changes.
    await page.evaluate(()=>{window.__email.confirm();window.__email.params={};window.__email.emit()});await check.click();
    await expect(page.getByTestId('account-current-email')).toHaveText('taken@example.test');
    await expect(page.getByText('Your new email is confirmed. Use it the next time you sign in.',{exact:true})).toBeVisible();
    // Switch account while a request is in flight; its eventual response cannot fill the new user's form.
    await page.evaluate(()=>{const f=window.__email;f.server={...f.server,new_email:'',email_change_sent_at:null};f.go('/profile')});
    await page.evaluate(()=>window.__email.go('/account-details'));await expect(change).toBeEnabled();await change.click();await input.fill('late@example.test');
    await page.evaluate(()=>{window.__email.delay=true});await send.click();
    await page.evaluate(()=>{const f=window.__email;f.server={id:'bob',email:'bob@example.test',email_confirmed_at:'2026-10-01',user_metadata:{}};f.profile={id:'bob',email:'bob@example.test',role:'owner'};f.session={...f.session,user:f.server};f.notify('SIGNED_IN')});
    await expect(page.getByTestId('signed-in-id')).toHaveText('bob');
    await page.evaluate(()=>{window.__email.release();window.__email.delay=false});
    await expect(change).toHaveCount(0);await expect(page.getByTestId('account-pending-email')).toHaveCount(0);
    // Signed-out return requires sign-in and never silently adopts link credentials.
    await page.evaluate(()=>{const f=window.__email;f.session=null;f.notify('SIGNED_OUT');f.link('cebspot://auth/email-change#access_token=other&refresh_token=other')});
    await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
    await expect(page.getByTestId('signed-in-id')).toHaveText('signed-out');
    assert.equal(await page.evaluate(()=>window.__email.setSessionCalls+window.__email.exchangeCalls),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: actual AuthProvider and email UI, validation, resend cooldown, pending/partial/final confirmation, foreground/network recovery, session/profile refresh, no imported link credentials, lost-response recovery, duplicate/rate-limit errors, account switch, signed-out return and light/dark/small layouts.');
  }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
