// Actual Checkout screen, availability services, slot check and PayMongo client.
// All database/provider/link-opening operations are fixtures: no charge is made.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const {buildFixtureBundle}=require('./location-edit.cjs');
const root=path.resolve(__dirname,'../..'),artifacts=path.join(root,'.codex-tmp/qrph-checkout-review');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Checkout from './app/checkout/[id]';
const f=window.__checkout={dark:false,route:null,alerts:[],rpcCalls:[],reads:[],reservations:[],providerCalls:[],opened:[],mode:'legacy',reserved:[],slotAvailable:true,providerFailure:false,
 params:{id:'66666666-6666-4666-8666-666666666666',spotName:'Fixture Cafe',date:'2030-01-01',time:'23:10',guests:'2',tableId:'C01',slotId:'prime',groupSizeType:'small',adjustmentAcknowledged:'true',fee:'150'},
 spot:{id:'66666666-6666-4666-8666-666666666666',name:'Fixture Cafe',is_public:true,is_reservable:true,reservation_type:'paid',reservation_fee:150,gcash_amount:150,payment_required:true,table_inventory:{prime:[{tableId:'C01',capacity:4,isReserved:false}]}}};
f.latestSpot=structuredClone(f.spot);window.__picker=f;f.router={push:r=>f.route=r,replace:r=>f.route=r,back:()=>{},canGoBack:()=>true};
createRoot(document.getElementById('root')).render(<Checkout/>);`;

function adapter(name){
 if(name==='react-native')return `export * from ${JSON.stringify(require.resolve('react-native-web'))};export const Alert={alert:(...args)=>window.__checkout.alerts.push(args)},Linking={openURL:async url=>window.__checkout.opened.push(url)};`;
 if(name==='expo-router')return `export const useRouter=()=>window.__checkout.router,useLocalSearchParams=()=>window.__checkout.params;`;
 if(name==='expo-linking')return `export const createURL=(path,options)=>'cebspot://'+path.replace(/^\\//,'')+'?'+new URLSearchParams(options?.queryParams);`;
 if(name==='expo-image-picker')return `export const launchImageLibraryAsync=async()=>({canceled:true});`;
 if(name.endsWith('/hooks/useAuth'))return `export const useAuth=()=>({profile:{id:'alice',email:'alice@fixture.test',first_name:'Alice',last_name:'Cruz',display_name:'Alice Cruz'}});`;
 if(name.endsWith('/components/ScreenContainer'))return `import React from 'react';import {ScrollView} from 'react-native';export const ScreenContainer=({children,appColors})=><ScrollView style={{flex:1,backgroundColor:appColors.surface}} contentContainerStyle={{padding:16}}>{children}</ScrollView>;`;
 if(name.endsWith('/services/spotService'))return `export const spotService={getSpotById:async()=>window.__checkout.spot,subscribeToSpotById:()=>()=>{}};`;
 if(name.endsWith('/services/reservationService'))return `export const reservationService={createReservation:async attrs=>{window.__checkout.reservations.push(attrs);return {...attrs,id:'fixture-reservation',created_at:new Date().toISOString()}}};`;
 if(name.endsWith('/services/paymentProofService'))return `export const paymentProofService={uploadProof:async()=>{throw Error('Unexpected manual upload')}};`;
 if(name.endsWith('/lib/supabase'))return `export const hasSupabaseConfig=true,supabase={
  from:table=>({select:fields=>({eq:(key,value)=>({maybeSingle:async()=>{const f=window.__checkout;f.reads.push({table,key,value});if(f.mode==='network')return {data:null,error:Error('Network request failed')};return {data:f.latestSpot,error:null}}})})}),
  rpc:async(name,args)=>{const f=window.__checkout;f.rpcCalls.push({name,args});
   if(name==='get_venue_table_availability'){if(f.mode==='modern')return {data:[{table_id:'C01',capacity:4,booking_policy:'online_and_walk_ins',operational_state:'free',online_available:true,policy_locked:true}],error:null};return {data:null,error:{code:'PGRST202',message:'Could not find the function public.get_venue_table_availability(target_reservation_date, target_slot_id, target_spot_id) in the schema cache'}}}
   if(name==='get_reserved_table_ids')return {data:f.reserved,error:null};
   if(name==='check_reservation_slot_available')return {data:f.slotAvailable,error:null};
   throw Error('Unexpected RPC '+name);
  },
  functions:{invoke:async(name,input)=>{const f=window.__checkout;f.providerCalls.push({name,input});if(f.providerFailure)return {data:null,error:{context:{json:async()=>({error:'private database or provider error details'})}}};return {data:{checkoutUrl:'https://payments.fixture.test/checkout',checkoutSessionId:'fixture-session',amount:150,currency:'PHP'},error:null}}}
 };`;
 throw Error('Unexpected fixture '+name);
}

async function main(){
 fs.mkdirSync(artifacts,{recursive:true});
 const bundle=await buildFixtureBundle(entry,{filter:/^(react-native|expo-router|expo-linking|expo-image-picker)$|\/(hooks\/useAuth|components\/ScreenContainer|lib\/supabase|services\/(spotService|reservationService|paymentProofService))$/,adapter});
 const html='<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="/bundle.js"></script></html>';
 const browser=await chromium.launch({channel:process.env.MAP_TEST_CHANNEL||'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='checkout.test')return r.fulfill({contentType:u.pathname==='/bundle.js'?'application/javascript':'text/html',body:u.pathname==='/bundle.js'?bundle:html});return r.abort()});
  async function prepare(){
   await page.goto('https://checkout.test');await page.getByPlaceholder('09XXXXXXXXX',{exact:true}).fill('09171234567');
   await page.getByRole('checkbox',{name:'Accept reservation terms and conditions',exact:true}).click();
   await page.getByRole('button',{name:'QR Ph payment',exact:true}).click();
  }
  async function pay(){await page.getByRole('button',{name:'Continue to QR Ph',exact:true}).click();await page.getByRole('button',{name:'Continue to payment',exact:true}).click()}
  await prepare();await pay();
  await expect.poll(()=>page.evaluate(()=>window.__checkout.opened.length)).toBe(1);
  const success=await page.evaluate(()=>({reservations:window.__checkout.reservations,providers:window.__checkout.providerCalls,alerts:window.__checkout.alerts,rpcs:window.__checkout.rpcCalls,reads:window.__checkout.reads,route:window.__checkout.route}));
  assert.equal(success.reservations.length,1);assert.equal(success.providers.length,1);assert.equal(success.providers[0].name,'paymongo-create-qrph-checkout');
  assert.equal(success.reservations[0].payment_method,'paymongo_qrph');assert.equal(success.reservations[0].table_id,'C01');assert.equal(success.reads.length,1);
  assert.deepEqual(success.rpcs.map(x=>x.name),['get_venue_table_availability','get_reserved_table_ids','check_reservation_slot_available']);assert.deepEqual(success.alerts,[]);
  assert.equal(success.route.pathname,'/confirmed/[id]');
  await prepare();await page.evaluate(()=>window.__checkout.reserved=['C01']);await pay();
  await expect.poll(()=>page.evaluate(()=>window.__checkout.alerts.length)).toBe(1);
  assert.equal(await page.evaluate(()=>window.__checkout.providerCalls.length+window.__checkout.reservations.length),0);
  await prepare();await page.evaluate(()=>window.__checkout.latestSpot.table_inventory.prime[0].bookingPolicy='walk_in_only');await pay();
  await expect.poll(()=>page.evaluate(()=>window.__checkout.alerts.length)).toBe(1);
  assert.equal(await page.evaluate(()=>window.__checkout.providerCalls.length+window.__checkout.reservations.length),0,'latest stored table policy blocks payment');
  await prepare();await page.evaluate(()=>window.__checkout.slotAvailable=false);await pay();
  await expect.poll(()=>page.evaluate(()=>window.__checkout.alerts.length)).toBe(1);
  assert.equal(await page.evaluate(()=>window.__checkout.providerCalls.length+window.__checkout.reservations.length),0,'slot lost after availability read never reaches payment');
  await prepare();await page.evaluate(()=>window.__checkout.mode='network');await pay();
  await expect.poll(()=>page.evaluate(()=>window.__checkout.alerts.length)).toBe(1);
  assert.match(await page.evaluate(()=>window.__checkout.alerts[0][1]),/connect/);
  assert.equal(await page.evaluate(()=>window.__checkout.providerCalls.length+window.__checkout.reservations.length),0);
  await prepare();await page.evaluate(()=>window.__checkout.providerFailure=true);await pay();
  await expect.poll(()=>page.evaluate(()=>window.__checkout.alerts.length)).toBe(1);
  assert.equal(await page.evaluate(()=>window.__checkout.alerts[0][1]),'Checkout is temporarily unavailable. Please try again.');
  await pay();await expect.poll(()=>page.evaluate(()=>window.__checkout.providerCalls.length)).toBe(2);
  assert.equal(await page.evaluate(()=>window.__checkout.reservations.length),1,'retry uses the same reservation');
  await prepare();await page.evaluate(()=>window.__checkout.mode='modern');await pay();
  await expect.poll(()=>page.evaluate(()=>window.__checkout.opened.length)).toBe(1);
  assert.equal(await page.evaluate(()=>window.__checkout.rpcCalls.some(x=>x.name==='get_reserved_table_ids')),false);
  await page.getByRole('button',{name:'Continue to QR Ph',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'qrph-checkout.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS: actual QR Ph checkout on legacy/current schemas, fresh inventory and policy checks, booked-table and race rejection, network errors, friendly provider failures, retry without duplicate reservations, and payment routing. All provider calls are fixtures.');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
