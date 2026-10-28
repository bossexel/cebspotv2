// Actual Explore and bookmark service; asynchronous storage/Auth are synthetic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');const {buildFixtureBundle}=require('./location-edit.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.codex-tmp/explore-bookmarks-2026-10-28');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import Explore from './app/index';
const f=window.__bookmarks={owner:'alice',dark:false,delay:true,pending:[],fail:false,writes:[],alerts:[],storage:{alice:['alice-private'],bob:['fixture']}};window.__picker=f;
createRoot(document.getElementById('root')).render(<Explore/>);`;
function adapter(name){
 if(name==='react-native')return `export * from ${JSON.stringify(require.resolve('react-native-web'))};export const Alert={alert:(...args)=>window.__bookmarks.alerts.push(args)};`;
 if(name==='expo-router')return `export const useRouter=()=>({push(){}}),useLocalSearchParams=()=>({});`;
 if(name.endsWith('/hooks/useAuth'))return `import React from 'react';export const useAuth=()=>({user:{id:React.useSyncExternalStore(cb=>{window.addEventListener('account',cb);return()=>window.removeEventListener('account',cb)},()=>window.__bookmarks.owner)}});`;
 if(name.endsWith('/hooks/useLocation'))return `export const useLocation=()=>({location:null,loading:false,getCurrentLocation:async()=>null});`;
 if(name.endsWith('/features/onboarding/GuideProvider'))return `import React from 'react';export const useGuideTarget=()=>React.useCallback(()=>{},[]),HomeGuideReady=()=>null;`;
 if(name.endsWith('/components/TileMap'))return `export const TileMap=()=>null;`;
 if(name.endsWith('/components/ScreenContainer'))return `import React from 'react';import {View} from 'react-native';export const ScreenContainer=({children})=><View style={{flex:1}}>{children}</View>;`;
 if(name.endsWith('/services/spotService'))return `export const spotService={getSpots:async()=>[{id:'fixture',name:'Fixture cafe',category:'Cafe',categories:['Cafe'],address:'Cebu fixture',latitude:10.32,longitude:123.9,images:[],rating:4}],subscribeToSpots:()=>()=>{}};`;
 if(name.endsWith('/lib/supabase'))return `export const hasSupabaseConfig=true,supabase={auth:{getSession:async()=>({data:{session:{user:{id:window.__bookmarks.owner}}},error:null})}};`;
 if(name==='@react-native-async-storage/async-storage')return `export default {getItem:async key=>{const f=window.__bookmarks,owner=key.split(':').at(-1);if(f.fail)throw Error('Synthetic storage failure');const snapshot=JSON.stringify(f.storage[owner]||[]);if(f.delay&&owner==='alice')return new Promise(resolve=>f.pending.push(()=>resolve(snapshot)));return snapshot},setItem:async(key,value)=>{const f=window.__bookmarks,owner=key.split(':').at(-1);f.writes.push({owner,ids:JSON.parse(value)});f.storage[owner]=JSON.parse(value)}};`;
 throw Error('Unexpected bookmark adapter '+name);
}
async function main(){fs.mkdirSync(out,{recursive:true});const bundle=await buildFixtureBundle(entry,{filter:/^(react-native|expo-router|@react-native-async-storage\/async-storage)$|\/(hooks\/(useAuth|useLocation)|features\/onboarding\/GuideProvider|components\/(TileMap|ScreenContainer)|services\/spotService|lib\/supabase)$/,adapter});
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
  const page=await browser.newPage({viewport:{width:360,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.context().routeWebSocket('**/*',s=>s.close());
  await page.route('**/*',r=>r.request().url()==='https://bookmarks.test/'?r.fulfill({contentType:'text/html',body:'<style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div>'}):r.abort());
  async function open(){await page.goto('https://bookmarks.test/');await page.addScriptTag({content:bundle});await expect.poll(()=>page.evaluate(()=>window.__bookmarks.pending.length)).toBe(1)}
  await open();await page.evaluate(()=>{window.__bookmarks.owner='bob';window.dispatchEvent(new Event('account'))});
  const remove=page.getByRole('button',{name:'Remove Fixture cafe from favorites',exact:true});await expect(remove).toBeVisible();
  await page.evaluate(()=>window.__bookmarks.pending.shift()());await expect(remove).toBeVisible();
  assert.ok((await page.evaluate(()=>window.__bookmarks.writes)).every(w=>w.owner==='bob'&&!w.ids.includes('alice-private')));
  await remove.click();await expect.poll(()=>page.evaluate(()=>window.__bookmarks.storage.bob.length)).toBe(0);
  assert.deepEqual(await page.evaluate(()=>window.__bookmarks.storage.alice),['alice-private']);
  await open();await page.evaluate(()=>{const f=window.__bookmarks;f.fail=true;f.owner='bob';window.dispatchEvent(new Event('account'))});
  await page.getByRole('button',{name:'Add Fixture cafe to favorites',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__bookmarks.alerts.length)).toBe(1);
  assert.equal(await page.evaluate(()=>window.__bookmarks.writes.length),0);assert.deepEqual(await page.evaluate(()=>window.__bookmarks.storage.bob),['fixture']);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'PASS',cases:['late old-account read ignored','writes stay bound to current account','old account storage preserved','failed initial load never overwrites saved IDs'],limitations:'Browser-rendered actual Explore/service with synthetic Auth and storage; no native device or hosted writes.'},null,2));console.log('PASS: Explore ignores stale account reads, isolates bookmark writes, preserves old account storage and never overwrites a failed load.');
 }finally{await browser.close()}}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
