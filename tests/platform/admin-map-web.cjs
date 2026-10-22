// Run after npm run build. Uses a synthetic admin session and intercepted data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '../..');
const exportRoot = path.resolve(root, process.env.ADMIN_WEB_EXPORT_DIR || 'dist');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' };
const adminId = '90000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();
const profile = {
  id: adminId,
  email: 'testadmin6000@gmail.com',
  display_name: 'Map Test Admin',
  role: 'admin',
  location: null,
  photo_url: null,
  created_at: now,
};
const spots = [
  {
    id: '90000000-0000-4000-8000-000000000101', name: 'Carbon Coffee Lab', description: 'Coffee test spot',
    category: 'Cafe', categories: ['Specialty Coffee'], address: 'Barangay Ermita, Cebu City',
    latitude: 10.292, longitude: 123.899, rating: 4.7, review_count: 22, is_public: true, is_reservable: false,
  },
  {
    id: '90000000-0000-4000-8000-000000000102', name: 'Lahug Coffee Room', description: 'Second coffee test spot',
    category: 'Cafe', categories: ['Co-working'], address: 'Barangay Lahug, Cebu City',
    latitude: 10.334, longitude: 123.904, rating: 4.5, review_count: 11, is_public: true, is_reservable: true,
  },
  {
    id: '90000000-0000-4000-8000-000000000103', name: 'Mango Night Club', description: 'Club test spot',
    category: 'Club', categories: ['Nightlife'], address: 'Barangay Kamputhaw, Cebu City',
    latitude: 10.311, longitude: 123.899, rating: 4.4, review_count: 18, is_public: true, is_reservable: true,
  },
];
const pendingSubmission = {
  id: '90000000-0000-4000-8000-000000000301',
  name: 'Sandbox Dessert House',
  category: 'Dessert',
  categories: ['Cafe'],
  barangay: 'Lahug',
  address: 'Barangay Lahug, Cebu City',
  latitude: 10.333,
  longitude: 123.905,
  submitted: 'Oct 22, 2026',
  createdAt: now,
  status: 'Pending',
  image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  images: [],
  voteCount: 3,
  searchCount: 2,
  similarSubmissionCount: 0,
  popularityScore: 5,
  description: 'Pending submission used to verify the admin delete workflow.',
  reservationType: 'free',
  reservationFee: 0,
  paymentRequired: false,
  isReservable: false,
  submitterId: adminId,
  submitterName: profile.display_name,
  submitterEmail: profile.email,
};
const dashboard = {
  generatedAt: now,
  metrics: { totalSpots: 3, publicSpots: 3, reservableSpots: 2, spotsToday: 0, totalReservations: 0, reservationsToday: 0, reservations30d: 0, confirmedReservations: 0, estimatedRevenue: 0, activeOwners: 0, totalUsers: 1, reportsFiled: 0, pendingOwnerRequests: 0, pendingSpotSubmissions: 1 },
  reservationsDaily: [], newSpotsDaily: [], dailyInsights: [],
  categories: [
    { label: 'Cafe', value: 100, copy: '8 spots' },
    { label: 'Restaurant', value: 88, copy: '7 spots' },
    { label: 'Outdoor', value: 75, copy: '6 spots' },
    { label: 'Club', value: 63, copy: '5 spots' },
    { label: 'Street Food', value: 50, copy: '4 spots' },
    { label: 'Dessert', value: 38, copy: '3 spots' },
    { label: 'Co-working', value: 25, copy: '2 spots' },
  ],
  barangays: [{ label: 'Lahug', value: 100, copy: '1 spot' }],
  recentListings: [], livePulse: [], reports: [], users: [profile], ownerRequests: [], pendingSubmissions: [pendingSubmission],
};
const categorySpots = dashboard.categories.map((item, index) => ({
  id: `90000000-0000-4000-8000-0000000002${String(index + 1).padStart(2, '0')}`,
  category: item.label,
  categories: [],
}));

function tokenFor(user) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: user.id, email: user.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
}

async function main() {
  let submissionDeleted = false;
  const browser = await chromium.launch({ channel: process.env.MAP_TEST_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const user = {
      id: adminId, aud: 'authenticated', role: 'authenticated', email: profile.email,
      email_confirmed_at: now, confirmed_at: now, created_at: now, updated_at: now,
      app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: profile.display_name }, identities: [],
    };
    const accessToken = tokenFor(user);
    await context.addInitScript(({ session }) => {
      window.localStorage.setItem('cebspot-auth-admin', JSON.stringify(session));
    }, {
      session: { access_token: accessToken, refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user },
    });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === 'admin.test') {
        const file = path.resolve(exportRoot, `.${decodeURIComponent(url.pathname)}`);
        if (!file.startsWith(exportRoot + path.sep) && file !== exportRoot) return route.abort();
        const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(exportRoot, 'index.html');
        return route.fulfill({ path: target, contentType: types[path.extname(target)] });
      }
      if (!url.hostname.endsWith('supabase.co')) return route.abort();
      if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      if (url.pathname.includes('/rest/v1/rpc/delete_admin_spot_submission')) {
        submissionDeleted = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: pendingSubmission.id, deleted: true }) });
      }
      if (url.pathname.includes('/rest/v1/rpc/get_admin_dashboard')) {
        const payload = submissionDeleted
          ? { ...dashboard, metrics: { ...dashboard.metrics, pendingSpotSubmissions: 0 }, pendingSubmissions: [] }
          : dashboard;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
      }
      if (url.pathname.includes('/rest/v1/pending_spot_submission_popularity')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (url.pathname.includes('/rest/v1/profiles')) {
        const single = request.headers().accept?.includes('application/vnd.pgrst.object');
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify(single ? profile : [profile]) });
      }
      if (url.pathname.includes('/rest/v1/spots')) {
        const body = url.searchParams.get('select') === 'id,category,categories' ? categorySpots : spots;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('https://admin.test/admin');
    await expect(page.getByText('Insights', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Dessert', { exact: true })).toHaveCount(0);
    await page.getByLabel('Open category ranking overview').click();
    await expect(page.getByText('Category rankings', { exact: true })).toBeVisible();
    await expect(page.getByText('7 categories ranked by published spot assignments')).toBeVisible();
    const categoryRankings = page.getByLabel('Full spot category rankings');
    await expect(categoryRankings.getByText('Dessert', { exact: true })).toBeAttached();
    await categoryRankings.getByText('Co-working', { exact: true }).scrollIntoViewIfNeeded();
    await expect(categoryRankings.getByText('Co-working', { exact: true })).toBeVisible();
    await page.getByLabel('Close category rankings').last().click();
    await expect(page.getByText('Dessert', { exact: true })).toHaveCount(0);
    await page.getByLabel('Open overview spot map').click();
    await expect(page.getByText('Cebu map overview')).toBeVisible();
    await expect(page.getByText('3 registered spots with map coordinates')).toBeVisible();
    await expect(page.frameLocator('iframe[title="Interactive map of nearby spots"]').locator('.spot-shell')).toHaveCount(3);
    await page.getByLabel('Close spot map').last().click();
    await page.getByRole('button', { name: /^Spots/ }).click();
    await expect(page.getByText('Discovery', { exact: true })).toBeVisible();
    await expect(page.getByText(pendingSubmission.name, { exact: true })).toBeVisible();
    page.once('dialog', async (dialog) => {
      assert.match(dialog.message(), /permanently removes the pending submission/i);
      await dialog.accept();
    });
    await page.getByLabel(`Delete ${pendingSubmission.name} submission`).click();
    await expect(page.getByText(pendingSubmission.name, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Submission deleted', { exact: true })).toBeVisible();
    await page.getByLabel('Open spot map overview').click();
    await expect(page.getByText('Cebu map overview')).toBeVisible();
    await expect(page.getByText('3 registered spots with map coordinates')).toBeVisible();

    await page.getByLabel('Filter mapped spots. All categories selected.').click();
    const categoryChoices = page.getByLabel('Spot category choices');
    await expect(categoryChoices.getByText('Cafe', { exact: true })).toBeVisible();
    await categoryChoices.getByText('Cafe', { exact: true }).click();
    await expect(page.getByText('2 of 3 spots in Cafe')).toBeVisible();
    await expect(page.getByText('Carbon Coffee Lab')).toHaveCount(2);
    await expect(page.getByText('Lahug Coffee Room')).toBeVisible();
    await expect(page.getByText('Mango Night Club')).toHaveCount(0);

    const frame = page.frameLocator('iframe[title="Interactive map of nearby spots"]');
    await expect(frame.locator('.spot-shell')).toHaveCount(2);
    assert.equal(await frame.locator('.spot-shell').first().evaluate((element) => element.style.getPropertyValue('--spot-color')), '#D4A373');
    await expect(frame.locator('.spot-shell img')).toHaveCount(0);

    await page.getByLabel('Filter mapped spots. Cafe selected.').click();
    await page.getByLabel('Spot category choices').getByText('All categories', { exact: true }).click();
    await expect(page.getByText('3 registered spots with map coordinates')).toBeVisible();
    await expect(frame.locator('.spot-shell')).toHaveCount(3);

    await page.getByLabel('Close spot map').last().click();
    await page.setViewportSize({ width: 720, height: 900 });
    await page.getByLabel('Open spot map overview').click();
    await page.getByLabel('Filter mapped spots. All categories selected.').click();
    await page.getByLabel('Spot category choices').getByText('Club', { exact: true }).click();
    await expect(page.getByText('1 of 3 spots in Club')).toBeVisible();
    await expect(frame.locator('.spot-shell')).toHaveCount(1);
    assert.equal(await frame.locator('.spot-shell').first().evaluate((element) => element.style.getPropertyValue('--spot-color')), '#EC4899');
    assert.deepEqual(errors, []);
    console.log('PASS identical overview/spots maps, pending-submission delete, and responsive category controls');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
