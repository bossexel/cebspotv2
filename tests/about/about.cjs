const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { checkReferencePolicy } = require('./privacy-reference.cjs');
const { checkDocumentation } = require('./documentation.cjs');

// Run after: expo export --platform web --output-dir .codex-tmp/about-export
// Fixtures keep this check independent of live accounts, payments, and venue data.
const exportRoot = path.resolve(process.env.ABOUT_EXPORT_DIR || '.codex-tmp/about-export');
const userId = '00000000-0000-4000-8000-000000000001';
const versionLabel = `CebSpot · Version ${require('../../app.json').expo.version}`;

async function configure(context, theme) {
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.host === 'app.test') {
      const file = path.resolve(exportRoot, '.' + url.pathname);
      if (!file.startsWith(exportRoot + path.sep)) return route.abort();
      const resolved = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(exportRoot, 'index.html');
      const ext = path.extname(resolved);
      const contentType = { '.js': 'application/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png' }[ext];
      return route.fulfill({ path: resolved, contentType });
    }
    if (url.hostname.endsWith('supabase.co')) {
      let body = [];
      if (url.pathname.endsWith('/profiles')) body = { id: userId, email: 'about@example.test', role: 'user', display_name: 'About Tester', points: 0, level: 1, friends: [] };
      if (url.pathname.endsWith('/get_user_gamification_summary')) body = { totalXp: 0, currentLevel: 1, nextLevelXp: 100, achievements: [], recentTransactions: [] };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.abort();
  });
  await context.addInitScript(({ theme, userId }) => {
    const user = { id: userId, email: 'about@example.test', aud: 'authenticated', role: 'authenticated',
      email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: { display_name: 'About Tester' }, created_at: '2026-01-01T00:00:00Z' };
    localStorage.setItem('cebspot-auth-app', JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
    localStorage.setItem('cebspot_theme', theme);
  }, { theme, userId });
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined });
  try {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
      await configure(context, theme);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://app.test/profile');
      await page.getByRole('button', { name: 'About CebSpot', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'About CebSpot', exact: true })).toBeVisible();
      await expect(page.getByTestId('about-update-channel')).toBeVisible();
      await expect(page.getByTestId('about-update-runtime')).toBeVisible();
      await expect(page.getByTestId('about-update-id')).toBeVisible();
      await page.screenshot({ path: `.codex-tmp/about-${theme}-intro.png` });
      const hero = page.getByTestId('about-introduction-card');
      await expect(hero.getByRole('button', { name: 'Technical Documentation', exact: true })).toHaveCount(1);
      await expect(hero.getByRole('button', { name: 'Privacy Policy', exact: true })).toHaveCount(1);
      await hero.getByRole('button', { name: 'Technical Documentation', exact: true }).scrollIntoViewIfNeeded();
      const aboutScroll = await page.locator('[data-testid="screen-scroll-view"]:visible').evaluate(node => node.scrollTop);
      await hero.getByRole('button', { name: 'Technical Documentation', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/documentation');
      await expect(page.getByRole('heading', { name: 'Technical Documentation', exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
      await checkDocumentation(page, 320);
      const overview = page.getByTestId('documentation-overview');
      await overview.evaluate(node => { node.scrollTop = 450; });
      await expect.poll(() => overview.evaluate(node => node.scrollTop)).toBeGreaterThan(400);
      const overviewScroll = await overview.evaluate(node => node.scrollTop);
      await page.getByRole('tab', { name: 'Features', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Discovery and search', exact: true })).toBeVisible();
      await page.getByTestId('documentation-features').evaluate(node => { node.scrollTop = 300; });
      await page.getByRole('tab', { name: 'Architecture', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Architecture Layers', exact: true })).toBeVisible();
      await page.getByRole('tab', { name: 'Overview', exact: true }).click();
      assert.ok(Math.abs(await overview.evaluate(node => node.scrollTop) - overviewScroll) <= 1, 'Overview retains scroll');
      await page.getByRole('tab', { name: 'Features', exact: true }).click();
      assert.ok(Math.abs(await page.getByTestId('documentation-features').evaluate(node => node.scrollTop) - 300) <= 1, 'Features retains scroll');
      await page.screenshot({ path: `.codex-tmp/documentation-${theme}.png` });
      await page.getByRole('button', { name: 'Back to About CebSpot', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/about');
      assert.ok(Math.abs(await page.locator('[data-testid="screen-scroll-view"]:visible').evaluate(node => node.scrollTop) - aboutScroll) <= 1, 'About retains scroll');
      await hero.getByRole('button', { name: 'Privacy Policy', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/privacy');
      await checkReferencePolicy(page, theme, 320);
      await page.getByRole('button', { name: 'Back to About CebSpot', exact: true }).click();
      await expect(page.getByText('Clyde Hans Sadudaquil', { exact: true })).toHaveCount(1);
      await page.getByRole('button', { name: 'Acknowledgments', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Acknowledgments', exact: true })).toHaveAttribute('aria-expanded', 'true');
      const first = page.getByRole('button', { name: 'What is CebSpot?', exact: true });
      const second = page.getByRole('button', { name: 'Which locations does it cover?', exact: true });
      await first.click();
      await expect(first).toHaveAttribute('aria-expanded', 'true');
      await second.click();
      await expect(first).toHaveAttribute('aria-expanded', 'false');
      await expect(second).toHaveAttribute('aria-expanded', 'true');
      await second.click();
      await expect(second).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByText(versionLabel, { exact: true })).toHaveCount(1);
      assert.equal(await page.getByRole('link').count(), 0, 'Missing contacts and policies must not create empty links');
      await page.getByRole('button', { name: 'Suggest or Add a Spot', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/submit-spot');
      await page.goBack();
      await expect(page.getByRole('heading', { name: 'About CebSpot', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Report Incorrect Spot Information', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/');
      await page.goBack();
      await expect(page.getByRole('heading', { name: 'About CebSpot', exact: true })).toBeVisible();
      // Deny all new network access while interacting with the already loaded About content.
      await context.route('**/*', route => route.abort());
      // New native screens remain readable and interactive with all requests blocked.
      await hero.getByRole('button', { name: 'Privacy Policy', exact: true }).click();
      await expect(page.getByTestId('privacy-section-information')).toBeVisible();
      await page.getByRole('textbox', { name: 'Search privacy topics', exact: true }).fill('location');
      await expect(page.getByTestId('privacy-card-information')).toHaveCount(1);
      await page.getByRole('button', { name: 'Clear search', exact: true }).click();
      await page.evaluate(() => {
        document.querySelectorAll('[dir="auto"]').forEach(element => {
          element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * 1.5}px`;
          element.style.lineHeight = '1.6';
        });
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Policy larger text fits');
      await page.getByTestId('privacy-section-contact').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('privacy-section-contact')).toBeVisible();
      await page.screenshot({ path: `.codex-tmp/privacy-${theme}-large.png` });
      await page.getByRole('button', { name: 'Back to About CebSpot', exact: true }).click();
      await hero.getByRole('button', { name: 'Technical Documentation', exact: true }).click();
      await page.getByRole('tab', { name: 'Architecture', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Architecture Layers', exact: true })).toBeVisible();
      await page.evaluate(() => {
        document.querySelectorAll('[dir="auto"]').forEach(element => {
          element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * 1.5}px`;
          element.style.lineHeight = '1.6';
        });
      });
      await page.screenshot({ path: `.codex-tmp/documentation-${theme}-large.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Documentation larger text fits');
      const largeChips = page.getByTestId('content-chips-clients');
      await largeChips.scrollIntoViewIfNeeded();
      const chipBounds = await largeChips.boundingBox();
      for (const chip of await largeChips.locator(':scope > div').all()) {
        const box = await chip.boundingBox();
        assert.ok(box.x >= chipBounds.x - 1 && box.x + box.width <= chipBounds.x + chipBounds.width + 1, 'Enlarged technology chips remain inside the card');
      }
      await page.screenshot({ path: `.codex-tmp/documentation-${theme}-chips-large.png` });
      await page.getByRole('button', { name: 'Back to About CebSpot', exact: true }).click();
      await first.click();
      await expect(first).toHaveAttribute('aria-expanded', 'true');
      // Simulate larger rendered text; OS font scaling still needs native-device testing.
      await page.evaluate(() => {
        document.querySelectorAll('[dir="auto"]').forEach(element => {
          element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * 1.5}px`;
          element.style.lineHeight = '1.6';
        });
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
      await page.getByText('App information', { exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByText(versionLabel, { exact: true })).toBeVisible();
      await page.screenshot({ path: `.codex-tmp/about-${theme}.png` });
      await page.getByRole('button', { name: 'Back to Profile', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/profile');
      await expect(page.getByText('About Tester', { exact: true })).toBeVisible();
      // Returning uses the existing Profile instance; its other actions still navigate.
      for (const [label, route] of [['CebSpot Rewards', 'gamification'], ['Saved Spots', 'saved'], ['Share a Spot', 'submit-spot'], ['Activity', 'activity']]) {
        await page.locator('[data-testid="screen-scroll-view"]:visible').getByText(label, { exact: true }).click();
        await expect(page).toHaveURL(url => url.pathname === `/${route}`);
        await page.goBack();
        await expect(page.getByRole('button', { name: 'About CebSpot', exact: true })).toHaveCount(1);
      }
      assert.deepEqual(errors, [], 'No browser runtime errors');
      await context.close();
      console.log(`PASS: ${theme} phone, About links, documentation state, eleven reference policy cards, independent accordions, full content parity, title/body/empty search, back/scroll restoration, offline/larger text, existing About/Profile actions`);
    }
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
      await configure(context, theme);
      const page = await context.newPage();
      await page.goto('https://app.test/about');
      await page.getByRole('button', { name: 'Technical Documentation', exact: true }).click();
      await checkDocumentation(page, 1024);
      const first = page.getByTestId('content-card-client');
      const second = page.getByTestId('content-card-navigation');
      await first.scrollIntoViewIfNeeded();
      const boxes = [await first.boundingBox(), await second.boundingBox()];
      assert.ok(boxes[1].x > boxes[0].x + boxes[0].width, 'Tablet technologies have two columns');
      assert.ok(Math.abs(boxes[0].y - boxes[1].y) <= 1, 'Tablet technology row aligns');
      await page.screenshot({ path: `.codex-tmp/documentation-tablet-${theme}.png` });
      await page.getByRole('button', { name: 'Back to About CebSpot', exact: true }).click();
      await page.getByRole('button', { name: 'Privacy Policy', exact: true }).click();
      await checkReferencePolicy(page, theme, 1024);
      await context.close();
      console.log(`PASS: ${theme} tablet, technology columns, reference policy panels, service grid, search, and eleven accordions`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
