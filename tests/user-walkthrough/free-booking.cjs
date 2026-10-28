// Actual free-booking screen and reservation client -> new synthetic PostgreSQL.
// No hosted backend, device, payment provider or real account is used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const {buildFixtureBundle}=require('./location-edit.cjs');
const {startDatabase}=require('../remediation/database.cjs');
const {seed,ids}=require('../remediation/fixtures.cjs');
const root=path.resolve(__dirname,'../..'),artifacts=path.join(root,'.codex-tmp/free-booking-review-2026-10-28');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Screen from './app/reservation/[id]';
window.__free={dark:false,params:{id:'${ids.venue}'},alerts:[],inserts:[],route:null,spot:null};window.__picker=window.__free;
window.__free.router={replace:r=>window.__free.route=r,push:r=>window.__free.route=r,back(){}};
window.__free.render=()=>createRoot(document.getElementById('root')).render(<Screen/>);`;
function adapter(name){
 if(name==='react-native-svg')return `import React from 'react';const shape=tag=>React.forwardRef(({children,...props},ref)=>React.createElement(tag,{...props,ref},children));export const Svg=shape('svg'),Path=shape('path'),Circle=shape('circle'),Line=shape('line'),Polyline=shape('polyline'),Polygon=shape('polygon'),Rect=shape('rect'),G=shape('g'),Ellipse=shape('ellipse'),Defs=shape('defs'),ClipPath=shape('clipPath'),Text=shape('text');export default Svg;`;
 if(name==='react-native')return `export * from ${JSON.stringify(require.resolve('react-native-web'))};export const Alert={alert:(...a)=>window.__free.alerts.push(a)};`;
 if(name==='expo-router')return `export const useRouter=()=>window.__free.router,useLocalSearchParams=()=>window.__free.params;`;
 if(name.endsWith('/hooks/useAuth'))return `export const useAuth=()=>({profile:{id:'${ids.a}',email:'a@fixture.example.test',first_name:'Synthetic',last_name:'Guest',display_name:'Synthetic Guest'}});`;
 if(name.endsWith('/components/ScreenContainer'))return `import React from 'react';import {ScrollView} from 'react-native';export const ScreenContainer=({children,scrollRef})=><ScrollView ref={scrollRef} style={{flex:1}} contentContainerStyle={{padding:16}}>{children}</ScrollView>;`;
 if(name.endsWith('/services/spotService'))return `export const spotService={getSpotById:async()=>window.__free.spot,subscribeToSpotById:()=>()=>{}};`;
 if(name.endsWith('/services/activityService')||name==='./activityService')return `export const activityService={logActivity:async()=>{}};`;
 if(name.endsWith('/lib/supabase'))return `
 export const hasSupabaseConfig=true;
 async function insert(attrs){
  window.__free.inserts.push(attrs);
  try{return {data:await window.__bookingInsert(attrs),error:null};}
  catch(e){return {data:null,error:{message:e.message}};}
 }
 export const supabase={
  rpc:async(name,args)=>window.__bookingRpc(name,args),
  channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},
  from:()=>({insert:attrs=>({select:()=>({single:()=>insert(attrs)})})})
 };`;
 throw Error('Unexpected free-booking adapter '+name);
}
async function main(){fs.mkdirSync(artifacts,{recursive:true});const db=await startDatabase();let browser;
 try{
  await seed(db,{fee:0});const spot=(await db.query('select * from spots where id=$1',[ids.venue])).rows[0];await db.as(ids.a);
  const bundle=await buildFixtureBundle(entry,{filter:/^(react-native|react-native-svg|expo-router)$|^\.\/activityService$|\/(hooks\/useAuth|components\/ScreenContainer|lib\/supabase|services\/(spotService|activityService))$/,adapter});
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Manila'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.context().routeWebSocket('**/*',s=>s.close());
  await page.route('**/*',r=>r.request().url()==='https://free-booking.test/'?r.fulfill({contentType:'text/html',body:'<style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div>'}):r.abort());
  await page.exposeFunction('__bookingRpc',async(name,args)=>{
   try{let data;if(name==='get_venue_table_availability')data=(await db.query('select * from get_venue_table_availability($1,$2,$3)',[args.target_spot_id,args.target_reservation_date,args.target_slot_id])).rows;
   else if(name==='check_reservation_slot_available')data=(await db.query('select check_reservation_slot_available($1,$2,$3,$4,$5) result',[args.target_spot_id,args.target_reservation_date,args.target_slot_id,args.target_table_id,args.excluded_reservation_id])).rows[0].result;
   else throw Error('Unexpected RPC '+name);return {data,error:null};}catch(e){return {data:null,error:{message:e.message}}}
  });
  await page.exposeFunction('__bookingInsert',async attrs=>{const keys=Object.keys(attrs);assert.ok(keys.every(k=>/^[a-z_]+$/.test(k)));return (await db.query('insert into reservations('+keys.join(',')+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+') returning *',Object.values(attrs))).rows[0]});
  await page.goto('https://free-booking.test/');await page.clock.install({time:new Date(Date.now()+86400000)});await page.addScriptTag({content:bundle});await page.evaluate(s=>{window.__free.spot=s;window.__free.render()},JSON.parse(JSON.stringify(spot)));
  const table=page.getByRole('button',{name:'Cocktail Table 1, 4 seats, Available online',exact:true});await table.click();await page.getByRole('checkbox').click();
  const confirm=page.getByRole('button',{name:'Confirm Booking',exact:true});assert.equal(await confirm.isDisabled(),true);
  await page.getByRole('textbox',{name:'Reservation phone number'}).fill('09171234567<script>');assert.equal(await confirm.isDisabled(),true);
  await page.getByRole('textbox',{name:'Reservation phone number'}).fill('+63 (917) 123-4567');await expect(confirm).toBeEnabled();await confirm.click();
  await expect.poll(()=>page.evaluate(()=>window.__free.route?.pathname)).toBe('/confirmed/[id]');
  const rows=(await db.query('select guest_name,guest_email,guest_phone,slot_id,reservation_time,status,payment_status,payment_required from reservations')).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].guest_name,'Synthetic Guest');assert.equal(rows[0].guest_email,'a@fixture.example.test');assert.equal(rows[0].guest_phone,'+639171234567');assert.equal(rows[0].payment_required,false);assert.equal(rows[0].payment_status,'not_required');
  assert.equal(await page.evaluate(()=>window.__free.inserts.length),1);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(artifacts,'free-booking-confirmed.png')});fs.writeFileSync(path.join(artifacts,'result.json'),JSON.stringify({kind:'actual-screen-and-client-to-isolated-native-postgresql',result:'PASS',invalidContactDisabled:true,insertCount:1,snapshot:rows[0],limitations:'Synthetic Auth/Storage contracts, no Android device or hosted data/provider used.'},null,2));
  console.log('PASS: actual free-booking screen blocks invalid contact, saves one normalized contact/table snapshot through the actual client into fresh PostgreSQL, and opens confirmation without payment.');
 }finally{await browser?.close();await db.close()}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
