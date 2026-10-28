// Actual posting screen and map renderer; services and tiles are local fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const {buildFixtureBundle,tile}=require('./location-edit.cjs');
const root=path.resolve(__dirname,'../..');
const artifacts=path.join(root,'.codex-tmp/post-location-review');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import SubmitSpot from './app/submit-spot';
window.__picker={dark:false,locationCalls:0,submissions:[],matches:[],routes:[],profile:{id:'fixture-user',display_name:'Explorer'}};
createRoot(document.getElementById('root')).render(<SubmitSpot/>);`;
function adapter(name){
  if(name==='expo-router')return `import React from 'react';const router={back:()=>window.__picker.routes.push('back'),replace:r=>window.__picker.routes.push(r)};export const useRouter=()=>router;export const useLocalSearchParams=()=>({});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);`;
  if(name==='expo-image-picker')return `export const launchImageLibraryAsync=async()=>({canceled:false,assets:[{uri:'https://media.test/photo.png',type:'image',mimeType:'image/png'}]});`;
  if(name.endsWith('/hooks/useAuth'))return `export const useAuth=()=>({profile:window.__picker.profile});`;
  if(name.endsWith('/hooks/useLocation'))return `export const useLocation=()=>({getCurrentLocation:()=>{window.__picker.locationCalls++;return new Promise(()=>{})},loading:true});`;
  if(name.endsWith('/components/ScreenContainer'))return `import React from 'react';import {ScrollView} from 'react-native';export const ScreenContainer=({appColors,children,scrollEnabled=true})=><ScrollView testID="screen-scroll-view" scrollEnabled={scrollEnabled} style={{flex:1,backgroundColor:appColors.surface}} contentContainerStyle={{padding:16}}>{children}</ScrollView>;`;
  if(name.endsWith('/services/spotSubmissionDraftService'))return `export const spotSubmissionDraftService={get:async()=>JSON.parse(localStorage.getItem('fixture-draft')||'null'),save:async(user,draft)=>{localStorage.setItem('fixture-draft',JSON.stringify(draft));return draft},clear:async()=>localStorage.removeItem('fixture-draft')};`;
  if(name.endsWith('/services/spotSubmissionQueueService'))return `export const spotSubmissionQueueService={enqueue:async(payload)=>window.__picker.submissions.push(payload)};`;
  if(name.endsWith('/services/spotMatchingService'))return `export const findMatchingSpots=async(name,latitude,longitude)=>{window.__picker.matches.push({name,latitude,longitude});return []};`;
  if(name.endsWith('/services/spotService'))return `export const spotService={getSpotById:async()=>null};`;
  throw Error('Unexpected adapter '+name);
}
async function main(){
  fs.mkdirSync(artifacts,{recursive:true});
  const bundle=await buildFixtureBundle(entry,{filter:/^(expo-router|expo-image-picker)$|\/(hooks\/(useAuth|useLocation)|components\/ScreenContainer|services\/(spotSubmissionDraftService|spotSubmissionQueueService|spotMatchingService|spotService))$/,adapter});
  const html='<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="/bundle.js"></script></html>';
  const browser=await chromium.launch({channel:process.env.MAP_TEST_CHANNEL||'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='posting.test')return route.fulfill({contentType:url.pathname==='/bundle.js'?'application/javascript':'text/html',body:url.pathname==='/bundle.js'?bundle:html});return route.fulfill({contentType:'image/svg+xml',body:tile});});
    await page.goto('https://posting.test');await page.getByRole('button',{name:'I Agree',exact:true}).click();
    const lat=page.getByRole('textbox',{name:'Spot latitude',exact:true}),lng=page.getByRole('textbox',{name:'Spot longitude',exact:true});
    await lat.scrollIntoViewIfNeeded();await expect(lat).toBeVisible();await expect(lng).toBeVisible();
    await expect(page.getByTestId('post-location-map')).toHaveCount(0);
    const address=page.getByPlaceholder('Street, Barangay, City');
    assert.ok((await lat.boundingBox()).y>(await address.boundingBox()).y,'coordinates appear under Address');
    await lat.fill('10.3456789');await lng.fill('123.9123456');
    // Coordinate-only edits must trigger draft protection, and restore exactly.
    await page.getByRole('button',{name:'Leave spot submission',exact:true}).click();
    await page.getByRole('button',{name:'Save as Draft',exact:true}).click();
    const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-draft')));
    assert.equal(draft.latitude,10.3456789);assert.equal(draft.longitude,123.9123456);
    await page.reload();await page.getByRole('button',{name:'I Agree',exact:true}).click();
    await expect(lat).toHaveValue('10.3456789');await expect(lng).toHaveValue('123.9123456');
    await page.getByRole('button',{name:'Choose spot location on map',exact:true}).click();
    const mapFrame=page.getByTestId('post-location-map');await mapFrame.scrollIntoViewIfNeeded();
    const frame=()=>page.frames().find(f=>f!==page.mainFrame());
    await expect.poll(async()=>Boolean(frame()&&await frame().evaluate(()=>Boolean(window.__map)))).toBe(true);
    let map=frame();
    // A newly measured Leaflet viewport rounds its origin to screen pixels.
    await expect.poll(()=>map.evaluate(()=>window.__map.project(window.__map.getCenter()).distanceTo(window.__map.project([10.3456789,123.9123456])))).toBeLessThan(1);
    assert.equal(await page.evaluate(()=>window.__picker.locationCalls),0,'opening the pin picker does not wait for GPS');
    const box=await mapFrame.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
    const client=await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=8;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-30*i/8,y:y-55*i/8,id:1}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(async()=>Math.abs(Number(await lat.inputValue())-10.3456789)).toBeGreaterThan(0.00001);
    await expect.poll(async()=>Math.abs(Number(await lat.inputValue())-(await map.evaluate(()=>window.__map.getCenter().lat)))).toBeLessThan(1e-7);
    await expect.poll(async()=>Math.abs(Number(await lng.inputValue())-(await map.evaluate(()=>window.__map.getCenter().lng)))).toBeLessThan(1e-7);
    await lat.scrollIntoViewIfNeeded();
    assert.ok((await lat.boundingBox()).y>=(await mapFrame.boundingBox()).y+250,'coordinates remain below the map');
    await page.screenshot({path:path.join(artifacts,'post-location-light.png')});
    const chosen={latitude:Number(await lat.inputValue()),longitude:Number(await lng.inputValue())};
    await page.getByRole('button',{name:'Hide spot location map',exact:true}).click();
    await expect(mapFrame).toHaveCount(0);await expect(lat).toHaveValue(chosen.latitude.toFixed(7));
    await page.getByRole('button',{name:'Choose spot location on map',exact:true}).click();await mapFrame.scrollIntoViewIfNeeded();
    await expect.poll(async()=>Boolean(frame()&&await frame().evaluate(()=>Boolean(window.__map)))).toBe(true);map=frame();
    await expect.poll(()=>map.evaluate(chosen=>window.__map.project(window.__map.getCenter()).distanceTo(window.__map.project([chosen.latitude,chosen.longitude])),chosen)).toBeLessThan(1);
    await lat.fill('-33.8688');await lng.fill('151.2093');
    await expect.poll(()=>map.evaluate(()=>Math.abs(window.__map.getCenter().lat+33.8688)+Math.abs(window.__map.getCenter().lng-151.2093))).toBeLessThan(1e-7);
    await lat.fill('91');await expect(page.getByRole('button',{name:'Submit Spot',exact:true})).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Latitude must');
    await lat.fill('10.3212345');await lng.fill('123.9012345');
    await page.getByRole('button',{name:'Hide spot location map',exact:true}).click();
    await page.getByPlaceholder('e.g. Neon Brew Terminal').fill('Fixture posting cafe');
    await address.fill('Fixture Cebu address');
    await page.getByRole('button',{name:'Add spot photos',exact:true}).click();
    await page.getByText('Specialty Coffee',{exact:true}).click();
    await page.getByText('No',{exact:true}).click();
    const submit=page.getByRole('button',{name:'Submit Spot',exact:true});await expect(submit).toBeEnabled();await submit.click();
    await expect.poll(()=>page.evaluate(()=>window.__picker.submissions.length)).toBe(1);
    const payload=await page.evaluate(()=>window.__picker.submissions[0]);
    assert.equal(payload.latitude,10.3212345);assert.equal(payload.longitude,123.9012345);
    assert.equal(payload.spot_id,null);assert.equal(payload.submitter_id,'fixture-user');
    assert.equal(await page.evaluate(()=>window.__picker.locationCalls),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: actual posting screen, optional coordinates under Address, immediate picker without GPS, touch drag/coordinate sync, retained pin after hide/reopen, signed input, invalid submission prevention, coordinate-only draft protection/restoration, exact queued coordinates.');
  }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
