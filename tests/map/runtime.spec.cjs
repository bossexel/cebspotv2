const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const generated = fs.readFileSync(path.resolve(__dirname, '../../src/components/map/mapDocument.generated.ts'), 'utf8');
const html = JSON.parse(generated.slice(generated.indexOf('export const mapHtml = ') + 23).trim().replace(/;$/, ''));
const fixtureTile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9efdf"/><path d="M0 100H256M80 0V256" stroke="white" stroke-width="12"/></svg>';
const initial = {
  center: { latitude: 10.3298, longitude: 123.9054 }, zoom: 16, transitionKey: 0,
  markers: [
    { id: 'a', latitude: 10.3298, longitude: 123.9054, selected: true, label: 'Coffee A', category: 'coffee' },
    { id: 'b', latitude: 10.3310, longitude: 123.9070, label: 'Garden B', category: 'outdoor' },
    { id: 'c', latitude: 10.3350, longitude: 123.9100, label: 'Dining C', category: 'dining' },
  ],
  routeLine: [], tileUrl: 'https://tiles.test/{z}/{x}/{y}.png', fallbackTileUrl: 'https://fallback.test/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors', showAttribution: true,
  attributionPosition: 'topleft', attributionInset: 76, reduceMotion: false,
};

async function setup(page, { failPrimary = false, failFallback = false, delay = 0 } = {}) {
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Every network request is intercepted; tests never fetch or prefetch public map tiles.
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const failed = url.startsWith('https://tiles.test/') ? failPrimary : failFallback;
    await route.fulfill({ status: failed ? 503 : 200, contentType: 'image/svg+xml', body: failed ? '' : fixtureTile });
  });
  const instrument = `</script><script>
    window.__messages = [];
    window.ReactNativeWebView = { postMessage: function (data) { window.__messages.push(data === 'ready' ? data : JSON.parse(data)); } };
    var originalMapFactory = L.map;
    L.map = function () { window.__map = originalMapFactory.apply(L, arguments); return window.__map; };
  </script><script>`;
  await page.setContent(html.replace('</script><script>', instrument));
  await page.evaluate((payload) => { window.__payload = payload; window.cebspotMapUpdate(payload); }, initial);
  await expect(page.locator('.spot-marker')).toHaveCount(3);
  return { requests, errors };
}

async function select(page, id, transitionKey, overrides = {}) {
  await page.evaluate(({ id, transitionKey, overrides }) => {
    const spot = window.__payload.markers.find((item) => item.id === id);
    window.__payload = { ...window.__payload, center: { latitude: spot.latitude, longitude: spot.longitude },
      transitionKey, markers: window.__payload.markers.map((item) => ({ ...item, selected: item.id === id })), ...overrides };
    window.cebspotMapUpdate(window.__payload);
  }, { id, transitionKey, overrides });
}

async function drag(page, dx, dy, release = true) {
  await page.mouse.move(170, 400);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(170 + dx * i / 12, 400 + dy * i / 12);
    await page.waitForTimeout(18);
  }
  if (release) await page.mouse.up();
}

test('camera updates while the screen is hidden resume without invalid coordinates', async ({ page }) => {
  const { errors } = await setup(page);
  await page.evaluate(() => {
    document.getElementById('map').style.display = 'none';
    window.__map.invalidateSize({ pan: false });
  });
  await select(page, 'c', 1, { zoom: 17 });
  await page.waitForTimeout(100);
  await page.evaluate(() => { document.getElementById('map').style.display = ''; });
  await page.waitForTimeout(300);
  const center = await page.evaluate(() => window.__map.getCenter());
  expect(Number.isFinite(center.lat) && Number.isFinite(center.lng)).toBe(true);
  expect(center.lat).toBeCloseTo(initial.markers[2].latitude, 5);
  expect(center.lng).toBeCloseTo(initial.markers[2].longitude, 5);
  expect(errors).toEqual([]);
});

test('viewport tiles stay mounted across marker updates; no extra network requests', async ({ page }) => {
  const { requests, errors } = await setup(page);
  await expect(page.locator('.leaflet-tile-loaded')).not.toHaveCount(0);
  await page.waitForTimeout(300);
  const count = requests.length;
  expect(count).toBeLessThanOrEqual(15); // Old 2-tile eager buffer requested roughly 48–56.
  await page.evaluate(() => {
    window.__firstTile = document.querySelector('.leaflet-tile');
    window.__firstMarker = document.querySelector('.spot-marker');
    window.cebspotMapUpdate({ ...window.__payload, markers: window.__payload.markers.map((item) => ({ ...item, selected: item.id === 'b' })) });
  });
  expect(await page.evaluate(() => window.__firstTile === document.querySelector('.leaflet-tile'))).toBe(true);
  expect(await page.evaluate(() => window.__firstMarker === document.querySelector('.spot-marker'))).toBe(true);
  expect(requests).toHaveLength(count);
  expect(errors).toEqual([]);
});

test('drag loads exposed tiles before release and preserves momentum', async ({ page }) => {
  const { requests, errors } = await setup(page);
  await page.waitForTimeout(300);
  const count = requests.length;
  await drag(page, 0, -340, false);
  expect(requests.length).toBeGreaterThan(count);
  await page.mouse.up();
  // Dispatch a timed flick inside the browser. Protocol/trace round trips between
  // pointer moves can exceed Leaflet's 50ms velocity window on a busy CI host.
  await page.evaluate(async () => {
    const container = document.getElementById('map');
    window.__map.once('dragend', () => { window.__releaseLat = window.__map.getCenter().lat; });
    const mouse = (type, y) => container.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: 170, clientY: y,
    }));
    mouse('mousedown', 400);
    for (let y = 390; y >= 250; y -= 10) {
      mouse('mousemove', y);
      await new Promise(requestAnimationFrame);
    }
    mouse('mouseup', 250);
  });
  await page.waitForTimeout(650);
  const positions = await page.evaluate(() => ({ release: window.__releaseLat, settled: window.__map.getCenter().lat }));
  expect(positions.settled).toBeLessThan(positions.release);
  expect(await page.evaluate(() => window.__messages.some((item) => item.type === 'viewport'))).toBe(true);
  expect(errors).toEqual([]);
});

test('selection travels through intermediate positions, reuses pins and does not wait for tiles', async ({ page }) => {
  const { errors } = await setup(page, { delay: 900 });
  await page.evaluate(() => { window.__oldPin = document.querySelector('[aria-label="Garden B"]'); });
  await select(page, 'b', 1);
  await page.waitForTimeout(170);
  const intermediate = await page.evaluate(() => window.__map.getCenter().lat);
  expect(intermediate).toBeGreaterThan(initial.center.latitude);
  expect(intermediate).toBeLessThan(initial.markers[1].latitude);
  expect(await page.evaluate(() => window.__oldPin === document.querySelector('[aria-label="Garden B"]'))).toBe(true);
  await expect(page.locator('[aria-label="Garden B"]')).toHaveAttribute('aria-pressed', 'true');
  // Leaflet pans to whole screen pixels. Check within one pixel, not subpixel metres.
  await expect.poll(() => page.evaluate(() => window.__map.project(window.__map.getCenter()).distanceTo(window.__map.project([10.3310, 123.9070])))).toBeLessThan(1);
  expect(await page.evaluate(() => window.__messages.filter((item) => item.type === 'viewport'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('rapid selections cancel earlier flights and a touch interrupts the camera', async ({ page }) => {
  const { errors } = await setup(page);
  await select(page, 'b', 1);
  await page.waitForTimeout(100);
  await select(page, 'c', 2);
  await page.waitForTimeout(100);
  await select(page, 'a', 3);
  await expect.poll(() => page.evaluate(() => window.__map.project(window.__map.getCenter()).distanceTo(window.__map.project([10.3298, 123.9054])))).toBeLessThan(1);
  await select(page, 'c', 4);
  await page.waitForTimeout(160);
  await page.mouse.move(70, 300);
  await page.mouse.down();
  const stopped = await page.evaluate(() => window.__map.getCenter().lat);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__map.getCenter().lat)).toBeCloseTo(stopped, 7);
  await page.mouse.up();
  expect(errors).toEqual([]);
});

test('gesture echoes and unrelated marker updates preserve the user viewport', async ({ page }) => {
  const { errors } = await setup(page);
  await drag(page, 0, -220);
  await page.waitForTimeout(650);
  const before = await page.evaluate(() => [window.__map.getCenter().lat, window.__map.getCenter().lng, window.__map.getZoom()]);
  await page.evaluate(() => {
    const viewport = window.__messages.filter((item) => item.type === 'viewport').at(-1);
    window.__payload = { ...window.__payload, center: viewport.center, zoom: viewport.zoom };
    window.cebspotMapUpdate(window.__payload);
    window.cebspotMapUpdate({ ...window.__payload, markers: window.__payload.markers.slice(0, 2) });
  });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => [window.__map.getCenter().lat, window.__map.getCenter().lng, window.__map.getZoom()])).toEqual(before);
  expect(errors).toEqual([]);
});

test('pin clicks and coordinate picking emit the expected callbacks', async ({ page }) => {
  await setup(page);
  await page.locator('[aria-label="Garden B"]').click();
  expect(await page.evaluate(() => window.__messages.some((item) => item.type === 'markerPress' && item.id === 'b'))).toBe(true);
  expect(await page.evaluate(() => window.__messages.filter((item) => item.type === 'coordinatePress'))).toHaveLength(0);
  await page.mouse.click(40, 400);
  expect(await page.evaluate(() => window.__messages.some((item) => item.type === 'coordinatePress' && Number.isFinite(item.center.latitude)))).toBe(true);
});

test('provider failure tries fallback once and reports complete failure without looping', async ({ page }) => {
  const { requests, errors } = await setup(page, { failPrimary: true, failFallback: true });
  await expect(page.locator('#tile-error')).toBeVisible();
  await page.waitForTimeout(300);
  const count = requests.length;
  expect(requests.some((url) => url.startsWith('https://fallback.test/'))).toBe(true);
  expect(new Set(requests).size).toBe(count);
  await page.waitForTimeout(400);
  expect(requests.length).toBe(count);
  await page.locator('#retry').click();
  await expect.poll(() => requests.length).toBeGreaterThan(count);
  expect(errors).toEqual([]);
});

test('working fallback displays tiles and no failure overlay', async ({ page }) => {
  const { requests, errors } = await setup(page, { failPrimary: true });
  await expect(page.locator('.leaflet-tile-loaded')).not.toHaveCount(0);
  expect(requests.some((url) => url.startsWith('https://fallback.test/'))).toBe(true);
  await expect(page.locator('#tile-error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('reduced motion, routes, resizing, and untrusted marker text', async ({ page }) => {
  const { errors } = await setup(page);
  await select(page, 'b', 1, { reduceMotion: true, routeLine: initial.markers.slice(0, 2) });
  expect(await page.evaluate(() => window.__map.project(window.__map.getCenter()).distanceTo(window.__map.project([10.3310, 123.9070])))).toBeLessThan(1);
  await expect(page.locator('body')).toHaveClass('reduce-motion');
  await expect(page.locator('.leaflet-overlay-pane canvas')).toHaveCount(1);
  await page.setViewportSize({ width: 780, height: 390 });
  await expect.poll(() => page.evaluate(() => window.__map.getSize().x)).toBe(780);
  await page.evaluate(() => window.cebspotMapUpdate({ ...window.__payload, markers: [
    { id: 'untrusted', latitude: 10.33, longitude: 123.907, label: '<img src=x onerror=alert(1)>', imageUrl: 'javascript:alert(1)' }
  ] }));
  await expect(page.locator('.spot-marker')).toHaveCount(1);
  await expect(page.locator('.spot-marker img')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('two-finger pinch zoom is continuous and keeps the pin aligned', async ({ page }) => {
  const { errors } = await setup(page);
  const client = await page.context().newCDPSession(page);
  const touch = (type, spread) => client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [
      { x: 195 - spread, y: 390, id: 1 }, { x: 195 + spread, y: 390, id: 2 },
    ],
  });
  await touch('touchStart', 40);
  for (const spread of [50, 60, 75, 95]) {
    await touch('touchMove', spread);
    await page.waitForTimeout(25);
  }
  const during = await page.evaluate(() => window.__map.getZoom());
  expect(during).toBeGreaterThan(16);
  await touch('touchEnd', 95);
  await expect.poll(() => page.evaluate(() => window.__messages.some((item) => item.type === 'viewport' && item.zoom > 16))).toBe(true);
  const bounds = await page.locator('[aria-label="Coffee A"]').boundingBox();
  expect(Math.abs(bounds.x + bounds.width / 2 - 195)).toBeLessThan(3);
  expect(Math.abs(bounds.y + bounds.height / 2 - 390)).toBeLessThan(3);
  expect(errors).toEqual([]);
});
