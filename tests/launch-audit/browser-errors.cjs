const {chromium}=require('@playwright/test');const fs=require('node:fs');const path=require('node:path');
const {contextFor,snapshot}=require('./browser.cjs');
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];
 try{
  const {context:offline}=await contextFor(browser,{failure:true});const p=await offline.newPage();await p.goto('http://app.test/');
  const {context:login,requests}=await contextFor(browser,{signedIn:false,delay:25000});const l=await login.newPage();await l.goto('http://app.test/login');await l.waitForTimeout(400);
  await l.getByPlaceholder('Email',{exact:true}).fill('audit@example.test');await l.getByPlaceholder('Password',{exact:true}).fill('wrong-password');await l.getByText('Login',{exact:true}).last().click();
  await l.waitForTimeout(17000);
  results.push({case:'offline-after-17-seconds',...(await snapshot(p))});
  results.push({case:'login-after-17-seconds',tokenRequests:requests.filter(r=>r.path.endsWith('/token')).length,loginDisabled:await l.getByRole('button',{name:'Login',exact:true}).isDisabled(),...(await snapshot(l))});
  await p.screenshot({path:path.join(__dirname,'evidence/offline-17-seconds.png')});
  await l.waitForTimeout(8500);
  results.push({case:'login-after-delayed-error',...(await snapshot(l))});
  await offline.close();await login.close();
  const {context}=await contextFor(browser,{signedIn:false});const page=await context.newPage();await page.goto('http://app.test/login');await page.waitForTimeout(400);
  await page.getByText('Create a CebSpot account',{exact:true}).click();
  await page.getByPlaceholder('First name',{exact:true}).fill('Audit');await page.getByPlaceholder('Last name',{exact:true}).fill('Guest');
  await page.getByPlaceholder('Email',{exact:true}).fill('not-an-email');await page.getByPlaceholder('Password',{exact:true}).fill('weak');await page.getByPlaceholder('Confirm password',{exact:true}).fill('different');
  await page.getByText('Create Account',{exact:true}).click();await page.waitForTimeout(200);results.push({case:'invalid-signup',...(await snapshot(page))});
  await page.goto('http://app.test/reset-password');await page.waitForTimeout(400);await page.getByRole('button',{name:'Send verification code',exact:false}).click();await page.waitForTimeout(200);results.push({case:'empty-recovery',...(await snapshot(page))});
  await context.close();
 }finally{await browser.close();fs.writeFileSync(path.join(__dirname,'evidence/browser-errors.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify(results,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
