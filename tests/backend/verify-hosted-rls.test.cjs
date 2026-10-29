const test = require('node:test');
const assert = require('node:assert/strict');
const { PRIVATE_EVENT_TYPES, probeReservationActivity } = require('../../scripts/verify-hosted-rls.js');

const env = {
  ALLOW_READONLY_PROBE: '1',
  SUPABASE_URL: 'https://project.invalid',
  SUPABASE_ANON_KEY: 'mock-anon-key',
  UNRELATED_USER_ACCESS_TOKEN: 'mock-user-token',
};

test('read-only RLS probe refuses to run without explicit acknowledgement', async () => {
  await assert.rejects(() => probeReservationActivity({ env: { ...env, ALLOW_READONLY_PROBE: undefined }, fetchImpl: async () => {
    throw new Error('fetch must not run');
  } }), /ALLOW_READONLY_PROBE/);
});

test('probe requests only event types, limits to five, and sends no bearer token anonymously', async () => {
  const requests = [];
  const result = await probeReservationActivity({ env, fetchImpl: async (url, init) => {
    requests.push({ url: new URL(url), init });
    return Response.json([]);
  } });
  assert.equal(result.safe, true);
  assert.deepEqual(result.results.map(item => item.returnedRows), [0, 0]);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.init.method, 'GET');
    assert.equal(request.url.pathname, '/rest/v1/activities');
    assert.equal(request.url.searchParams.get('select'), 'type');
    assert.equal(request.url.searchParams.get('limit'), '5');
    assert.deepEqual(request.init.redirect, 'error');
  }
  assert.equal(requests[0].init.headers.Authorization, undefined);
  assert.equal(requests[1].init.headers.Authorization, `Bearer ${env.UNRELATED_USER_ACCESS_TOKEN}`);
  assert.equal(requests[0].url.searchParams.get('or'), `(${PRIVATE_EVENT_TYPES.map(type => `type.eq.${type}`).join(',')})`);
});

test('probe reports an exposure from returned event-type rows without retaining row contents', async () => {
  const result = await probeReservationActivity({ env, fetchImpl: async () => Response.json([{ type: 'reservation_approved' }]) });
  assert.equal(result.safe, false);
  assert.deepEqual(result.results.map(item => item.returnedRows), [1, 1]);
  assert.equal(JSON.stringify(result).includes('reservation_approved'), false);
});

test('probe fails closed on HTTP errors and invalid response shapes', async () => {
  await assert.rejects(() => probeReservationActivity({ env, fetchImpl: async () => Response.json([], { status: 401 }) }), /HTTP 401/);
  await assert.rejects(() => probeReservationActivity({ env, fetchImpl: async () => Response.json({}) }), /invalid response shape/);
});
