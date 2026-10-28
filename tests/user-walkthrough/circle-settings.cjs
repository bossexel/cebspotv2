// Actual settings component with synthetic services. All network requests are
// intercepted; this checks browser interactions, not native-device GPS.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const esbuild = require(path.join(root, '.codex-tmp/user-walkthrough-tools/node_modules/esbuild'));
const artifacts = path.join(root, '.codex-tmp/circle-settings-review');
const nativeWeb = require.resolve('react-native-web');
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Pressable,Text,View} from 'react-native';
import {CircleSettingsSheet} from './src/components/CircleSettingsSheet';
window.__circle = {sharing:{enabled:false,generation:null},confirmed:null,reads:0,writes:0,enables:0,left:0,alerts:[],
  failRead:location.search.includes('unavailable'),failSave:false,dark:false};
function App(){
  const [visible,setVisible]=React.useState(false);
  return <View style={{flex:1,padding:20}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Circle settings" onPress={()=>setVisible(true)}><Text>Circle settings</Text></Pressable>
    <CircleSettingsSheet circleId="circle-fixture" circleName="Weekend Explorers" visible={visible} onClose={()=>setVisible(false)}
      onSharingChanged={state=>{window.__circle.confirmed=state}}
      onEnabled={()=>{window.__circle.enables++}}
      onLeft={()=>{window.__circle.left++;setVisible(false)}} />
  </View>;
}
createRoot(document.getElementById('root')).render(<App/>);`;

function adapter(name) {
  if (name === 'react-native-svg') return `import React from 'react';
    const shape=tag=>React.forwardRef(({children,...props},ref)=>React.createElement(tag,{...props,ref},children));
    export const Svg=shape('svg'),Path=shape('path'),Circle=shape('circle'),Line=shape('line'),Polyline=shape('polyline'),Polygon=shape('polygon'),Rect=shape('rect'),G=shape('g'),Ellipse=shape('ellipse'),Defs=shape('defs'),ClipPath=shape('clipPath');export default Svg;`;
  if (name === 'react-native') return `export * from ${JSON.stringify(nativeWeb)};
    export const Alert={alert:(...args)=>{window.__circle.alerts.push(args)}};`;
  if (name.endsWith('/hooks/useAuth')) return `export const useAuth=()=>({user:{id:'fixture-user'}});`;
  if (name.endsWith('/hooks/useTheme')) return `import React from 'react';
    import {colors,darkColors} from ${JSON.stringify(path.join(root,'src/constants/colors.ts'))};
    export const useTheme=()=>{const dark=React.useSyncExternalStore(fn=>{window.addEventListener('theme',fn);return()=>window.removeEventListener('theme',fn)},()=>window.__circle.dark);return {appColors:dark?darkColors:colors}};`;
  if (name.endsWith('/services/circleService')) return `export const circleService={
    getLocationSharing:async()=>{const f=window.__circle;f.reads++;if(f.failRead)throw Error('Synthetic outage');return {...f.sharing}},
    setLocationSharing:async enabled=>{const f=window.__circle;f.writes++;f.sharing={enabled,generation:'generation-'+f.writes};if(f.failSave)throw Error('Synthetic lost response');return {...f.sharing}},
    leaveCircle:async()=>{window.__circle.sharing={enabled:false,generation:null}}
  };`;
  throw Error('Unexpected adapter ' + name);
}

async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  const bundle = (await esbuild.build({ stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,
    format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
    plugins:[{name:'circle-settings-fixtures',setup(build){
      build.onResolve({filter:/^(react-native|react-native-svg)$|\/(hooks\/(useAuth|useTheme)|services\/circleService)$/}, args=>({path:args.path,namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'}, args=>({contents:adapter(args.path),loader:'tsx',resolveDir:root}));
    }}] })).outputFiles[0].text;
  const html = '<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="/bundle.js"></script></html>';
  const browser = await chromium.launch({channel:process.env.MAP_TEST_CHANNEL || 'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
    async function capture(name) {
      // Let the native-web sheet and switch animations settle for artifacts.
      await page.waitForTimeout(350);
      await page.screenshot({path:path.join(artifacts,name),animations:'disabled'});
    }
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.route('**/*', route=>{
      const url = new URL(route.request().url());
      if(url.hostname!=='circle.test')return route.abort();
      return route.fulfill({contentType:url.pathname==='/bundle.js'?'application/javascript':'text/html',body:url.pathname==='/bundle.js'?bundle:html});
    });
    await page.goto('https://circle.test');
    await expect(page.getByText('Privacy',{exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Open Circle settings'}).click();
    await expect(page.getByText('Sharing off',{exact:true})).toBeVisible();
    const toggle=page.getByRole('switch',{name:'Share location with my circles'});
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(page.getByText('Sharing on',{exact:true})).toBeVisible();
    await expect(toggle).toBeChecked();
    const confirmed=await page.evaluate(()=>window.__circle.confirmed);
    await page.getByRole('button',{name:'Close Circle settings'}).click();
    await expect(page.getByText('Privacy',{exact:true})).toHaveCount(0);
    assert.deepEqual(await page.evaluate(()=>window.__circle.confirmed),confirmed,'closing settings must retain sharing consent');
    await page.getByRole('button',{name:'Open Circle settings'}).click();
    await expect(page.getByText('Sharing on',{exact:true})).toBeVisible();
    assert.equal(await page.evaluate(()=>window.__circle.reads),1);
    await toggle.click();
    await expect(page.getByText('Sharing off',{exact:true})).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await capture('circle-settings-light.png');
    await page.evaluate(()=>{window.__circle.dark=true;window.dispatchEvent(new Event('theme'))});
    await capture('circle-settings-dark.png');

    await page.goto('https://circle.test/?unavailable');
    await page.getByRole('button',{name:'Open Circle settings'}).click();
    await expect(page.getByText('Status unavailable',{exact:true})).toBeVisible();
    await expect(page.getByText('Sharing off',{exact:true})).toHaveCount(0);
    await expect(toggle).toBeDisabled();
    await capture('circle-settings-unavailable.png');
    await page.evaluate(()=>{window.__circle.failRead=false});
    await page.getByRole('button',{name:'Check location sharing status again'}).click();
    await expect(page.getByText('Sharing off',{exact:true})).toBeVisible();
    await expect(toggle).toBeEnabled();

    await page.evaluate(()=>{window.__circle.failSave=true});
    await toggle.click();
    await expect(page.getByText('Status unavailable',{exact:true})).toBeVisible();
    await expect(toggle).toBeDisabled();
    await page.getByRole('button',{name:'Check location sharing status again'}).click();
    await expect(page.getByText('Sharing on',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Leave this circle',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__circle.left),0,'leaving needs confirmation');
    await page.evaluate(async()=>{await window.__circle.alerts[0][2].find(button=>button.text==='Leave circle').onPress()});
    await expect(page.getByText('Privacy',{exact:true})).toHaveCount(0);
    assert.equal(await page.evaluate(()=>window.__circle.left),1);
    assert.equal(await page.evaluate(()=>window.__circle.confirmed.enabled),false);
    assert.deepEqual(errors,[]);
    console.log('PASS settings visibility, sharing switch, retained consent, unavailable status, recovery, lost response and leave confirmation');
    console.log('Screenshots: .codex-tmp/circle-settings-review');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
