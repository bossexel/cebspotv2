const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('../remediation/load-client.cjs');

function fixture(permission = 'granted', results = []) {
  const calls = [];
  const api = load('src/utils/addressGeocoding.ts', {
    'expo-location': {
      getForegroundPermissionsAsync: async () => ({ status: permission }),
      geocodeAsync: async (query) => { calls.push(query); return results; },
    },
  });
  return { api, calls };
}

test('address lookup uses the typed address and returns a valid approximate coordinate', async () => {
  const f = fixture('granted', [
    { latitude: 100, longitude: 123 },
    { latitude: 10.5800001, longitude: 123.8800002 },
  ]);
  assert.equal(JSON.stringify(await f.api.resolveAddressPin(' IT Park, Cebu City ')), JSON.stringify({
    status: 'resolved',
    coordinate: { latitude: 10.5800001, longitude: 123.8800002 },
  }));
  assert.deepEqual(f.calls, ['IT Park, Cebu City']);
});

test('ambiguous addresses are biased to Cebu and non-Cebu results are rejected', async () => {
  const f = fixture('granted', [{ latitude: 14.5995, longitude: 120.9842 }]);
  assert.equal(JSON.stringify(await f.api.resolveAddressPin('IT Park')), JSON.stringify({ status: 'outside-cebu' }));
  assert.deepEqual(f.calls, ['IT Park, Cebu, Philippines']);
  assert.equal(f.api.isCebuCoordinate({ latitude: 10.3157, longitude: 123.8854 }), true);
  assert.equal(f.api.isCebuCoordinate({ latitude: 9.8, longitude: 124.2 }), false);
});

test('address lookup fails closed without location permission and makes no geocoder call', async () => {
  const f = fixture('denied', [{ latitude: 10, longitude: 123 }]);
  assert.equal(JSON.stringify(await f.api.resolveAddressPin('IT Park, Cebu City')), JSON.stringify({ status: 'permission-required' }));
  assert.deepEqual(f.calls, []);
});

test('short or unresolved addresses do not invent coordinates', async () => {
  const f = fixture('granted', []);
  assert.equal(JSON.stringify(await f.api.resolveAddressPin('IT')), JSON.stringify({ status: 'not-found' }));
  assert.equal(JSON.stringify(await f.api.resolveAddressPin('Somewhere in Cebu')), JSON.stringify({ status: 'not-found' }));
  assert.deepEqual(f.calls, ['Somewhere in Cebu']);
});
