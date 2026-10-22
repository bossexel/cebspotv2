const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { checkDocumentation } = require('./documentation.cjs');
const exportRoot = path.resolve(process.env.ABOUT_EXPORT_DIR || '.codex-tmp/technical-docs-export');
const userId = '00000000-0000-4000-8000-000000000001';

async function configure(context, theme) {
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.host === 'app.test') {
      const file = path.resolve(exportRoot, '.' + url.pathname);
      if (!file.startsWith(exportRoot + path.sep)) return route.abort();
      const resolved = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(exportRoot, 'index.html');
      const contentType = { '.js': 'application/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png' }[path.extname(resolved)];
      return route.fulfill({ path: resolved, contentType });
    }
    if (url.hostname.endsWith('supabase.co')) {
      const body = url.pathname.endsWith('/profiles') ? { id: userId, email: 'docs@example.test', role: 'user', display_name: 'Docs Tester', points: 0, level: 1, friends: [] } : [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.abort();
  });
  await context.addInitScript(({ theme, userId }) => {
    const user = { id: userId, email: 'docs@example.test', aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: { display_name: 'Docs Tester' }, created_at: '2026-01-01T00:00:00Z' };
    localStorage.setItem('cebspot-auth-app', JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
    localStorage.setItem('cebspot_theme', theme);
  }, { theme, userId });
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined });
  try {
    for (const width of [320, 1024]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 900 } });
      await configure(context, theme);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://app.test/about');
      const entry = page.getByTestId('about-introduction-card').getByRole('button', { name: 'Technical Documentation', exact: true });
      await entry.scrollIntoViewIfNeeded();
      const aboutScroll = await page.getByTestId('screen-scroll-view').evaluate(node => node.scrollTop);
      await entry.click();
      await expect(page).toHaveURL(url => url.pathname === '/documentation');
      await checkDocumentation(page, width);
      await page.screenshot({ path: `.codex-tmp/technical-overview-${width}-${theme}.png` });
      const overview = page.getByTestId('documentation-overview');
      await overview.evaluate(node => { node.scrollTop = 450; });
      const before = await overview.evaluate(node => node.scrollTop);
      await page.getByRole('tab', { name: 'Features', exact: true }).click();
      await page.getByTestId('documentation-features').evaluate(node => { node.scrollTop = 500; });
      await page.screenshot({ path: `.codex-tmp/technical-features-${width}-${theme}.png` });
      await page.getByRole('tab', { name: 'Overview', exact: true }).click();
      assert.ok(Math.abs(await overview.evaluate(node => node.scrollTop) - before) <= 1, 'Overview retains reading position');
      await page.getByRole('tab', { name: 'Features', exact: true }).click();
      assert.ok(Math.abs(await page.getByTestId('documentation-features').evaluate(node => node.scrollTop) - 500) <= 1, 'Features retains reading position');
      await page.getByRole('button', { name: 'Back to About CebSpot', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/about');
      assert.ok(Math.abs(await page.getByTestId('screen-scroll-view').evaluate(node => node.scrollTop) - aboutScroll) <= 1, 'About retains position');
      await entry.click();
      await page.goBack();
      await expect(page).toHaveURL(url => url.pathname === '/about');
      await context.route('**/*', route => route.abort());
      await entry.click();
      await page.getByRole('tab', { name: 'Architecture', exact: true }).click();
      await expect(page.getByTestId('content-card-integration-specifications')).toHaveCount(1);
      await page.evaluate(() => {
        document.querySelectorAll('[dir="auto"]').forEach(element => {
          element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * 1.5}px`;
          element.style.lineHeight = '1.6';
        });
      });
      const grid = page.getByTestId('content-chips-clients');
      await grid.scrollIntoViewIfNeeded();
      const bounds = await grid.boundingBox();
      for (const chip of await grid.locator(':scope > div').all()) {
        const box = await chip.boundingBox();
        assert.ok(box.x >= bounds.x - 1 && box.x + box.width <= bounds.x + bounds.width + 1, 'Larger chips fit the card');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Larger text has no page overflow');
      await page.screenshot({ path: `.codex-tmp/technical-architecture-${width}-${theme}-large.png` });
      await page.getByRole('tab', { name: 'Features', exact: true }).click();
      await expect(page.getByTestId('content-card-reservations')).toHaveCount(1);
      assert.equal(await page.locator('iframe').count(), 0, 'Documentation has no embedded webpage');
      assert.deepEqual(errors, [], 'No browser runtime errors');
      await context.close();
      console.log(`PASS: ${width}px ${theme}, complete documentation, tabs/state, About/back restoration, wrapping chips, larger text, offline reading`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
