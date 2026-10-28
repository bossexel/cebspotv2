// Actual Saved Spots screen with fixture reads; blocks all external traffic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');const {buildFixtureBundle}=require('./location-edit.cjs');
const root=path.resolve(__dirname,'../..'),artifacts=path.join(root,'.codex-tmp/saved-recovery-review-2026-10-28');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Saved from './app/saved';
const f=window.__saved={dark:false,owner:'alice',fail:true,calls:0,ids:['fixture'],removed:[],pending:[],slow:false};window.__picker=f;
window.__renderSaved=()=>createRoot(document.getElementById('root')).render(<Saved/>);
window.__renderSaved();`;
function adapter(name){
 if(name==='expo-router')return `import React from 'react';export const useRouter=()=>({push(){}}),useFocusEffect=fn=>React.useEffect(()=>{const clean=fn();const replay=()=>{clean?.();fn()};window.addEventListener('focus',replay);return()=>{window.removeEventListener('focus',replay);clean?.()}},[fn]);`;
 if(name.endsWith('/hooks/useAuth'))return `import React from 'react';export const useAuth=()=>{const id=React.useSyncExternalStore(cb=>{window.addEventListener('account',cb);return()=>window.removeEventListener('account',cb)},()=>window.__saved.owner);return {user:{id}}};`;
 if(name.endsWith('/components/ScreenContainer'))return `import React from 'react';import {ScrollView} from 'react-native';export const ScreenContainer=({children})=><ScrollView style={{flex:1}} contentContainerStyle={{padding:16}}>{children}</ScrollView>;`;
 if(name.endsWith('/services/savedSpotService'))return `export const savedSpotService={getSavedSpotIds:async()=>[...window.__saved.ids],removeSavedSpotId:async id=>{if(window.__saved.removeFail)throw Error('Synthetic removal failure');window.__saved.removed.push(id);window.__saved.ids=[];return []}};`;
 if(name.endsWith('/services/spotService'))return `export const spotService={getSpotsByIds:async ids=>{const f=window.__saved;f.calls++;if(f.fail)throw Error('Synthetic network failure');if(f.slow)return new Promise(resolve=>f.pending.push(resolve));return ids.map(id=>({id,name:'Saved fixture venue',address:'Cebu fixture',category:'Cafe',images:[]}))}};`;
 throw Error('Unexpected saved fixture '+name);
}
async function main(){fs.mkdirSync(artifacts,{recursive:true});const bundle=await buildFixtureBundle(entry,{filter:/^expo-router$|\/(hooks\/useAuth|components\/ScreenContainer|services\/(savedSpotService|spotService))$/,adapter});
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
  const page=await browser.newPage({viewport:{width:360,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.context().routeWebSocket('**/*',s=>s.close());
  await page.route('**/*',r=>r.request().url()==='https://saved.test/'?r.fulfill({contentType:'text/html',body:'<style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div>'}):r.abort());
  await page.goto('https://saved.test/');await page.addScriptTag({content:bundle});
  await expect(page.getByText(/Saved spots could not be loaded/)).toBeVisible();assert.equal(await page.getByText('No saved spots yet',{exact:true}).count(),0);
  await page.evaluate(()=>window.__saved.fail=false);await page.getByRole('button',{name:'Retry saved spots',exact:true}).click();await expect(page.getByRole('button',{name:'Open Saved fixture venue',exact:true})).toBeVisible();
  await page.evaluate(()=>window.__saved.removeFail=true);await page.getByRole('button',{name:'Remove Saved fixture venue from saved spots',exact:true}).click();await expect(page.getByText(/This saved spot could not be removed/)).toBeVisible();await expect(page.getByRole('button',{name:'Open Saved fixture venue',exact:true})).toBeVisible();
  await page.evaluate(()=>window.__saved.removeFail=false);await page.getByRole('button',{name:'Remove Saved fixture venue from saved spots',exact:true}).click();await expect(page.getByText('No saved spots yet',{exact:true})).toBeVisible();
  await page.evaluate(()=>{window.__saved.ids=['fixture'];window.dispatchEvent(new Event('focus'))});await expect(page.getByRole('button',{name:'Open Saved fixture venue',exact:true})).toBeVisible();
  await page.evaluate(()=>{window.__saved.fail=true;window.dispatchEvent(new Event('focus'))});await expect(page.getByText(/Saved spots could not be loaded/)).toBeVisible();await expect(page.getByRole('button',{name:'Open Saved fixture venue',exact:true})).toBeVisible();
  await page.screenshot({path:path.join(artifacts,'cached-on-error.png')});
  await page.evaluate(()=>{window.__saved.fail=false;window.__saved.slow=true;window.dispatchEvent(new Event('focus'))});await expect.poll(()=>page.evaluate(()=>window.__saved.pending.length)).toBe(1);
  await page.evaluate(()=>{window.__saved.ids=[];window.__saved.owner='bob';window.__saved.slow=false;window.dispatchEvent(new Event('account'))});await expect(page.getByText('No saved spots yet',{exact:true})).toBeVisible();
  await page.evaluate(()=>window.__saved.pending.shift()([{id:'old-alice',name:'Alice private saved entry',address:'Fixture',category:'Cafe',images:[]}])) ;
  await expect(page.getByText('No saved spots yet',{exact:true})).toBeVisible();assert.equal(await page.getByText('Alice private saved entry',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(artifacts,'result.json'),JSON.stringify({kind:'actual-saved-screen-synthetic-service-interactions',result:'PASS',cases:['failure differs from empty','retry recovers','failed removal preserves row','removal retry succeeds','cached rows survive failed refresh','account switch clears old rows','late old-account response ignored'],limitations:'No native device or real user storage/API used.'},null,2));
  console.log('PASS: saved error/empty distinction, retry, cached refresh, account switch and stale-response isolation.');
 }finally{await browser.close()}}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
