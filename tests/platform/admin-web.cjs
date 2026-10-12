// Run after npm run build. All backend traffic is intercepted; no real sign-in.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '../..');
const exportRoot = path.resolve(root, process.env.ADMIN_WEB_EXPORT_DIR || 'dist');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' };

async function main() {
  const browser = await chromium.launch({ channel: process.env.MAP_TEST_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'admin.test') {
        const file = path.resolve(exportRoot, `.${decodeURIComponent(url.pathname)}`);
        if (!file.startsWith(exportRoot + path.sep) && file !== exportRoot) return route.abort();
        const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(exportRoot, 'index.html');
        return route.fulfill({ path: target, contentType: types[path.extname(target)] });
      }
      if (url.pathname.includes('/auth/v1/token')) return route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' }),
      });
      if (url.hostname.endsWith('supabase.co')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const route of ['/', '/admin', '/login']) {
      await page.goto(`https://admin.test${route}`);
      await expect(page.getByPlaceholder('Admin email')).toBeVisible({ timeout: 20000 });
      await expect(page).toHaveURL('https://admin.test/admin');
      console.log(`PASS admin login: ${route}`);
    }
    for (const route of ['/owner-dashboard', '/owner-access', '/reservation/test', '/checkout/test', '/profile', '/spot/test', '/submit-spot', '/owner-portal/']) {
      await page.goto(`https://admin.test${route}`);
      await expect(page.getByText('Customers and venue owners use the CebSpot Android app.')).toBeVisible();
      assert.equal(await page.getByPlaceholder('Admin email').count(), 0);
      console.log(`PASS removed customer/owner route: ${route}`);
    }
    const reservationId = '40000000-0000-4000-8000-000000000001';
    await page.goto(`https://admin.test/payment-return.html?reservation=${reservationId}&outcome=success&next=https://attacker.invalid/`);
    await expect(page.getByRole('link', { name: 'Open CebSpot' })).toHaveAttribute('href', `cebspot://confirmed/${reservationId}?paymentReturn=pending`);
    await expect(page.getByText('Payment status is verified by the server.', { exact: false })).toBeVisible();
    await page.goto('https://admin.test/payment-return.html?reservation=javascript%3Aalert(1)');
    await expect(page.getByRole('link', { name: 'Open CebSpot' })).toHaveCount(0);
    await expect(page.getByText('Open CebSpot from your Android home screen to check your reservation.')).toBeVisible();
    console.log('PASS static Android return bridge validates IDs and never treats URL outcome as payment authority');
    await page.goto('https://admin.test/admin');
    await expect(page.getByPlaceholder('Admin email')).toBeVisible();
    async function expectDialog(action, message) {
      const dialog = page.waitForEvent('dialog');
      const click = action();
      const shown = await dialog;
      assert.match(shown.message(), message);
      await shown.dismiss();
      await click;
    }
    await expectDialog(() => page.getByText('Sign In', { exact: true }).click(), /Missing details/);
    await page.getByPlaceholder('Admin email').fill('customer@example.test');
    await page.getByPlaceholder('Password', { exact: true }).fill('TestPassword123');
    await expectDialog(() => page.getByText('Sign In', { exact: true }).click(), /Admin only/);
    await page.getByPlaceholder('Admin email').fill('testadmin6000@gmail.com');
    await expectDialog(() => page.getByText('Sign In', { exact: true }).click(), /Admin login failed/);
    await expect(page.getByText('Sign In', { exact: true })).toBeVisible();
    console.log('PASS visible validation, wrong-account and rejected-credential feedback');
    await page.goto('https://admin.test/reset-password?returnTo=admin');
    await expect(page.getByPlaceholder('Admin email')).toHaveCount(0);
    await expect(page.getByText('Forgot password?', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send verification code' })).toBeVisible();
    await page.getByPlaceholder('you@example.com').fill('customer@example.test');
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await expect(page.getByText('Use the CebSpot admin email. Customers and owners recover access in the Android app.')).toBeVisible();
    await page.getByRole('button', { name: 'Back to login' }).click();
    await expect(page.getByPlaceholder('Admin email')).toBeVisible();
    console.log('PASS admin-only recovery and return to admin login');
    assert.deepEqual(errors, []);
    console.log('PASS no uncaught browser errors; all external traffic intercepted');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
