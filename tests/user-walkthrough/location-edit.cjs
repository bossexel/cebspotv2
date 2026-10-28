// Actual picker, modal, bridge, and bundled Leaflet renderer. All tiles are fixtures.
// This checks browser touch behavior; native Android device acceptance is separate.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const esbuild = require(path.join(root, '.codex-tmp/user-walkthrough-tools/node_modules/esbuild'));
const artifacts = path.join(root, '.codex-tmp/location-edit-review');
const nativeWeb = require.resolve('react-native-web');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9efdf"/><path d="M0 100H256M80 0V256" stroke="white" stroke-width="12"/></svg>';
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {Pressable,Text,TextInput,View} from 'react-native';
import {SpotLocationPicker} from './src/components/SpotLocationPicker';
import {SpotEditSuggestionModal} from './src/components/SpotEditSuggestionModal';
window.__picker={coordinate:{latitude:10.3298,longitude:123.9054},changes:0,closes:0,saved:[],dark:false};
function App(){const [visible,setVisible]=React.useState(false),[coordinate,setCoordinate]=React.useState(window.__picker.coordinate),[interacting,setInteracting]=React.useState(false),[note,setNote]=React.useState('');
const onChange=React.useCallback(point=>{window.__picker.coordinate=point;window.__picker.changes++;setCoordinate(point)},[]);
const close=()=>{window.__picker.closes++;setVisible(false)};
return <View style={{flex:1,padding:20}}><Pressable accessibilityRole="button" accessibilityLabel="Suggest an edit" onPress={()=>{setCoordinate({latitude:10.3298,longitude:123.9054});setInteracting(false);setVisible(true)}}><Text>Suggest an edit</Text></Pressable>
<SpotEditSuggestionModal visible={visible} onClose={close} mapInteracting={interacting}>
<View style={{flexDirection:'row',justifyContent:'space-between'}}><Text>Suggest an Edit</Text><Pressable accessibilityRole="button" accessibilityLabel="Close edit suggestion" onPress={close}><Text>Close</Text></Pressable></View>
<SpotLocationPicker latitude={10.3298} longitude={123.9054} category="Specialty Coffee" onChange={onChange} onInteractionChange={setInteracting}/>
<TextInput accessibilityLabel="Note for admins" value={note} onChangeText={setNote} placeholder="Optional note for admins" style={{minHeight:48}}/>
<Pressable accessibilityRole="button" accessibilityLabel="Submit Suggestion" disabled={!coordinate||interacting} onPress={()=>window.__picker.saved.push({suggested_value:JSON.stringify(coordinate),note})} style={{minHeight:44}}><Text>Submit Suggestion</Text></Pressable>
</SpotEditSuggestionModal></View>}
createRoot(document.getElementById('root')).render(<App/>);`;

function adapter(name) {
  if (name === 'react-native') return `export * from ${JSON.stringify(nativeWeb)};`;
  if (name === 'react-native-svg') return `import React from 'react';const shape=tag=>React.forwardRef(({children,...props},ref)=>React.createElement(tag,{...props,ref},children));export const Svg=shape('svg'),Path=shape('path'),Circle=shape('circle'),Line=shape('line'),Polyline=shape('polyline'),Polygon=shape('polygon'),Rect=shape('rect'),G=shape('g'),Ellipse=shape('ellipse'),Defs=shape('defs'),ClipPath=shape('clipPath');export default Svg;`;
  if (name.endsWith('/hooks/useTheme')) return `import React from 'react';import {colors,darkColors} from ${JSON.stringify(path.join(root,'src/constants/colors.ts'))};export const useTheme=()=>{const dark=React.useSyncExternalStore(fn=>{window.addEventListener('theme',fn);return()=>window.removeEventListener('theme',fn)},()=>window.__picker.dark);return {appColors:dark?darkColors:colors}};`;
  throw Error('Unexpected adapter '+name);
}

async function buildFixtureBundle(entryCode, extra = {}) {
  return (await esbuild.build({stdin:{contents:entryCode,loader:'tsx',resolveDir:root},bundle:true,write:false,
    format:'iife',platform:'browser',jsx:'automatic',loader:{'.png':'dataurl'},resolveExtensions:['.web.tsx','.web.ts','.tsx','.ts','.jsx','.js','.json'],
    define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'additional-fixtures',setup(build){
      if (!extra.filter) return;
      build.onResolve({filter:extra.filter},args=>({path:args.path,namespace:'additional-fixture'}));
      build.onLoad({filter:/.*/,namespace:'additional-fixture'},args=>({contents:extra.adapter(args.path),loader:'tsx',resolveDir:root}));
    }},{name:'fixtures',setup(build){
      build.onResolve({filter:/^(react-native|react-native-svg)$|\/hooks\/useTheme$/},args=>({path:args.path,namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:adapter(args.path),loader:'tsx',resolveDir:root}));
      build.onLoad({filter:/mapDocument\.generated\.ts$/},args=>{
        const source=fs.readFileSync(args.path,'utf8');
        const html=JSON.parse(source.slice(source.indexOf('export const mapHtml = ')+23).trim().replace(/;$/,''));
        const instrument='</script><script>window.__messages=[];window.ReactNativeWebView={postMessage:data=>{window.__messages.push(data===\"ready\"?data:JSON.parse(data));window.parent.postMessage({source:\"cebspot-map\",data},\"*\")}};var original=L.map;L.map=function(){window.__map=original.apply(L,arguments);return window.__map};</script><script>';
        return {contents:'export const mapHtml='+JSON.stringify(html.replace('</script><script>',instrument))+';',loader:'ts'};
      });
    }}]})).outputFiles[0].text;
}

async function main() {
  fs.mkdirSync(artifacts,{recursive:true});
  const bundle=await buildFixtureBundle(entry);
  const html='<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="/bundle.js"></script></html>';
  const browser=await chromium.launch({channel:process.env.MAP_TEST_CHANNEL||'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});
    await page.route('**/*',route=>{const url=new URL(route.request().url());
      if(url.hostname==='picker.test')return route.fulfill({contentType:url.pathname==='/bundle.js'?'application/javascript':'text/html',body:url.pathname==='/bundle.js'?bundle:html});
      return route.fulfill({contentType:'image/svg+xml',body:tile});
    });
    await page.goto('https://picker.test');
    await page.getByRole('button',{name:'Suggest an edit',exact:true}).click();
    const frame=()=>page.frames().find(f=>f!==page.mainFrame());
    await expect.poll(async()=>Boolean(frame()&&await frame().evaluate(()=>Boolean(window.__map)))).toBe(true);
    const map=frame();
    await map.evaluate(()=>{window.__originalMap=window.__map;window.__originalTile=document.querySelector('.leaflet-tile')});
    const lat=page.getByRole('textbox',{name:'Suggested latitude',exact:true});
    const lng=page.getByRole('textbox',{name:'Suggested longitude',exact:true});
    const submit=page.getByRole('button',{name:'Submit Suggestion',exact:true});
    await expect(lat).toHaveValue('10.3298000');
    await page.screenshot({path:path.join(artifacts,'location-picker-light.png')});
    const box=await page.getByTestId('edit-location-map').boundingBox();
    const pinBefore=await page.getByTestId('suggested-location-pin').boundingBox();
    const client=await context.newCDPSession(page);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    const pinch=(type,spread)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:x-spread,y,id:1},{x:x+spread,y,id:2}]});
    await pinch('touchStart',25);
    for(const spread of [30,35,45,55,65])await pinch('touchMove',spread);
    await pinch('touchEnd',65);
    await expect.poll(()=>map.evaluate(()=>window.__map.getZoom())).toBeGreaterThan(16);
    await expect(submit).toBeEnabled();
    await expect(page.getByRole('button',{name:'Close edit suggestion',exact:true})).toBeVisible();
    assert.equal(await page.evaluate(()=>window.__picker.closes),0,'pinch never dismisses the modal');
    const zoom=await map.evaluate(()=>window.__map.getZoom());
    await page.getByRole('textbox',{name:'Note for admins',exact:true}).fill('Correct entrance');
    assert.equal(await map.evaluate(()=>window.__map.getZoom()),zoom,'unrelated parent renders preserve the chosen zoom');
    const changesBefore=await page.evaluate(()=>window.__picker.changes);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=8;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+30*i/8,y:y+70*i/8,id:1}]});
    const pinDuring=await page.getByTestId('suggested-location-pin').boundingBox();
    assert.ok(Math.abs(pinDuring.x-pinBefore.x)<1&&Math.abs(pinDuring.y-pinBefore.y)<1,'pin stays fixed under a drag without waiting for React');
    assert.ok(await page.evaluate(()=>window.__picker.changes)-changesBefore<=1,'dragging does not send every animation frame across the bridge');
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>page.evaluate(()=>window.__picker.changes)).toBeGreaterThan(changesBefore);
    await expect.poll(async()=>Math.abs(Number(await lat.inputValue())-(await map.evaluate(()=>window.__map.getCenter().lat)))).toBeLessThan(0.000001);
    await lat.fill('-33.8688');await lng.fill('151.2093');
    await expect.poll(()=>map.evaluate(()=>Math.abs(window.__map.getCenter().lat+33.8688)+Math.abs(window.__map.getCenter().lng-151.2093))).toBeLessThan(1e-7);
    assert.equal(await map.evaluate(()=>window.__map===window.__originalMap),true,'coordinate edits reuse the map instance');
    assert.equal(await map.evaluate(()=>Boolean(window.__map._flyToFrame)),false,'coordinate entry does not start a camera flight');
    await lat.fill('91');await expect(submit).toBeDisabled();await expect(page.getByRole('alert')).toContainText('Latitude must');
    await lat.fill('-');await expect(submit).toBeDisabled();
    await lat.fill('0');await lng.fill('181');await expect(submit).toBeDisabled();
    await lng.fill('0');await expect(submit).toBeEnabled();
    await expect.poll(()=>map.evaluate(()=>Math.abs(window.__map.getCenter().lat)+Math.abs(window.__map.getCenter().lng))).toBeLessThan(1e-7);
    await lat.fill('10.3299');await lng.fill('123.9054');
    await page.getByTestId('edit-location-map').scrollIntoViewIfNeeded();
    await map.locator('[aria-label="Current pin"]').click();
    await expect(lat).toHaveValue('10.3298000');
    await expect(lng).toHaveValue('123.9054000');
    await lat.fill('10.3157123');await lng.fill('123.8854123');await submit.click();
    const saved=await page.evaluate(()=>window.__picker.saved.at(-1));
    assert.deepEqual(JSON.parse(saved.suggested_value),{latitude:10.3157123,longitude:123.8854123});
    assert.equal(saved.note,'Correct entrance');
    await page.getByTestId('edit-location-map').scrollIntoViewIfNeeded();
    await page.getByRole('button',{name:'Zoom out on suggested location',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__picker.closes),0,'zoom controls never dismiss the modal');
    await page.evaluate(()=>{window.__picker.dark=true;window.dispatchEvent(new Event('theme'))});
    await page.screenshot({path:path.join(artifacts,'location-picker-dark.png')});
    await page.getByRole('button',{name:'Close edit suggestion',exact:true}).click();
    await expect(lat).toHaveCount(0);
    await page.setViewportSize({width:320,height:568});
    await page.getByRole('button',{name:'Suggest an edit',exact:true}).click();
    await lat.scrollIntoViewIfNeeded();await expect(lat).toBeVisible();
    await submit.scrollIntoViewIfNeeded();await expect(submit).toBeVisible();
    await page.screenshot({path:path.join(artifacts,'location-picker-small.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.getByRole('button',{name:'Dismiss edit suggestion',exact:true}).click({position:{x:5,y:5}});
    await expect(lat).toHaveCount(0);
    assert.deepEqual(errors,[]);
    console.log('PASS: actual map drag/pinch, stable center pin, retained zoom, no accidental dismissals, instant coordinate jumps, validation, exact submitted coordinates, small-screen scrolling, light/dark layouts.');
  } finally {await browser.close();}
}
module.exports={buildFixtureBundle,tile};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
