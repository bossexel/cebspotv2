// Current production export; synthetic API responses and blocked external traffic.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const exportRoot = path.join(root, '.codex-tmp/launch-audit-web');
const out = path.join(__dirname, 'evidence');
const uid = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';
const rid = '33333333-3333-4333-8333-333333333333';
const user = { id: uid, email: 'audit@example.test', aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: { display_name: 'Audit Guest' }, created_at: '2026-01-01T00:00:00Z' };
const profile = { id: uid, email: user.email, role: 'user', first_name: 'Audit', last_name: 'Guest', display_name: 'Audit Guest', points: 0, level: 1, friends: [] };
const tables = [{ tableId: 'T01', capacity: 4, isReserved: false, bookingPolicy: 'online_and_walk_ins' }];
const spot = { id: sid, name: 'Audit Fixture Cafe', category: 'Cafe', categories: ['Cafe'], description: 'Synthetic audit venue.', address: 'Cebu City', latitude: 10.3157, longitude: 123.8854, is_public: true, is_reservable: true, images: [], reservation_type: 'paid', reservation_fee: 150, gcash_amount: 150, payment_required: true, table_inventory: { sunset: tables, prime: tables, late: tables }, created_at: '2026-10-11T00:00:00Z' };
const reservation = { id: rid, user_id: uid, spot_id: sid, spot_name: spot.name, reservation_date: '2026-10-12', reservation_time: '18:00:00', reservation_time_start: '18:00:00', guest_count: 2, guests: 2, table_id: 'T01', slot_id: 'sunset', status: 'pending_payment', payment_status: 'pending', reservation_type: 'paid', payment_required: true, fee: 150, reservation_fee: 150, payment_method: 'paymongo_qrph', guest_name: 'Audit Guest', guest_email: user.email, guest_phone: '09171234567', created_at: '2026-10-11T00:00:00Z' };
const evidence = process.env.AUDIT_CONTINUE_BROWSER === '1'
  ? JSON.parse(fs.readFileSync(path.join(out, 'browser.json'), 'utf8'))
  : { date: '2026-10-11 Asia/Manila', kind: 'production-web-with-synthetic-services', checks: [], network: [] };
async function contextFor(browser, { signedIn = true, width = 390, height = 844, failure = false, delay = 0, missing = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const requests = [];
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const req = route.request(); const url = new URL(req.url());
    if (url.host === 'app.test') {
      const file = path.resolve(exportRoot, '.' + decodeURIComponent(url.pathname));
      if (file !== exportRoot && !file.startsWith(exportRoot + path.sep)) return route.abort();
      const resolved = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(exportRoot, 'index.html');
      return route.fulfill({ path: resolved, contentType: { '.js': 'application/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.css': 'text/css' }[path.extname(resolved)] });
    }
    if (url.hostname.endsWith('supabase.co')) {
      requests.push({ path: url.pathname, method: req.method() });
      if (url.pathname.includes('/token')) {
        if (delay) await new Promise(r => setTimeout(r, delay));
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' }) });
      }
      if (url.pathname.includes('/profiles')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(profile) });
      if (failure) return route.abort('internetdisconnected');
      if (delay) await new Promise(r => setTimeout(r, delay));
      const single = (req.headers().accept || '').includes('object+json');
      let body = [];
      if (url.pathname.endsWith('/spots')) body = missing ? (single ? null : []) : single ? spot : [spot];
      if (url.pathname.endsWith('/reservations')) body = missing ? (single ? null : []) : single ? reservation : [reservation];
      if (url.pathname.endsWith('/rpc/get_venue_table_availability')) body = [{ table_id: 'T01', capacity: 4, booking_policy: 'online_and_walk_ins', operational_state: 'free', online_available: true, policy_locked: false, walk_in_visit_id: null, walk_in_party_size: null }];
      if (url.pathname.endsWith('/rpc/check_reservation_slot_available')) body = true;
      if (url.pathname.endsWith('/rpc/get_spot_claim_status')) body = [{ spot_id: sid, spot_name: spot.name, is_claimed: false }];
      if (url.pathname.endsWith('/rpc/get_owner_business_email_status')) body = 'unknown';
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.abort();
  });
  if (signedIn) await context.addInitScript(({ user }) => {
    localStorage.setItem('cebspot-auth-app', JSON.stringify({ access_token: 'audit-fixture-token', refresh_token: 'audit-fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
  }, { user });
  return { context, requests };
}
async function snapshot(page) {
  return page.evaluate(() => ({ path: location.pathname, body: document.body.innerText.slice(0, 1800), scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, inputCount: document.querySelectorAll('input').length }));
}
async function main() {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of process.env.AUDIT_CONTINUE_BROWSER === '1' ? [] : [320, 390, 768, 1440]) {
      const { context } = await contextFor(browser, { width });
      const page = await context.newPage();
      const routes = width === 320 ? ['/', '/profile', '/saved', '/activity', '/reservations', '/circle', '/gamification', '/submit-spot', '/about', '/privacy', '/documentation', `/spot/${sid}`, `/reservation/${sid}`, `/checkout/${sid}`, `/confirmed/${rid}`, '/circle/unknown', '/missing-audit-page'] : ['/', '/profile', `/reservation/${sid}`, `/checkout/${sid}`];
      for (const route of routes) {
        const errors = []; const onError = e => errors.push(e.message); page.on('pageerror', onError);
        const started = performance.now();
        await page.goto('http://app.test' + route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1100);
        const state = await snapshot(page);
        evidence.checks.push({ width, requestedRoute: route, ms: Math.round(performance.now() - started), ...state, errors });
        if (width === 320 && ['/profile', `/reservation/${sid}`, '/missing-audit-page'].includes(route)) await page.screenshot({ path: path.join(out, `web-320-${route.startsWith('/reservation/') ? 'reservation' : route.slice(1)}.png`), fullPage: true });
        page.off('pageerror', onError);
      }
      await context.close();
    }
    {
      const { context, requests } = await contextFor(browser, { signedIn: false });
      const page = await context.newPage(); const dialogs = [];
      page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
      await page.goto('http://app.test/login'); await page.waitForTimeout(700);
      const before = (await snapshot(page)).body;
      await page.getByText('Login', { exact: true }).last().click(); await page.waitForTimeout(200);
      const after = (await snapshot(page)).body;
      evidence.checks.push({ case: 'empty-login-validation', visibleMessage: /Missing details|complete the form/i.test(after), domChanged: before !== after, dialogs });
      const inputs = page.locator('input');
      await inputs.nth(0).fill('audit@example.test'); await inputs.nth(1).fill('wrong-password');
      await page.getByText('Login', { exact: true }).last().click(); await page.waitForTimeout(900);
      const failed = await snapshot(page);
      evidence.checks.push({ case: 'invalid-login-response', tokenRequests: requests.filter(r => r.path.endsWith('/token')).length, visibleError: /Authentication failed|Invalid login credentials/i.test(failed.body), dialogs: dialogs.length, body: failed.body });
      await page.goto('http://app.test/privacy'); await page.waitForTimeout(500);
      evidence.checks.push({ case: 'anonymous-privacy-link', ...(await snapshot(page)) });
      for (const route of ['/owner-dashboard', '/admin', '/owner-access', '/reset-password', '/auth/callback']) {
        await page.goto('http://app.test' + route); await page.waitForTimeout(700);
        evidence.checks.push({ case: 'public-gate', requestedRoute: route, ...(await snapshot(page)) });
      }
      await context.close();
    }
    for (const mode of ['offline', 'slow']) {
      const { context } = await contextFor(browser, { failure: mode === 'offline', delay: mode === 'slow' ? 4000 : 0 });
      const page = await context.newPage();
      await page.goto('http://app.test/'); await page.waitForTimeout(1200);
      evidence.network.push({ mode, stage: '1.2-seconds', ...(await snapshot(page)) });
      await page.waitForTimeout(4200);
      evidence.network.push({ mode, stage: '5.4-seconds', ...(await snapshot(page)) });
      await page.screenshot({ path: path.join(out, `web-${mode}.png`) });
      await context.close();
    }
    {
      const { context } = await contextFor(browser, { missing: true }); const page = await context.newPage();
      for (const route of [`/spot/${sid}`, `/reservation/${sid}`, `/confirmed/${rid}`]) {
        await page.goto('http://app.test' + route); await page.waitForTimeout(900);
        evidence.checks.push({ case: 'missing-record', requestedRoute: route, ...(await snapshot(page)) });
      }
      await context.close();
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(evidence, null, 2)); }
  console.log(JSON.stringify({ checks: evidence.checks.length, overflows: evidence.checks.filter(x => x.scrollWidth > x.viewport), pageErrors: evidence.checks.filter(x => x.errors?.length), validation: evidence.checks.filter(x => x.case?.includes('login')), networkCases: evidence.network.length }, null, 2));
}
module.exports = { contextFor, snapshot, uid, sid, rid };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
