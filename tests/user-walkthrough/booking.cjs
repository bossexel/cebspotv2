const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const out=path.resolve(__dirname,'../../.codex-tmp',process.env.USER_WALKTHROUGH_RUN||'user-walkthrough-2026-10-24');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:360,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.context().routeWebSocket('**/*',socket=>socket.close());
  await page.route('**/*',r=>r.request().url()==='http://walkthrough.test/'?r.fulfill({contentType:'text/html',body:'<style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style><div id="root"></div>'}):r.abort());
  await page.goto('http://walkthrough.test/');await page.addScriptTag({content:fs.readFileSync(path.join(out,'screens.js'),'utf8')});
  await page.evaluate(()=>window.__walk.go('/reservation/66666666-6666-4666-8666-666666666666'));
  const available=page.getByRole('button',{name:'Cocktail Table 1, 4 seats, Available online',exact:true});
  const walkin=page.getByRole('button',{name:'Cocktail Table 2, 2 seats, Walk-ins only',exact:true});
  await available.waitFor();assert.equal(await walkin.isDisabled(),true);
  await available.click();await page.waitForTimeout(150);
  const selected=await available.getAttribute('aria-selected');
  fs.writeFileSync(path.join(out,'booking-selection-debug.json'),JSON.stringify({selected,html:await available.evaluate(n=>n.outerHTML),text:await page.locator('body').innerText(),errors},null,2));
  await page.screenshot({path:path.join(out,'booking-table-selection.png')});
  const body=await page.locator('body').innerText();
  assert.match(body,/SELECTED TABLE\s+Cocktail Table 1/);
  assert.match(body,/SELECTION TIMER/);
  assert.match(body,/08:00 PM - Table for 2 - Cocktail Table 1/);
  const calls=await page.evaluate(()=>window.__walk.calls);assert.equal(calls.some(c=>/createReservation|create.*Checkout|submit|upload/i.test(c.method)),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'booking-table-selection.png')});
  fs.writeFileSync(path.join(out,'booking-selection.json'),JSON.stringify({kind:'actual-booking-screen-synthetic-service-interaction',availableTableSelected:true,walkInOnlyDisabled:true,bookingOrPaymentSubmitted:false,pageErrors:errors,limitation:'No native APK, deployed availability RPC, booking transaction or payment provider acceptance.'},null,2));
  console.log('PASS: available table selected; walk-in-only table disabled; no booking/payment submitted.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
