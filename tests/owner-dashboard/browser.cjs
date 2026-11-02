// Run the actual dashboard with isolated services. No accounts, payments, or live
// database writes are used. Set ESBUILD_TEST_PATH to a temporary esbuild package.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const esbuild = require(process.env.ESBUILD_TEST_PATH || 'esbuild');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '.codex-tmp/owner-dashboard-compatibility');
fs.mkdirSync(out, { recursive: true });
const baseline = process.argv.includes('--baseline');
const screen = baseline ? '.codex-tmp/owner-dashboard-before-navbar.tsx' : 'app/owner-dashboard.tsx';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from ${JSON.stringify(path.join(root, screen))};
import {GuestTableChoices} from ${JSON.stringify(path.join(root, 'src/components/GuestTableChoices.tsx'))};
const count = 300;
const tables = Array.from({length:100},(_,i)=>({tableId:'T'+String(i+1).padStart(3,'0'),capacity:6,isReserved:false}));
const fixture={
  spot:{id:'11111111-1111-4111-8111-111111111111',name:'Owner Test Venue',category:'Cafe',address:'Cebu City',is_public:true,is_reservable:true,reservation_fee:250,gcash_amount:250,table_inventory:{sunset:tables,prime:tables,late:tables},images:[],created_at:'2026-10-01T00:00:00Z'},
  reservations:Array.from({length:count},(_,i)=>({id:'reservation-'+i,user_id:'guest-'+i,guest_name:'Guest '+String(i).padStart(3,'0'),guest_email:'guest'+i+'@example.test',guest_phone:'09171234567',spot_name:'Owner Test Venue',reservation_date:'2026-10-12',reservation_time:'21:10:00',guest_count:4,guests:4,table_id:'T001',slot_id:'prime',status:i%5?'confirmed':'pending_payment',payment_required:true,payment_status:i%5?'paid':'pending',payment_method:'paymongo_qrph',reservation_fee:250,fee:250,payment_terms_accepted:true,created_at:'2026-10-11T01:00:00Z'})),
  reviews:Array.from({length:count},(_,i)=>({id:'review-'+i,user_id:'guest-'+i,user_name:'Reviewer '+String(i).padStart(3,'0'),rating:4,comment:'The venue was welcoming and the reservation was easy to arrange. We enjoyed our visit.',created_at:'2026-10-11T01:00:00Z',images:[]})),
  replies:[],
  delay:0,fail:false,requests:0,fontScale:window.__testFontScale||1,insets:window.__testInsets||{top:24,bottom:24,left:0,right:0},
  auth:{profile:{id:'owner-test',role:'owner',email:'owner@example.test',display_name:'Test Owner'},loading:false,signIn:async()=>{},logOut:async()=>{}},
  async request(name){this.requests++;if(this.delay)await new Promise(r=>setTimeout(r,this.delay));if(this.fail)throw Error('Isolated refresh failure');return name==='access'?this.spot.id:this[name];}
};
window.__ownerTest=fixture;
fixture.liveTables=tables.map((t,i)=>({...t,bookingPolicy:i===0?'walk_in_only':'online_and_walk_ins',state:'free',onlineAvailable:i!==0,policyLocked:false,walkInVisitId:null,walkInPartySize:null}));
for(const [i,state] of [[2,'held'],[3,'due'],[4,'occupied'],[5,'cleaning']])Object.assign(fixture.liveTables[i],{state,onlineAvailable:false,policyLocked:true});
fixture.liveTables[6].capacity=1;
fixture.liveFail=false;fixture.mutationFail=false;fixture.mutationDelay=0;
// Keep pending-save assertions independent of browser/CPU speed. The test must
// explicitly release the synthetic response after checking the pending state.
fixture.holdMutation=()=>{fixture.mutationGate=new Promise(resolve=>{fixture.releaseMutation=resolve;});};
fixture.mutate=async()=>{if(fixture.mutationGate){const gate=fixture.mutationGate;fixture.mutationGate=null;await gate;}if(fixture.mutationDelay)await new Promise(r=>setTimeout(r,fixture.mutationDelay));if(fixture.mutationFail)throw Error('Table changed on another device. Refresh live tables.');};
for(const slot of ['sunset','prime','late'])fixture.spot.table_inventory[slot]=fixture.spot.table_inventory[slot].map((t,i)=>({...t,bookingPolicy:i===0?'walk_in_only':'online_and_walk_ins'}));
document.addEventListener('click',()=>{const start=performance.now();window.__paintTiming=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start))));},true);
const root=createRoot(document.getElementById('root'));
window.__renderOwner=()=>root.render(<Dashboard/>);
window.__renderGuest=(loading=false)=>root.render(<GuestTableChoices tables={fixture.liveTables.slice(0,7)} partySize={2} selectedId={null} loading={loading} onSelect={id=>{fixture.selectedTable=id;}}/>);
window.__renderOwner();
`;

function mockModule(id) {
  if (id === 'react-native') return `
    import React from 'react';
    import * as RN from 'react-native-web';
    export * from 'react-native-web';
    export const Linking={openURL:async()=>{}};
    export const Alert={alert:(title,message)=>{window.__ownerTest.alerts=(window.__ownerTest.alerts||[]).concat({title,message});}};
    const scaleStyle=(style)=>{const s=RN.StyleSheet.flatten(style)||{};const f=window.__ownerTest?.fontScale||1;return {...s,fontSize:(s.fontSize||14)*f,...(s.lineHeight?{lineHeight:s.lineHeight*f}:{})};};
    export const Text=React.forwardRef((p,r)=><RN.Text {...p} ref={r} style={scaleStyle(p.style)}/>);
    export const TextInput=React.forwardRef((p,r)=><RN.TextInput {...p} ref={r} style={scaleStyle(p.style)}/>);
    export const useWindowDimensions=()=>({...RN.useWindowDimensions(),fontScale:window.__ownerTest?.fontScale||1});
  `;
  if (id === 'react-native-svg') return `
    import React from 'react';
    const tag=(name)=>React.forwardRef(({children,style,...p},r)=>React.createElement(name,{...p,ref:r,style:Array.isArray(style)?Object.assign({},...style):style},children));
    export const Svg=tag('svg'), Path=tag('path'), Circle=tag('circle'), Rect=tag('rect'), Line=tag('line'), Polyline=tag('polyline'), Polygon=tag('polygon'), Ellipse=tag('ellipse'), G=tag('g'), Defs=tag('defs'), Use=tag('use'), Text=tag('text');
    export default Svg;
  `;
  if (id === 'expo-router') return `export const useRouter=()=>({replace(){},push(){},back(){}});`;
  if (id === 'expo-screen-orientation') return `export const OrientationLock={ALL:0,PORTRAIT_UP:1};export const lockAsync=async()=>{};`;
  if (id === 'expo-image-picker') return `export const requestMediaLibraryPermissionsAsync=async()=>({granted:true});export const launchImageLibraryAsync=async()=>({canceled:true});`;
  if (id === 'react-native-safe-area-context') return `export const useSafeAreaInsets=()=>window.__ownerTest.insets;`;
  if (id.endsWith('/hooks/useAuth')) return `export const useAuth=()=>window.__ownerTest.auth;`;
  if (id.endsWith('/hooks/useTheme')) return `import {colors,darkColors} from ${JSON.stringify(path.join(root,'src/constants/colors.ts'))};export const useTheme=()=>({appColors:window.__testDark?darkColors:colors});`;
  if (id.endsWith('/lib/supabase')) return `export const hasSupabaseConfig=true,supabase={};`;
  if (id.endsWith('/components/ScreenContainer')) return `import React from 'react';import {View} from 'react-native';export const ScreenContainer=({children})=><View style={{flex:1}}>{children}</View>;`;
  if (id.endsWith('/services/ownerAccessService')) return `export const ownerAccessService={getPrimaryManagedSpotId:async()=>window.__ownerTest.request('access')};`;
  if (id.endsWith('/services/spotService')) return `export const spotService={
    getSpotById:async()=>window.__ownerTest.request('spot'),subscribeToSpotById:()=>()=>{},replaceTableInventory:async()=>window.__ownerTest.spot,
    updateReservationSettings:async(id,settings)=>{const f=window.__ownerTest;await f.mutate();f.publishCalls=(f.publishCalls||0)+1;f.spot={...f.spot,reservation_fee:settings.reservationFee,gcash_amount:settings.reservationFee,table_inventory:settings.tableInventory};return f.spot;},
    confirmReservationInventory:async()=>{const f=window.__ownerTest;f.confirmCalls=(f.confirmCalls||0)+1;f.spot={...f.spot,reservation_inventory_verified_at:new Date().toISOString()};return f.spot;},
    setTableBookingPolicy:async(spot,id,policy)=>{const f=window.__ownerTest;await f.mutate();for(const slot of ['sunset','prime','late'])f.spot.table_inventory[slot]=f.spot.table_inventory[slot].map(t=>t.tableId===id?{...t,bookingPolicy:policy}:t);const table=f.liveTables.find(t=>t.tableId===id);table.bookingPolicy=policy;table.onlineAvailable=policy==='online_and_walk_ins'&&table.state==='free';return {...f.spot};}};`;
  if (id.endsWith('/services/venueTableService')) return `
    export const venueTableStateLabels={free:'Free',held:'Held',due:'Due / reserved',occupied:'Occupied',cleaning:'Cleaning',unavailable:'Unavailable'};
    export const venueTableService={
      getAvailability:async()=>{const f=window.__ownerTest;if(f.liveFail)throw Error('Live tables unavailable');return f.liveTables.map(t=>({...t}));},subscribe:(_spot,onChange)=>{window.__ownerTest.refreshTables=onChange;return ()=>{};},
      markReady:async(spot,id)=>{const f=window.__ownerTest;await f.mutate();const t=f.liveTables.find(t=>t.tableId===id);Object.assign(t,{state:'free',policyLocked:false,onlineAvailable:t.bookingPolicy==='online_and_walk_ins'});}
    };
  `;
  if (id.endsWith('/services/reservationService')) return `export const reservationService={
    getSpotReservations:async()=>window.__ownerTest.request('reservations'),
    subscribeToSpotReservations:(_spot,callback)=>{window.__ownerTest.emitReservations=()=>callback(window.__ownerTest.reservations.map(r=>({...r})));return ()=>{};},
    rejectManualPayment:async(id)=>{const f=window.__ownerTest;f.rejectCalls=(f.rejectCalls||0)+1;await f.mutate();const r=f.reservations.find(r=>r.id===id);Object.assign(r,{status:'cancelled',payment_status:'failed',cancellation_reason:'Manual GCash proof could not be verified.'});return {...r};},
    approvePaidReservation:async(id)=>{const f=window.__ownerTest;f.approveCalls=(f.approveCalls||0)+1;await f.mutate();const r=f.reservations.find(r=>r.id===id);Object.assign(r,{status:'confirmed',payment_status:'paid'});return {...r};}
  };`;
  if (id.endsWith('/services/reviewService')) return `export const reviewService={getReviewsForSpot:async()=>window.__ownerTest.request('reviews'),getRepliesForSpot:async()=>window.__ownerTest.request('replies'),createReviewReply:async(input)=>({id:'new-reply',...input,created_at:new Date().toISOString()})};`;
  if (id.endsWith('/services/ownerGalleryService')) return `export const ownerGalleryService={};`;
  if (id.endsWith('/services/paymentProofService')) return `export const paymentProofService={getProofUrl:async()=> 'https://proof.fixture.invalid/synthetic'};`;
  throw Error('Unexpected mocked import: '+id);
}

async function bundle() {
  const result = await esbuild.build({ stdin:{contents:entry,resolveDir:root,loader:'tsx'}, bundle:true, write:false, platform:'browser', format:'iife', jsx:'automatic', define:{__DEV__:'true','process.env':'{}','process.env.NODE_ENV':'"production"'}, loader:{'.png':'dataurl'}, plugins:[{
    name:'isolated-owner-services', setup(build) {
      build.onResolve({filter:/^(react-native|react-native-svg|expo-router|expo-screen-orientation|expo-image-picker|react-native-safe-area-context)$/},args=>({path:args.path,namespace:'owner-mock'}));
      build.onResolve({filter:/\/(services\/(ownerAccessService|spotService|reservationService|reviewService|ownerGalleryService|paymentProofService|venueTableService)|hooks\/(useAuth|useTheme)|lib\/supabase|components\/ScreenContainer)$/},args=>({path:args.path,namespace:'owner-mock'}));
      build.onLoad({filter:/.*/,namespace:'owner-mock'},args=>({contents:mockModule(args.path),loader:'tsx',resolveDir:root}));
    }
  }] });
  return result.outputFiles[0].text;
}

async function main() {
  const js = await bundle();
  console.log('Dashboard bundled; starting isolated browser checks.');
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const results=[];
  const cases=baseline?[{name:'before-vivo-portrait',width:360,height:804}]:[
    {name:'vivo-y29-portrait',width:360,height:804},
    {name:'vivo-y29-landscape',width:804,height:360},
    {name:'xiaomi-pad5-portrait',width:800,height:1280},
    {name:'xiaomi-pad5-landscape',width:1280,height:800},
    {name:'small-window',width:320,height:700},
    {name:'vivo-y29-large-text',width:360,height:804,fontScale:1.4},
    {name:'xiaomi-pad5-large-text',width:800,height:1280,fontScale:1.4},
    {name:'vivo-y29-dark',width:360,height:804,dark:true},
    {name:'xiaomi-pad5-dark',width:800,height:1280,dark:true},
  ];
  try {
    const selectedDevice=process.argv.find(arg=>arg.startsWith('--device='))?.slice('--device='.length);
    if(selectedDevice&&!cases.some(d=>d.name===selectedDevice))throw Error('Unknown isolated device');
    for(const device of cases.filter(d=>!selectedDevice||d.name===selectedDevice)) {
      const page=await browser.newPage({viewport:{width:device.width,height:device.height},deviceScaleFactor:2});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.setDefaultTimeout(15000);
      const html='<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}#root{display:flex;flex-direction:column}*{box-sizing:border-box}</style><div id="root"></div>';
      await page.route('**/*',route=>route.request().url()==='http://owner-dashboard.test/'?route.fulfill({contentType:'text/html',body:html}):route.abort());
      await page.goto('http://owner-dashboard.test/'); // Fully intercepted, with a storage-capable origin.
      await page.evaluate(device=>{window.__testDark=device.dark;window.__testFontScale=device.fontScale;window.__testInsets=device.width>device.height?{top:0,bottom:24,left:28,right:28}:{top:24,bottom:24,left:0,right:0};},device);
      await page.addScriptTag({content:js});
      const role=baseline?'button':'tab';
      try { await page.getByRole(role,{name:'Reservations',exact:true}).waitFor(); }
      catch(error) { console.error({errors,body:await page.locator('body').innerText()});throw error; }
      const cdp=await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      const timings=[];
      const requestsBeforeTabs=await page.evaluate(()=>window.__ownerTest.requests);
      for(const name of ['Reservations','Payments','Reviews','Tables & Pricing','Spot Profile','Overview']) {
        const tab=page.getByRole(role,{name,exact:true});
        await tab.click();
        if(!baseline) {
          try { await page.waitForFunction(label=>document.querySelector(`[data-testid="owner-tab-${label}"]`)?.getAttribute('aria-selected')==='true',name); }
          catch(error){console.error({name,errors,tab:await tab.evaluate(el=>el.outerHTML)});throw error;}
        }
        const listId={'Reservations':'reservations','Payments':'payments','Reviews':'reviews','Tables & Pricing':'tables'}[name];
        if(!baseline&&listId)await page.getByTestId('owner-'+listId+'-list').waitFor({state:'visible'});
        timings.push({tab:name,ms:Math.round(await page.evaluate(()=>window.__paintTiming))});
        if(!baseline) {
          const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
          assert.equal(overflow,false,`${device.name}/${name}: horizontal page overflow`);
          assert.equal(await page.getByRole('tab').count(),6);
          const bounds=await tab.boundingBox();
          assert.ok(bounds.height>=48,`${name}: undersized touch target`);
          const outside=await page.getByTestId('owner-dashboard-body').evaluate(el=>[...el.querySelectorAll('[dir="auto"],input,textarea,button,[role="button"],[role="switch"]')].filter(node=>{const r=node.getBoundingClientRect();return r.width&&r.height&&(r.left < -1 || r.right>innerWidth+1);}).map(node=>node.textContent?.slice(0,60)||node.getAttribute('aria-label')));
          assert.deepEqual(outside,[],`${device.name}/${name}: content outside horizontal bounds`);
          if(name==='Reservations')assert.ok(await page.getByText(/^Guest \d{3}$/).count()<40,'Full reservation history mounted');
          if(name==='Reviews')assert.ok(await page.getByText(/^Reviewer \d{3}$/).count()<40,'Full review history mounted');
          if(name==='Tables & Pricing') {
            await page.getByRole('button',{name:'Increase capacity for T001',exact:true}).click();
            await page.getByText('7 guests maximum',{exact:true}).first().waitFor();
          }
        }
      }
      assert.equal(await page.evaluate(()=>window.__ownerTest.requests),requestsBeforeTabs,'Tab switching unexpectedly fetched backend data');
      if(!baseline) {
        // A slow or failed refresh must not prevent local tab navigation.
        await page.evaluate(()=>{window.__ownerTest.delay=1200;window.__ownerTest.fail=true;});
        await page.getByRole('button',{name:'Owner notifications'}).click();
        await page.getByRole('button',{name:'Owner notifications'}).click();
        assert.equal(await page.evaluate(()=>window.__ownerTest.requests),requestsBeforeTabs+1,'Repeated refresh queued duplicate requests');
        await page.getByRole('tab',{name:'Payments',exact:true}).click();
        await page.getByTestId('owner-payments-list').waitFor({state:'visible'});
        await page.getByRole('alert').filter({hasText:'Refresh failed'}).waitFor();
        await page.getByRole('tab',{name:'Reservations',exact:true}).click();
        await page.getByTestId('owner-reservations-list').waitFor({state:'visible'});
        assert.equal(await page.getByRole('tab').count(),6,'Refresh failure removed navbar');
        await page.evaluate(()=>{window.__ownerTest.delay=0;window.__ownerTest.fail=false;});
        await page.getByRole('button',{name:'Owner notifications'}).click();
        await page.getByRole('alert').filter({hasText:'Refresh failed'}).waitFor({state:'hidden'});
        // Rotate the same mounted dashboard; selected tab must survive.
        await page.setViewportSize({width:device.height,height:device.width});
        await page.waitForTimeout(120);
        assert.equal(await page.getByRole('tab',{name:'Reservations',exact:true}).getAttribute('aria-selected'),'true');
        await page.setViewportSize({width:device.width,height:device.height});
        await page.getByRole('tab',{name:'Tables & Pricing',exact:true}).click();
        await page.getByTestId('owner-tables-list').evaluate(el=>{el.scrollTop=1800;});
        await page.waitForTimeout(200);
        const chrome=await page.getByTestId('owner-dashboard-chrome').boundingBox();
        assert.ok(chrome.y>=0&&chrome.y+chrome.height<device.height,'Navbar moved off screen while scrolling');
        await page.getByTestId('owner-tables-list').evaluate(el=>{el.scrollTop=0;});
        await page.waitForTimeout(200);
        await page.screenshot({path:path.join(out,device.name+'.png')});
        if(device.name==='vivo-y29-portrait') {
          // An old session's pending load must not block the next owner's load.
          const requestsBeforeSwitch=await page.evaluate(()=>window.__ownerTest.requests);
          await page.evaluate(()=>{window.__ownerTest.delay=1200;});
          await page.getByRole('button',{name:'Owner notifications'}).click();
          await page.evaluate(()=>{window.__ownerTest.auth={...window.__ownerTest.auth,profile:{...window.__ownerTest.auth.profile,role:'user'}};window.__renderOwner();});
          await page.getByRole('tab').first().waitFor({state:'hidden'});
          await page.evaluate(()=>{window.__ownerTest.delay=0;window.__ownerTest.auth={...window.__ownerTest.auth,profile:{...window.__ownerTest.auth.profile,id:'owner-next',role:'owner'}};window.__renderOwner();});
          await page.getByRole('tab',{name:'Reservations',exact:true}).waitFor();
          assert.equal(await page.evaluate(()=>window.__ownerTest.requests),requestsBeforeSwitch+6,'New owner did not get an independent load');
          await page.waitForTimeout(1300);
          assert.equal(await page.evaluate(()=>window.__ownerTest.requests),requestsBeforeSwitch+6,'Stale session continued loading venue data');
          assert.equal(await page.getByRole('tab').count(),6,'Stale session load disrupted navigation');
          assert.equal(await page.getByRole('alert').filter({hasText:'Refresh failed'}).count(),0,'Stale session load changed new owner state');
        }
      }
      if(!baseline) {
        // The simplified dashboard exposes table toggles, without a seating section.
        assert.equal(await page.getByRole('tab',{name:'Walk-ins',exact:true}).count(),0);
        assert.equal(await page.getByRole('button',{name:/Seat walk-in/}).count(),0);
        await page.getByRole('tab',{name:'Tables & Pricing',exact:true}).click();
        assert.equal(await page.getByRole('switch',{name:'Allow online reservations for T003',exact:true}).isDisabled(),true);
        const policyButton=page.getByRole('switch',{name:'Allow online reservations for T001',exact:true});
        assert.equal(await policyButton.getAttribute('aria-checked'),'false');
        await page.getByRole('button',{name:'Increase capacity for T001',exact:true}).click();
        const draftCapacity=await page.getByRole('button',{name:'Increase capacity for T001',exact:true}).locator('..').innerText();
        await page.getByRole('textbox',{name:'Reservation price in pesos',exact:true}).fill('300');
        await page.evaluate(()=>{window.__ownerTest.mutationFail=true;window.__ownerTest.holdMutation();});
        await policyButton.click();
        assert.equal(await policyButton.getAttribute('aria-checked'),'false','Toggle changed before backend confirmation');
        assert.equal(await policyButton.isDisabled(),true,'Pending toggle permitted another save');
        assert.equal(await page.getByRole('switch',{name:'Allow online reservations for T002',exact:true}).isDisabled(),true,'Another policy change was allowed during a pending save');
        await page.evaluate(()=>window.__ownerTest.releaseMutation());
        await page.getByRole('alert').filter({hasText:'Table changed on another device'}).waitFor();
        assert.equal(await policyButton.getAttribute('aria-checked'),'false','Failed toggle changed policy');
        await page.evaluate(()=>{window.__ownerTest.mutationFail=false;window.__ownerTest.mutationDelay=0;});
        for(const policy of ['online_and_walk_ins','walk_in_only']) {
          await policyButton.click();
          await page.waitForFunction(policy=>window.__ownerTest.liveTables[0].bookingPolicy===policy,policy);
          await page.getByText(policy==='walk_in_only'?'Table locked for walk-ins.':'Table released for reservations.',{exact:true}).waitFor();
          assert.equal(await policyButton.getAttribute('aria-checked'),String(policy==='online_and_walk_ins'));
          assert.equal(await page.getByRole('textbox',{name:'Reservation price in pesos',exact:true}).inputValue(),'300','Policy save discarded the draft fee');
          assert.equal(await page.getByRole('button',{name:'Increase capacity for T001',exact:true}).locator('..').innerText(),draftCapacity,'Policy save discarded the draft capacity');
        }
        assert.equal(await page.evaluate(()=>window.__ownerTest.spot.reservation_fee),250);
        await page.screenshot({path:path.join(out,device.name+'-table-toggle.png')});
        // Readiness remains available in Tables & Pricing after removing Walk-ins.
        await page.evaluate(()=>{Object.assign(window.__ownerTest.liveTables[0],{state:'cleaning',onlineAvailable:false,policyLocked:true});window.__ownerTest.refreshTables();});
        const readyButton=page.getByRole('button',{name:'Mark T001 ready after cleaning',exact:true});
        await readyButton.waitFor();
        assert.equal(await policyButton.isDisabled(),true,'Cleaning table policy was editable');
        await readyButton.click();
        await page.getByRole('button',{name:'Cancel marking T001 ready',exact:true}).click();
        assert.equal(await page.evaluate(()=>window.__ownerTest.liveTables[0].state),'cleaning','Cancel changed table state');
        await readyButton.click();
        await page.evaluate(()=>{window.__ownerTest.mutationFail=true;window.__ownerTest.holdMutation();});
        const confirmReady=page.getByRole('button',{name:'Confirm T001 is ready',exact:true});
        await confirmReady.click();
        assert.equal(await page.evaluate(()=>window.__ownerTest.liveTables[0].state),'cleaning','Readiness changed before backend confirmation');
        await page.evaluate(()=>window.__ownerTest.releaseMutation());
        await page.getByRole('alert').filter({hasText:'Table changed on another device'}).waitFor();
        assert.equal(await page.evaluate(()=>window.__ownerTest.liveTables[0].state),'cleaning','Failed readiness changed table state');
        await page.evaluate(()=>{window.__ownerTest.mutationFail=false;window.__ownerTest.mutationDelay=0;});
        await confirmReady.click();
        await page.getByText('T001 is ready. Its booking policy still applies.',{exact:true}).waitFor();
        await page.waitForFunction(()=>window.__ownerTest.liveTables[0].state==='free');
        assert.equal(await page.evaluate(()=>window.__ownerTest.liveTables[0].onlineAvailable),false,'Readiness released a walk-in-only table online');
        await page.evaluate(()=>{window.__ownerTest.liveFail=true;});
        await page.getByRole('button',{name:'Refresh live tables',exact:true}).click();
        await page.getByText('Refresh live tables before changing this setting.',{exact:true}).first().waitFor();
        assert.equal(await policyButton.isDisabled(),true,'Unavailable live state allowed a policy change');
        await page.evaluate(()=>{window.__ownerTest.liveFail=false;});
        await page.getByRole('button',{name:'Refresh live tables',exact:true}).click();
        await expect(policyButton).toBeEnabled();
        // Guest controls must keep policy visible even during a refresh.
        for(const loading of [false,true]) {
          await page.evaluate(loading=>window.__renderGuest(loading),loading);
          const walkInTable=page.getByRole('button',{name:'T001, 6 seats, Walk-ins only',exact:true});
          await walkInTable.waitFor();
          assert.equal(await walkInTable.isDisabled(),true);
          assert.equal(await walkInTable.getByText('Walk-ins only',{exact:true}).count(),1);
        }
        await page.evaluate(()=>window.__renderGuest(false));
        await page.getByRole('button',{name:'T002, 6 seats, Available online',exact:true}).click();
        assert.equal(await page.evaluate(()=>window.__ownerTest.selectedTable),'T002');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
      assert.deepEqual(errors,[],`${device.name}: browser errors`);
      results.push({device:device.name,viewport:[device.width,device.height],fontScale:device.fontScale||1,cpuThrottle:4,records:300,timings});
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out,baseline?'before.json':'after.json'),JSON.stringify(results,null,2));
}
module.exports={bundle};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
