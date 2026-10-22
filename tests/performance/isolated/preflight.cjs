'use strict';
const fs = require('node:fs');
const { getConfig, root } = require('./config.cjs');
const { read } = require('./fixtures.cjs');
const { client, assertResponse, signIn } = require('./client.cjs');
async function preflight(c) {
  const m = read(c), request = client(c);
  if (!m.ready || m.cleaned) throw Error('Fixtures are incomplete or already cleaned');
  if (m.users.length < Math.max(...c.levels)) throw Error('Distinct synthetic account count is smaller than maximum VUs');
  // A test-only dataset is mandatory: avoid grouped submission writes touching other people's records.
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const page = assertResponse(await request('GET', `/rest/v1/spots?select=id&order=id&limit=500&offset=${offset}`, { admin: true }), Array.isArray, 'Dataset audit');
    all.push(...page);
    if (page.length < 500) break;
    if (all.length > m.spots.length) throw Error('Target contains nonfixture spots; use an empty dedicated backend');
  }
  const allowed = new Set(m.spots.map(s => s.id));
  if (all.length !== allowed.size || all.some(s => !allowed.has(s.id))) throw Error('Dataset differs from manifest');
  const sessions = [];
  for (const user of m.users) {
    const session = await signIn(request, user);
    assertResponse(await request('GET', `/rest/v1/profiles?select=id,role&id=eq.${user.id}`, { token: session.token }),
      d => Array.isArray(d) && d.length === 1 && d[0].role === 'user', 'RLS user role');
    sessions.push(session);
  }
  const anonymous = await request('GET', '/rest/v1/reservations?select=id&limit=1');
  if (!(anonymous.ok && Array.isArray(anonymous.data) && anonymous.data.length === 0) && anonymous.status !== 401 && anonymous.status !== 403) throw Error('Anonymous reservation boundary unexpected');
  for (let offset = 0; ; offset += 500) {
    const submissions = assertResponse(await request('GET', `/rest/v1/spot_submissions?select=id&order=id&limit=500&offset=${offset}`, { admin: true }), Array.isArray, 'Submission audit');
    if (submissions.some(s => !m.submissions.includes(s.id))) throw Error('Target contains nonfixture submissions');
    if (submissions.length < 500) break;
  }
  return { manifest: m, request, sessions };
}
if (require.main === module) {
  (async () => { const c = getConfig({ admin: true }); const p = await preflight(c);
    console.log(JSON.stringify({ ready: true, environment: c.environment, accounts: p.sessions.length, spots: p.manifest.spots.length }));
  })().catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { preflight };
