# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: runtime.spec.cjs >> selection travels through intermediate positions, reuses pins and does not wait for tiles
- Location: tests\map\runtime.spec.cjs:125:1

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 10.331
Received:   10.33100536729993
```

# Page snapshot

```yaml
- generic "Explore nearby places" [ref=e2]:
  - generic:
    - generic:
      - button "Coffee A" [ref=e4] [cursor=pointer]
      - button "Garden B" [pressed] [ref=e9] [cursor=pointer]
      - button "Dining C" [ref=e14] [cursor=pointer]
  - generic: © OpenStreetMap contributors
```

# Test source

```ts
  32  |     window.__messages = [];
  33  |     window.ReactNativeWebView = { postMessage: function (data) { window.__messages.push(data === 'ready' ? data : JSON.parse(data)); } };
  34  |     var originalMapFactory = L.map;
  35  |     L.map = function () { window.__map = originalMapFactory.apply(L, arguments); return window.__map; };
  36  |   </script><script>`;
  37  |   await page.setContent(html.replace('</script><script>', instrument));
  38  |   await page.evaluate((payload) => { window.__payload = payload; window.cebspotMapUpdate(payload); }, initial);
  39  |   await expect(page.locator('.spot-marker')).toHaveCount(3);
  40  |   return { requests, errors };
  41  | }
  42  | 
  43  | async function select(page, id, transitionKey, overrides = {}) {
  44  |   await page.evaluate(({ id, transitionKey, overrides }) => {
  45  |     const spot = window.__payload.markers.find((item) => item.id === id);
  46  |     window.__payload = { ...window.__payload, center: { latitude: spot.latitude, longitude: spot.longitude },
  47  |       transitionKey, markers: window.__payload.markers.map((item) => ({ ...item, selected: item.id === id })), ...overrides };
  48  |     window.cebspotMapUpdate(window.__payload);
  49  |   }, { id, transitionKey, overrides });
  50  | }
  51  | 
  52  | async function drag(page, dx, dy, release = true) {
  53  |   await page.mouse.move(170, 400);
  54  |   await page.mouse.down();
  55  |   for (let i = 1; i <= 12; i++) {
  56  |     await page.mouse.move(170 + dx * i / 12, 400 + dy * i / 12);
  57  |     await page.waitForTimeout(18);
  58  |   }
  59  |   if (release) await page.mouse.up();
  60  | }
  61  | 
  62  | test('camera updates while the screen is hidden resume without invalid coordinates', async ({ page }) => {
  63  |   const { errors } = await setup(page);
  64  |   await page.evaluate(() => {
  65  |     document.getElementById('map').style.display = 'none';
  66  |     window.__map.invalidateSize({ pan: false });
  67  |   });
  68  |   await select(page, 'c', 1, { zoom: 17 });
  69  |   await page.waitForTimeout(100);
  70  |   await page.evaluate(() => { document.getElementById('map').style.display = ''; });
  71  |   await page.waitForTimeout(300);
  72  |   const center = await page.evaluate(() => window.__map.getCenter());
  73  |   expect(Number.isFinite(center.lat) && Number.isFinite(center.lng)).toBe(true);
  74  |   expect(center.lat).toBeCloseTo(initial.markers[2].latitude, 5);
  75  |   expect(center.lng).toBeCloseTo(initial.markers[2].longitude, 5);
  76  |   expect(errors).toEqual([]);
  77  | });
  78  | 
  79  | test('viewport tiles stay mounted across marker updates; no extra network requests', async ({ page }) => {
  80  |   const { requests, errors } = await setup(page);
  81  |   await expect(page.locator('.leaflet-tile-loaded')).not.toHaveCount(0);
  82  |   await page.waitForTimeout(300);
  83  |   const count = requests.length;
  84  |   expect(count).toBeLessThanOrEqual(15); // Old 2-tile eager buffer requested roughly 48–56.
  85  |   await page.evaluate(() => {
  86  |     window.__firstTile = document.querySelector('.leaflet-tile');
  87  |     window.__firstMarker = document.querySelector('.spot-marker');
  88  |     window.cebspotMapUpdate({ ...window.__payload, markers: window.__payload.markers.map((item) => ({ ...item, selected: item.id === 'b' })) });
  89  |   });
  90  |   expect(await page.evaluate(() => window.__firstTile === document.querySelector('.leaflet-tile'))).toBe(true);
  91  |   expect(await page.evaluate(() => window.__firstMarker === document.querySelector('.spot-marker'))).toBe(true);
  92  |   expect(requests).toHaveLength(count);
  93  |   expect(errors).toEqual([]);
  94  | });
  95  | 
  96  | test('drag loads exposed tiles before release and preserves momentum', async ({ page }) => {
  97  |   const { requests, errors } = await setup(page);
  98  |   await page.waitForTimeout(300);
  99  |   const count = requests.length;
  100 |   await drag(page, 0, -340, false);
  101 |   expect(requests.length).toBeGreaterThan(count);
  102 |   await page.mouse.up();
  103 |   // Dispatch a timed flick inside the browser. Protocol/trace round trips between
  104 |   // pointer moves can exceed Leaflet's 50ms velocity window on a busy CI host.
  105 |   await page.evaluate(async () => {
  106 |     const container = document.getElementById('map');
  107 |     window.__map.once('dragend', () => { window.__releaseLat = window.__map.getCenter().lat; });
  108 |     const mouse = (type, y) => container.dispatchEvent(new MouseEvent(type, {
  109 |       bubbles: true, cancelable: true, view: window, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: 170, clientY: y,
  110 |     }));
  111 |     mouse('mousedown', 400);
  112 |     for (let y = 390; y >= 250; y -= 10) {
  113 |       mouse('mousemove', y);
  114 |       await new Promise(requestAnimationFrame);
  115 |     }
  116 |     mouse('mouseup', 250);
  117 |   });
  118 |   await page.waitForTimeout(650);
  119 |   const positions = await page.evaluate(() => ({ release: window.__releaseLat, settled: window.__map.getCenter().lat }));
  120 |   expect(positions.settled).toBeLessThan(positions.release);
  121 |   expect(await page.evaluate(() => window.__messages.some((item) => item.type === 'viewport'))).toBe(true);
  122 |   expect(errors).toEqual([]);
  123 | });
  124 | 
  125 | test('selection travels through intermediate positions, reuses pins and does not wait for tiles', async ({ page }) => {
  126 |   const { errors } = await setup(page, { delay: 900 });
  127 |   await page.evaluate(() => { window.__oldPin = document.querySelector('[aria-label="Garden B"]'); });
  128 |   await select(page, 'b', 1);
  129 |   await page.waitForTimeout(170);
  130 |   const intermediate = await page.evaluate(() => window.__map.getCenter().lat);
  131 |   expect(intermediate).toBeGreaterThan(initial.center.latitude);
> 132 |   expect(intermediate).toBeLessThan(initial.markers[1].latitude);
      |                        ^ Error: expect(received).toBeLessThan(expected)
  133 |   expect(await page.evaluate(() => window.__oldPin === document.querySelector('[aria-label="Garden B"]'))).toBe(true);
  134 |   await expect(page.locator('[aria-label="Garden B"]')).toHaveAttribute('aria-pressed', 'true');
  135 |   // Leaflet pans to whole screen pixels. Check within one pixel, not subpixel metres.
  136 |   await expect.poll(() => page.evaluate(() => window.__map.project(window.__map.getCenter()).distanceTo(window.__map.project([10.3310, 123.9070])))).toBeLessThan(1);
  137 |   expect(await page.evaluate(() => window.__messages.filter((item) => item.type === 'viewport'))).toEqual([]);
  138 |   expect(errors).toEqual([]);
  139 | });
  140 | 
  141 | test('rapid selections cancel earlier flights and a touch interrupts the camera', async ({ page }) => {
  142 |   const { errors } = await setup(page);
  143 |   await select(page, 'b', 1);
  144 |   await page.waitForTimeout(100);
  145 |   await select(page, 'c', 2);
  146 |   await page.waitForTimeout(100);
  147 |   await select(page, 'a', 3);
  148 |   await expect.poll(() => page.evaluate(() => window.__map.project(window.__map.getCenter()).distanceTo(window.__map.project([10.3298, 123.9054])))).toBeLessThan(1);
  149 |   await select(page, 'c', 4);
  150 |   await page.waitForTimeout(160);
  151 |   await page.mouse.move(70, 300);
  152 |   await page.mouse.down();
  153 |   const stopped = await page.evaluate(() => window.__map.getCenter().lat);
  154 |   await page.waitForTimeout(900);
  155 |   expect(await page.evaluate(() => window.__map.getCenter().lat)).toBeCloseTo(stopped, 7);
  156 |   await page.mouse.up();
  157 |   expect(errors).toEqual([]);
  158 | });
  159 | 
  160 | test('gesture echoes and unrelated marker updates preserve the user viewport', async ({ page }) => {
  161 |   const { errors } = await setup(page);
  162 |   await drag(page, 0, -220);
  163 |   await page.waitForTimeout(650);
  164 |   const before = await page.evaluate(() => [window.__map.getCenter().lat, window.__map.getCenter().lng, window.__map.getZoom()]);
  165 |   await page.evaluate(() => {
  166 |     const viewport = window.__messages.filter((item) => item.type === 'viewport').at(-1);
  167 |     window.__payload = { ...window.__payload, center: viewport.center, zoom: viewport.zoom };
  168 |     window.cebspotMapUpdate(window.__payload);
  169 |     window.cebspotMapUpdate({ ...window.__payload, markers: window.__payload.markers.slice(0, 2) });
  170 |   });
  171 |   await page.waitForTimeout(250);
  172 |   expect(await page.evaluate(() => [window.__map.getCenter().lat, window.__map.getCenter().lng, window.__map.getZoom()])).toEqual(before);
  173 |   expect(errors).toEqual([]);
  174 | });
  175 | 
  176 | test('pin clicks and coordinate picking emit the expected callbacks', async ({ page }) => {
  177 |   await setup(page);
  178 |   await page.locator('[aria-label="Garden B"]').click();
  179 |   expect(await page.evaluate(() => window.__messages.some((item) => item.type === 'markerPress' && item.id === 'b'))).toBe(true);
  180 |   expect(await page.evaluate(() => window.__messages.filter((item) => item.type === 'coordinatePress'))).toHaveLength(0);
  181 |   await page.mouse.click(40, 400);
  182 |   expect(await page.evaluate(() => window.__messages.some((item) => item.type === 'coordinatePress' && Number.isFinite(item.center.latitude)))).toBe(true);
  183 | });
  184 | 
  185 | test('provider failure tries fallback once and reports complete failure without looping', async ({ page }) => {
  186 |   const { requests, errors } = await setup(page, { failPrimary: true, failFallback: true });
  187 |   await expect(page.locator('#tile-error')).toBeVisible();
  188 |   await page.waitForTimeout(300);
  189 |   const count = requests.length;
  190 |   expect(requests.some((url) => url.startsWith('https://fallback.test/'))).toBe(true);
  191 |   expect(new Set(requests).size).toBe(count);
  192 |   await page.waitForTimeout(400);
  193 |   expect(requests.length).toBe(count);
  194 |   await page.locator('#retry').click();
  195 |   await expect.poll(() => requests.length).toBeGreaterThan(count);
  196 |   expect(errors).toEqual([]);
  197 | });
  198 | 
  199 | test('working fallback displays tiles and no failure overlay', async ({ page }) => {
  200 |   const { requests, errors } = await setup(page, { failPrimary: true });
  201 |   await expect(page.locator('.leaflet-tile-loaded')).not.toHaveCount(0);
  202 |   expect(requests.some((url) => url.startsWith('https://fallback.test/'))).toBe(true);
  203 |   await expect(page.locator('#tile-error')).toBeHidden();
  204 |   expect(errors).toEqual([]);
  205 | });
  206 | 
  207 | test('reduced motion, routes, resizing, and untrusted marker text', async ({ page }) => {
  208 |   const { errors } = await setup(page);
  209 |   await select(page, 'b', 1, { reduceMotion: true, routeLine: initial.markers.slice(0, 2) });
  210 |   expect(await page.evaluate(() => window.__map.project(window.__map.getCenter()).distanceTo(window.__map.project([10.3310, 123.9070])))).toBeLessThan(1);
  211 |   await expect(page.locator('body')).toHaveClass('reduce-motion');
  212 |   await expect(page.locator('.leaflet-overlay-pane canvas')).toHaveCount(1);
  213 |   await page.setViewportSize({ width: 780, height: 390 });
  214 |   await expect.poll(() => page.evaluate(() => window.__map.getSize().x)).toBe(780);
  215 |   await page.evaluate(() => window.cebspotMapUpdate({ ...window.__payload, markers: [
  216 |     { id: 'untrusted', latitude: 10.33, longitude: 123.907, label: '<img src=x onerror=alert(1)>', imageUrl: 'javascript:alert(1)' }
  217 |   ] }));
  218 |   await expect(page.locator('.spot-marker')).toHaveCount(1);
  219 |   await expect(page.locator('.spot-marker img')).toHaveCount(0);
  220 |   expect(errors).toEqual([]);
  221 | });
  222 | 
  223 | test('two-finger pinch zoom is continuous and keeps the pin aligned', async ({ page }) => {
  224 |   const { errors } = await setup(page);
  225 |   const client = await page.context().newCDPSession(page);
  226 |   const touch = (type, spread) => client.send('Input.dispatchTouchEvent', {
  227 |     type,
  228 |     touchPoints: type === 'touchEnd' ? [] : [
  229 |       { x: 195 - spread, y: 390, id: 1 }, { x: 195 + spread, y: 390, id: 2 },
  230 |     ],
  231 |   });
  232 |   await touch('touchStart', 40);
```