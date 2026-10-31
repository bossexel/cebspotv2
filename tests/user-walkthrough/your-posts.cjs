// Real Profile and Your Posts components with synthetic services and blocked network.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const esbuild = require(path.join(root, '.codex-tmp/user-walkthrough-tools/node_modules/esbuild'));
const artifacts = path.join(root, '.codex-tmp/your-posts-review');
const nativeWeb = require.resolve('react-native-web');
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {FocusContext} from 'expo-router';
import Profile from './app/profile';
import YourPosts from './app/your-posts';
window.__posts={route:'/profile',epoch:0,dark:false,mode:'posts',alerts:[],requests:[],lookups:[]};
window.__posts.go=route=>{window.__posts.route=route;window.dispatchEvent(new Event('route'))};
function App(){const snapshot=React.useSyncExternalStore(fn=>{window.addEventListener('route',fn);return()=>window.removeEventListener('route',fn)},()=>window.__posts.route+'|'+window.__posts.epoch);
const route=window.__posts.route;const visited=React.useRef(false);if(route==='/your-posts')visited.current=true;
return <><div style={{display:'flex',flex:1,position:route==='/your-posts'?'relative':'absolute',inset:0,visibility:route==='/your-posts'?'visible':'hidden'}}><FocusContext.Provider value={route==='/your-posts'}>{visited.current&&<YourPosts key={window.__posts.epoch}/>}</FocusContext.Provider></div>
{route==='/profile'?<Profile/>:route==='/your-posts'?null:<div>{route}</div>}</>}
createRoot(document.getElementById('root')).render(<App/>);`;
function adapter(name) {
  if (name === 'react-native') return `export * from ${JSON.stringify(nativeWeb)};export const Alert={alert:(...args)=>window.__posts.alerts.push(args)};`;
  if (name === 'react-native-svg') return `import React from 'react';const shape=tag=>React.forwardRef(({children,...props},ref)=>React.createElement(tag,{...props,ref},children));
    export const Svg=shape('svg'),Path=shape('path'),Circle=shape('circle'),Line=shape('line'),Polyline=shape('polyline'),Polygon=shape('polygon'),Rect=shape('rect'),G=shape('g'),Ellipse=shape('ellipse'),Defs=shape('defs'),ClipPath=shape('clipPath');export default Svg;`;
  if (name === 'expo-image-picker') return `export const requestMediaLibraryPermissionsAsync=async()=>({granted:false});export const launchImageLibraryAsync=async()=>({canceled:true,assets:[]});`;
  if (name === 'expo-router') return `import React from 'react';const router={push:r=>{window.__posts.scrollBeforeNavigation=document.querySelector('[data-testid="your-posts-list"]')?.scrollTop;const path=typeof r==='string'?r:r.pathname+(r.params?.submissionId?'?submissionId='+r.params.submissionId:'');window.__posts.go(path)},replace:r=>window.__posts.go(r),canGoBack:()=>false};
    export const FocusContext=React.createContext(true);export const useRouter=()=>router;export const useFocusEffect=callback=>{const focused=React.useContext(FocusContext);React.useEffect(()=>focused?callback():undefined,[callback,focused])};`;
  if (name.endsWith('/hooks/useAuth')) return `export const useAuth=()=>({user:{id:'alice'},profile:{id:'alice',display_name:'Alice',email:'alice@example.test'},refreshProfile:async()=>{},logOut:async()=>{}});`;
  if (name.endsWith('/hooks/useTheme')) return `import React from 'react';import {colors,darkColors} from ${JSON.stringify(path.join(root,'src/constants/colors.ts'))};
    export const useTheme=()=>{const dark=React.useSyncExternalStore(fn=>{window.addEventListener('theme',fn);return()=>window.removeEventListener('theme',fn)},()=>window.__posts.dark);return {appColors:dark?darkColors:colors,isDarkMode:dark,toggleDarkMode:()=>{window.__posts.dark=!dark;window.dispatchEvent(new Event('theme'))}}};`;
  if (name.endsWith('/components/ScreenContainer')) return `import React from 'react';import {View,ScrollView} from 'react-native';export const ScreenContainer=({appColors,children,scroll})=>scroll?<ScrollView style={{flex:1,backgroundColor:appColors.surface}} contentContainerStyle={{padding:16}}>{children}</ScrollView>:<View style={{flex:1,backgroundColor:appColors.surface}}>{children}</View>;`;
  if (name.endsWith('/components/ConfirmationModal')) return `export const ConfirmationModal=()=>null;`;
  if (name.endsWith('/services/yourPostsService')) return `export const yourPostsService={getPage:async(user,cursor=null)=>{const f=window.__posts;f.requests.push({user,cursor});if(f.mode==='error')throw Error('Synthetic outage');if(f.mode==='empty')return {items:[],nextCursor:null};
    const offset=cursor?Number(cursor.id):0;
    const rows=f.mode==='large'?Array.from({length:12},(_,i)=>({id:String(offset+i+1),status:'approved',description:'Visit '+(offset+i+1),images:Array.from({length:8},(_,n)=>'https://media.test/'+(offset+i+1)+'-'+n+'.jpg')})):
      cursor?[{id:'rejected',status:'rejected',description:'Original rejected caption',rejection_reason:'Needs location details'}]:[{id:'newer',status:'pending',description:'My return visit'},{id:'older',status:'approved',description:'My first visit'}];
    return {items:rows.map(p=>({...p,submitter_id:user,name:'Same cafe',address:'Cebu',category:'Specialty Coffee',categories:['Specialty Coffee','Dog Friendly'],created_at:'2026-10-27T01:00:00Z',images:p.images||[],postId:p.id==='rejected'?null:'post-'+p.id})),nextCursor:f.mode==='large'?(offset<36?{id:String(offset+12),createdAt:'2026-10-27T01:00:00Z'}:null):cursor?null:{id:'20',createdAt:'2026-10-27T01:00:00Z'}}},
    getPostId:async(user,id)=>{window.__posts.lookups.push(id);return id==='rejected'?null:'post-'+id}};`;
  const serviceName = name.split('/').pop();
  const methods = {reservationService:'getUserReservations:async()=>[]',savedSpotService:'getSavedSpotIds:async()=>[]',gamificationService:'getSummary:async()=>null',profilePhotoService:'',profileService:''};
  if (Object.hasOwn(methods,serviceName)) return 'export const '+serviceName+'={'+methods[serviceName]+'};';
  throw Error('Unexpected adapter '+name);
}
async function main() {
  fs.mkdirSync(artifacts,{recursive:true});
  const bundle=(await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
    plugins:[{name:'fixtures',setup(build){
      build.onResolve({filter:/^(react-native|react-native-svg|expo-image-picker|expo-router)$|\/(hooks\/(useAuth|useTheme)|components\/(ScreenContainer|ConfirmationModal)|services\/\w+Service)$/},args=>({path:args.path,namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:adapter(args.path),loader:'tsx',resolveDir:root}));
    }}]})).outputFiles[0].text;
  const html='<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="/bundle.js"></script></html>';
  const browser=await chromium.launch({channel:process.env.MAP_TEST_CHANNEL||'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const mediaRequests=[];
    await page.route('**/*',route=>{const url=new URL(route.request().url());
      if(url.hostname==='media.test'){mediaRequests.push(url.pathname);return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')})}
      if(url.hostname!=='posts.test')return route.abort();return route.fulfill({contentType:url.pathname==='/bundle.js'?'application/javascript':'text/html',body:url.pathname==='/bundle.js'?bundle:html});});
    await page.goto('https://posts.test');
    await expect(page.getByRole('button',{name:'Delete account',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Your Posts',exact:true}).click();
    await expect(page.getByText('My return visit',{exact:true})).toBeVisible();
    await expect(page.getByText('My first visit',{exact:true})).toBeVisible();
    await expect(page.getByText('Awaiting spot review',{exact:true})).toBeVisible();
    await expect(page.getByText('Spot approved',{exact:true})).toBeVisible();
    await expect(page.getByText('Specialty Coffee · Dog Friendly',{exact:true}).first()).toBeVisible();
    await expect(page.getByRole('button',{name:'Post options for Same cafe',exact:true})).toHaveCount(2);
    await expect(page.getByText('You can edit this post; it will return to review. The live map listing stays unchanged until an admin updates it. Contact an admin to remove that listing.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Post options for Same cafe',exact:true}).first().click();
    assert.deepEqual(await page.evaluate(()=>window.__posts.alerts.at(-1)[2].map(action=>action.text)),['Edit details','Delete','Cancel']);
    await page.evaluate(()=>window.__posts.alerts.at(-1)[2].find(action=>action.text==='Delete').onPress());
    assert.equal(await page.evaluate(()=>window.__posts.alerts.at(-1)[0]),'Delete spot submission?','delete requires explicit confirmation');
    await page.getByRole('button',{name:'Post options for Same cafe',exact:true}).first().click();
    await page.evaluate(()=>window.__posts.alerts.at(-1)[2].find(action=>action.text==='Edit details').onPress());
    await expect(page.getByText('/submit-spot?submissionId=newer',{exact:true})).toBeVisible();
    await page.evaluate(()=>window.__posts.go('/your-posts'));
    await expect(page.getByText('Open post',{exact:true})).toHaveCount(0);
    await page.screenshot({path:path.join(artifacts,'your-posts-light.png')});
    await page.getByRole('button',{name:'Open your post about Same cafe',exact:true}).first().click();
    await expect(page.getByText('/post/post-newer',{exact:true})).toBeVisible();
    assert.deepEqual(await page.evaluate(()=>window.__posts.lookups),[],'a card tap uses its batched link without fetching another post');
    await page.evaluate(()=>window.__posts.go('/your-posts'));
    assert.equal((await page.evaluate(()=>window.__posts.requests)).length,1,'returning from a post retains the loaded list');
    await page.getByRole('button',{name:'Load more posts',exact:true}).click();
    await expect(page.getByText('Original rejected caption',{exact:true})).toBeVisible();
    await expect(page.getByText('My return visit',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Open your post about Same cafe',exact:true}).last().click();
    assert.equal(await page.evaluate(()=>window.__posts.alerts.at(-1)[0]),'Post unavailable');
    await page.evaluate(()=>window.__posts.go('/profile'));
    await page.getByRole('button',{name:'Open settings',exact:true}).click();
    await expect(page.getByRole('button',{name:'Delete account',exact:true})).toBeVisible();
    await page.waitForTimeout(350);
    await page.screenshot({path:path.join(artifacts,'profile-settings.png')});
    await page.getByRole('button',{name:'Delete account',exact:true}).click();
    await expect(page.getByText('/account-deletion',{exact:true})).toBeVisible();
    await page.evaluate(()=>{window.__posts.mode='error';window.__posts.epoch++;window.__posts.go('/your-posts')});
    await expect(page.getByRole('alert')).toContainText('could not be loaded');
    await expect(page.getByText('Your discoveries start here',{exact:true})).toHaveCount(0);
    await page.evaluate(()=>{window.__posts.mode='empty'});
    await page.getByRole('button',{name:'Try again',exact:true}).click();
    await expect(page.getByText('Your discoveries start here',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Share a Spot',exact:true}).click();
    await expect(page.getByText('/submit-spot',{exact:true})).toBeVisible();
    await page.evaluate(()=>{window.__posts.mode='posts';window.__posts.epoch++;window.__posts.dark=true;window.dispatchEvent(new Event('theme'));window.__posts.go('/your-posts')});
    await expect(page.getByText('My return visit',{exact:true})).toBeVisible();
    await page.screenshot({path:path.join(artifacts,'your-posts-dark.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.evaluate(()=>{window.__posts.mode='large';window.__posts.epoch++;window.__posts.go('/your-posts')});
    await expect(page.getByText('Visit 1',{exact:true})).toBeVisible();
    for(let batch=0;batch<3;batch++)await page.getByRole('button',{name:'Load more posts',exact:true}).click();
    const scroll=page.getByTestId('your-posts-list');
    await expect.poll(async()=>{
      await scroll.evaluate(node=>{node.scrollTop=node.scrollHeight});
      return page.getByText('Visit 48',{exact:true}).isVisible();
    }).toBe(true);
    const cards=await page.getByRole('button',{name:'Open your post about Same cafe',exact:true}).count();
    assert.ok(cards<30,'virtualization keeps fewer than 30 of the 48 loaded cards mounted; actual '+cards);
    const previews=await page.getByRole('img',{name:'Photo of Same cafe',exact:true}).count();
    assert.equal(previews,cards,'each mounted card renders one media preview');
    assert.ok(mediaRequests.length>0);
    assert.ok(mediaRequests.every(url=>/\/-?\d+-0\.jpg$/.test(url)),'scrolling never downloads the other seven attachments');
    const before=await scroll.evaluate(node=>node.scrollTop);
    assert.ok(before>0);
    const requestsBefore=(await page.evaluate(()=>window.__posts.requests)).length;
    await page.getByRole('button',{name:'Open your post about Same cafe',exact:true}).last().click();
    await expect(page.getByText('/post/post-48',{exact:true})).toBeVisible();
    const scrollBeforeNavigation=await page.evaluate(()=>window.__posts.scrollBeforeNavigation);
    await page.evaluate(()=>window.__posts.go('/your-posts'));
    await expect(page.getByText('Visit 48',{exact:true})).toBeVisible();
    assert.equal((await page.evaluate(()=>window.__posts.requests)).length,requestsBefore);
    assert.equal(await scroll.evaluate(node=>node.scrollTop),scrollBeforeNavigation,'returning preserves scroll position');
    assert.ok((await page.evaluate(()=>window.__posts.requests)).every(r=>r.user==='alice'));
    assert.deepEqual(errors,[]);
    console.log('PASS: tappable cards without Open post buttons, batched post links, cached return/scroll position, 48-post virtualized list, one preview per card, pagination, moderation/error/empty states, Settings deletion navigation, light/dark layout.');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
