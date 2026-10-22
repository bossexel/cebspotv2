'use strict';
const fs = require('node:fs');
const { randomUUID, randomBytes } = require('node:crypto');
const { getConfig, number } = require('./config.cjs');
const { client, assertResponse } = require('./client.cjs');
const categories = ['Specialty Coffee', 'Outdoor', 'Street Food', 'Social Hub', 'Restaurant', 'Co-working', 'Cafe', 'Club', 'Bar'];
function save(config, manifest) {
  fs.mkdirSync(require('node:path').dirname(config.manifest), { recursive: true });
  const temp = config.manifest + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(manifest, null, 2));
  fs.renameSync(temp, config.manifest);
}
function read(config) {
  if (!fs.existsSync(config.manifest)) throw Error('Missing fixture manifest; run fixtures.cjs setup');
  const m = JSON.parse(fs.readFileSync(config.manifest, 'utf8'));
  if (m.origin !== config.origin || !/^perf-[a-f0-9-]+$/.test(m.runId)) throw Error('Fixture manifest target mismatch');
  return m;
}
async function setup(config) {
  if (fs.existsSync(config.manifest)) throw Error('Manifest already exists; audit/clean up that run first');
  const request = client(config);
  assertResponse(await request('GET', '/auth/v1/health'), d => d && typeof d === 'object', 'Auth health');
  for (const table of ['spots', 'spot_submissions']) {
    const existing = assertResponse(await request('GET', `/rest/v1/${table}?select=id&limit=1`, { admin: true }), Array.isArray, 'Empty isolated dataset verification');
    if (existing.length) throw Error(`Refusing setup: ${table} already contains records; use an empty dedicated backend`);
  }
  const spotCount = number('PERF_SPOTS', 1000, 500, 10000);
  const userCount = number('PERF_ACCOUNTS', 50, 2, 200);
  const m = { runId: 'perf-' + randomUUID(), origin: config.origin, created: new Date().toISOString(),
    users: [], spots: [], reservations: [], history: [], submissions: [], activities: [], localUpdates: [], storage: [], reviews: [], ready: false };
  save(config, m);
  for (let i = 0; i < userCount; i++) {
    const account = { email: `${m.runId}-${i}@example.test`, password: randomBytes(30).toString('base64url') };
    const data = assertResponse(await request('POST', '/auth/v1/admin/users', { admin: true,
      body: { ...account, email_confirm: true, user_metadata: { display_name: 'Synthetic Explorer' } } }), d => d?.id, 'Create dummy account');
    m.users.push({ ...account, id: data.id }); save(config, m);
  }
  const batch = [];
  for (let i = 0; i < spotCount; i++) {
    const id = randomUUID();
    const table_inventory = Object.fromEntries(['sunset', 'prime', 'late'].map(slot => [slot,
      Array.from({ length: 20 }, (_, t) => ({ tableId: `${slot[0]}${t + 1}`, capacity: [2, 4, 6, 10][t % 4], isReserved: false }))]));
    const spot = { id, name: `[${m.runId}] Synthetic ${categories[i % categories.length]} ${i}`,
      description: 'Synthetic capstone fixture. No real venue.', category: categories[i % categories.length],
      categories: [categories[i % categories.length], categories[(i + 2) % categories.length]], address: 'Synthetic Cebu fixture',
      latitude: 10.25 + (i % 100) * .001, longitude: 123.8 + (i % 80) * .001,
      rating: (i % 51) / 10, review_count: 1, images: [],
      is_public: true, is_reservable: i <= 20, reservation_type: i === 20 ? 'paid' : 'free', payment_required: i === 20, reservation_fee: i === 20 ? 150 : 0,
      table_inventory: i <= 20 ? table_inventory : {}, owner_id: null };
    m.spots.push(spot); batch.push(spot);
  }
  save(config, m); // Journal intended UUIDs before writes; cleanup also handles ambiguous transport outcomes.
  for (let i = 0; i < batch.length; i += 100) assertResponse(await request('POST', '/rest/v1/spots', {
    admin: true, body: batch.slice(i, i + 100), headers: { Prefer: 'return=representation' } }), d => Array.isArray(d) && d.length === Math.min(100, batch.length - i), 'Seed synthetic spots');
  const reviews = m.spots.map((s, i) => ({ id: randomUUID(), spot_id: s.id, user_id: m.users[i % userCount].id,
    user_name: 'Synthetic Explorer', rating: 4, comment: 'Synthetic performance fixture' }));
  m.reviews = reviews.map(r => r.id); save(config, m);
  for (let i = 0; i < reviews.length; i += 100) assertResponse(await request('POST', '/rest/v1/reviews', { admin: true,
    body: reviews.slice(i, i + 100), headers: { Prefer: 'return=representation' } }), d => Array.isArray(d), 'Seed reviews');
  const historyCount = number('PERF_HISTORY', 5000, 0, 50000);
  for (let offset = 0; offset < historyCount; offset += 100) {
    const rows = Array.from({ length: Math.min(100, historyCount - offset) }, (_, j) => {
      const i = offset + j, spot = m.spots[i % 20], date = new Date(m.created);
      date.setUTCDate(date.getUTCDate() + 10 + Math.floor(i / 400));
      return { id: randomUUID(), user_id: m.users[i % userCount].id, spot_id: spot.id, spot_name: spot.name,
        reservation_date: date.toISOString().slice(0, 10), reservation_time: '17:00', reservation_time_start: '17:00', reservation_time_end: '19:30',
        slot_id: 'sunset', table_id: `s${Math.floor(i / 20) % 20 + 1}`, guests: 2, guest_count: 2,
        qr_code: m.runId + '-history-' + i, note: m.runId, status: 'pending', payment_status: 'not_required' };
    });
    m.history.push(...rows.map(r => r.id)); save(config, m);
    assertResponse(await request('POST', '/rest/v1/reservations', { admin: true, body: rows, headers: { Prefer: 'return=representation' } }),
      d => Array.isArray(d) && d.length === rows.length, 'Seed reservation history');
    // Setup-only terminal records simulate accumulated booking history. VUs always use actual user auth/RLS.
    assertResponse(await request('PATCH', `/rest/v1/reservations?id=in.(${rows.map(r => r.id).join(',')})`, { admin: true,
      body: { status: 'completed' }, headers: { Prefer: 'return=representation' } }), d => Array.isArray(d) && d.every(r => r.status === 'completed'), 'Finalize synthetic history');
  }
  m.ready = true; save(config, m);
  console.log(JSON.stringify({ runId: m.runId, spots: spotCount, accounts: userCount, reviews: reviews.length, history: m.history.length, ready: true }));
}
async function cleanup(config) {
  const request = client(config), m = read(config);
  // Resolve grouped-update IDs from this run's exact submission IDs even if an RPC reply was lost.
  for (let i = 0; i < m.submissions.length; i += 50) {
    const ids = m.submissions.slice(i, i + 50);
    const grouped = assertResponse(await request('GET', `/rest/v1/local_updates?select=id&source_type=eq.spot_submission&source_id=in.(${ids.join(',')})`, { admin: true }), Array.isArray, 'Cleanup grouped-update audit');
    m.localUpdates.push(...grouped.map(r => r.id));
  }
  m.localUpdates = [...new Set(m.localUpdates)]; save(config, m);
  // Only exact IDs and paths in this run's private journal; never delete by name prefix or date range.
  for (const [table, ids] of [['local_updates', m.localUpdates], ['activities', m.activities], ['spot_submissions', m.submissions],
    ['reservations', [...m.reservations, ...(m.history || [])]], ['reviews', m.reviews], ['spots', m.spots.map(s => s.id)]]) {
    for (let i = 0; i < ids.length; i += 50) {
      const result = await request('DELETE', `/rest/v1/${table}?id=in.(${ids.slice(i, i + 50).join(',')})`, { admin: true });
      if (!result.ok) throw Error(`Cleanup ${table} failed: HTTP ${result.status}; journal retained`);
    }
  }
  for (let i = 0; i < m.storage.length; i += 50) {
    const paths = m.storage.slice(i, i + 50);
    if (paths.some(p => !m.users.some(u => p.startsWith(`${u.id}/${m.runId}/`)))) throw Error('Storage path outside run');
    if (!(await request('DELETE', '/storage/v1/object/spot-images', { admin: true, body: { prefixes: paths } })).ok) throw Error('Storage cleanup failed');
  }
  for (const u of m.users) if (!(await request('DELETE', '/auth/v1/admin/users/' + u.id, { admin: true })).ok) throw Error('Account cleanup failed; journal retained');
  m.cleaned = new Date().toISOString(); m.ready = false; save(config, m);
  console.log('Run-specific cleanup completed; private journal retained for audit.');
}
if (require.main === module) {
  (async () => { const c = getConfig({ admin: true });
    if (process.argv[2] === 'setup') await setup(c);
    else if (process.argv[2] === 'cleanup') await cleanup(c);
    else throw Error('Use setup or cleanup');
  })().catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { categories, save, read, setup, cleanup };
