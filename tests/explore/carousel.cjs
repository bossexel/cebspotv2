const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Run against a fresh web export. All API, image and map requests stay in fixtures.
const exportRoot = path.resolve('.codex-tmp/map-review/carousel-export');
const artifacts = path.resolve('.codex-tmp/map-review');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e4ead8"/><path d="M0 85H256M130 0V256M0 220H256" stroke="#fff" stroke-width="14"/></svg>';
const spots = Array.from({ length: 6 }, (_, i) => ({
  // Include the app's built-in demo id so it does not inject a seventh spot.
  id: i === 5 ? '66666666-6666-4666-8666-666666666666' : `00000000-0000-4000-8000-00000000000${i + 2}`,
  name: `Map Test Cafe ${i + 1}`, latitude: 10.3298 + i * 0.001, longitude: 123.9054 + i * 0.001,
  address: 'Cebu City',
  category: i === 4 ? 'Nightlife' : i === 5 ? 'Coffee Shop' : 'Specialty Coffee',
  categories: [i === 4 ? 'Nightlife' : i === 5 ? 'Coffee Shop' : 'Specialty Coffee'],
  is_public: true, is_reservable: true, images: ['https://images.test/cafe.svg'], rating: 4.5, review_count: 8,
  created_at: '2026-01-01T00:00:00Z', description: 'Carousel interaction fixture', reservation_fee: 0,
}));

async function configure(context) {
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.host === 'app.test') {
      const file = path.resolve(exportRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(exportRoot + path.sep)) return route.abort();
      const resolved = fs.existsSync(file) ? file : path.join(exportRoot, 'index.html');
      const ext = path.extname(resolved);
      return route.fulfill({ path: resolved, contentType: ext === '.js' ? 'application/javascript' : ext === '.html' ? 'text/html' : ext === '.ttf' ? 'font/ttf' : 'image/png' });
    }
    if (url.hostname.endsWith('supabase.co')) {
      let body = [];
      if (url.pathname.endsWith('/profiles')) body = { id: '00000000-0000-4000-8000-000000000001', email: 'map-test@example.test', role: 'user', display_name: 'Map Test', points: 0, level: 1, friends: [] };
      if (url.pathname.endsWith('/spots')) body = url.searchParams.has('id')
        ? spots.find(spot => 'eq.' + spot.id === url.searchParams.get('id')) : spots;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body ?? null) });
    }
    return route.fulfill({ contentType: 'image/svg+xml', body: tile });
  });
  await context.addInitScript(() => {
    const now = Math.floor(Date.now() / 1000);
    const user = { id: '00000000-0000-4000-8000-000000000001', email: 'map-test@example.test', aud: 'authenticated',
      role: 'authenticated', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: { display_name: 'Map Test' }, created_at: '2026-01-01T00:00:00Z' };
    localStorage.setItem('cebspot-auth-app', JSON.stringify({ access_token: 'test-fixture-token', refresh_token: 'test-fixture-refresh',
      expires_in: 3600, expires_at: now + 3600, token_type: 'bearer', user }));
    localStorage.setItem('cebspot_theme', 'light');
  });
}

async function openExplore(page, bottomInset) {
  await page.goto('https://app.test/');
  await expect(page.getByRole('button', { name: 'Open Map Test Cafe 1', exact: true })).toBeVisible({ timeout: 45000 });
  const map = page.frameLocator('iframe[title="Interactive map of nearby spots"]');
  await expect(map.locator('.spot-marker')).not.toHaveCount(0);
  // Exercise the layout with bottom padding like a native safe-area boundary.
  // This is simulated padding, not a claim of an actual iOS/Android device test.
  await page.getByTestId('screen-safe-area').evaluate((el, inset) => { el.style.paddingBottom = inset + 'px'; }, bottomInset);
  await page.waitForTimeout(250);
  return map;
}

async function checkSpacing(page, spotName, bottomInset) {
  const card = await page.getByRole('button', { name: `Open ${spotName}`, exact: true }).boundingBox();
  const share = await page.getByRole('button', { name: 'Share a new spot', exact: true }).boundingBox();
  const nav = await page.getByTestId('bottom-navigation').boundingBox();
  const gap = share.y - (card.y + card.height);
  assert.ok(gap >= 6 && gap <= 12, `Expected close, non-overlapping carousel/nav gap; got ${gap}px`);
  const bottom = page.viewportSize().height - (nav.y + nav.height);
  assert.ok(Math.abs(bottom - (bottomInset + 12)) <= 1, `Navigation must respect bottom safe area; got ${bottom}px`);
  const boxShadow = await page.getByRole('button', { name: `Open ${spotName}`, exact: true }).evaluate(el => getComputedStyle(el).boxShadow);
  assert.equal(boxShadow, 'none');
  return { gap, bottom, card };
}

async function swipe(page, card) {
  const session = await page.context().newCDPSession(page);
  const x = Math.min(page.viewportSize().width - 35, card.x + card.width - 35);
  const y = card.y + card.height / 2;
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * (x - 35) / 12, y }] });
      await page.waitForTimeout(25);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}

(async () => {
  assert.ok(fs.existsSync(path.join(exportRoot, 'index.html')), 'Create the web export before running this check.');
  const browser = await chromium.launch({ channel: process.env.MAP_TEST_CHANNEL || 'chrome', headless: true });
  try {
    for (const [width, height, bottomInset] of [[360, 640, 0], [390, 844, 24], [430, 932, 34]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 1,
        isMobile: true, permissions: ['geolocation'], geolocation: { latitude: 10.3298, longitude: 123.9054 } });
      await configure(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack, path: new URL(page.url()).pathname }));
      try {
        const map = await openExplore(page, bottomInset);
        const initialPinColor = await map.locator(`.spot-marker[aria-label="${spots[0].name}"] .spot-shell`)
          .evaluate(element => element.style.getPropertyValue('--spot-color').trim().toUpperCase());
        assert.equal(initialPinColor, '#D4A373', 'Explore pin must use its category color');
        const pinSelectedSpot = spots[3];
        await map.locator(`.spot-marker[aria-label="${pinSelectedSpot.name}"]`).tap();
        await expect(map.locator(`.spot-marker[aria-label="${pinSelectedSpot.name}"]`)).toHaveAttribute('aria-pressed', 'true');
        const pinSelectedCard = page.getByRole('button', { name: `Open ${pinSelectedSpot.name}`, exact: true });
        await expect(pinSelectedCard).toBeVisible();
        const pinSelectedCardBox = await pinSelectedCard.boundingBox();
        await page.touchscreen.tap(pinSelectedCardBox.x + 50, pinSelectedCardBox.y + 65);
        await expect(page).toHaveURL(new RegExp('/spot/' + pinSelectedSpot.id));

        await openExplore(page, bottomInset);
        const before = await checkSpacing(page, spots[0].name, bottomInset);
        await page.getByRole('button', { name: 'Add Map Test Cafe 1 to favorites', exact: true }).tap();
        await expect(page.getByRole('button', { name: 'Remove Map Test Cafe 1 from favorites', exact: true })).toBeVisible();
        assert.equal(new URL(page.url()).pathname, '/', 'Favorite must not open the spot');

        await swipe(page, before.card);
        const activePin = map.locator('.spot-marker[aria-pressed="true"][aria-label^="Map Test Cafe"]');
        await expect(activePin).toHaveCount(1);
        await expect(activePin).not.toHaveAttribute('aria-label', spots[0].name);
        await page.waitForTimeout(700);
        const selected = await activePin.getAttribute('aria-label');
        const after = await checkSpacing(page, selected, bottomInset);
        assert.ok(Math.abs(after.card.y - before.card.y) < 1, 'Selection must not move the card vertically');
        await page.getByRole('button', { name: `Open ${selected}`, exact: true }).tap();
        await expect(page).toHaveURL(new RegExp('/spot/' + spots.find(spot => spot.name === selected).id));
        await expect(page.locator('[data-testid="route-line-badge"]:visible svg')).toHaveAttribute('stroke', '#D4A373');

        if (width === 360) {
          const similarHeading = page.getByText('Similar Places', { exact: true });
          await similarHeading.scrollIntoViewIfNeeded();
          await expect(similarHeading).toBeVisible({ timeout: 45000 });
          const similarCards = page.getByRole('button', { name: /^Open similar place / });
          await expect(similarCards).toHaveCount(4);
          await expect(page.getByRole('button', { name: `Open similar place ${selected}`, exact: true })).toHaveCount(0);
          await expect(similarCards.first().locator('svg')).toHaveAttribute('stroke', '#D4A373');
          for (let index = 0; index < await similarCards.count(); index++) {
            await expect(similarCards.nth(index)).toContainText('Coffee');
            await expect(similarCards.nth(index)).not.toContainText('Nightlife');
          }
          await page.screenshot({ path: path.join(artifacts, 'similar-places-360.png') });
          const firstSimilarLabel = await similarCards.first().getAttribute('aria-label');
          const firstSimilarName = firstSimilarLabel.replace('Open similar place ', '');
          await similarCards.first().tap();
          await expect(page).toHaveURL(new RegExp('/spot/' + spots.find(spot => spot.name === firstSimilarName).id));
          const visibleDetailTitle = page.locator('[data-testid="spot-detail-title"]:visible');
          await expect(visibleDetailTitle).toHaveText(firstSimilarName, { timeout: 45000 });
          const visibleDetailScroll = page.locator('[data-testid="screen-scroll-view"]:visible');
          await expect(visibleDetailScroll).toHaveCount(1);
          const detailScrollTop = await visibleDetailScroll.evaluate(element => element.scrollTop);
          assert.ok(detailScrollTop <= 1, `Similar place navigation must open at the top; got scrollTop ${detailScrollTop}`);
          await page.screenshot({ path: path.join(artifacts, 'similar-navigation-top-360.png') });
        }

        if (width === 360) {
          for (const target of ['image', 'title', 'go']) {
            await openExplore(page, bottomInset);
            const button = page.getByRole('button', { name: 'Open Map Test Cafe 1', exact: true });
            if (target === 'image') {
              const card = await button.boundingBox();
              await page.touchscreen.tap(card.x + 50, card.y + 65);
            } else {
              await button.getByText(target === 'title' ? 'Map Test Cafe 1' : 'Go to Spot', { exact: true }).tap();
            }
            await expect(page).toHaveURL(new RegExp('/spot/' + spots[0].id));
          }
        }

        await openExplore(page, bottomInset);
        await page.screenshot({ path: path.join(artifacts, `carousel-${width}.png`) });
        await page.getByTestId('bottom-navigation').getByText('Activity', { exact: true }).tap();
        await expect(page).toHaveURL(/\/activity$/);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ viewport: `${width}x${height}`, simulatedBottomInset: bottomInset,
          carouselToShareGap: after.gap, navigationBottom: after.bottom,
          checks: 'Pin selects card; pin-selected card opens on first tap; swipe selects pin; immediate card tap opens; image/title/Go open; favorite isolated; navigation tappable; stable card height; no shadow; no page errors' }));
      } catch (error) {
        await page.screenshot({ path: path.join(artifacts, `carousel-failure-${width}.png`) }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
