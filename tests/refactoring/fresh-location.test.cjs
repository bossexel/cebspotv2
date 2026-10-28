const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('../remediation/load-client.cjs');

function fixture(position, globals = {}) {
  const calls = [];
  const state = [];
  const {useLocation} = load('src/hooks/useLocation.ts', {
    react: { useCallback: fn => fn, useState: value => { const index=state.length;state.push(value);return [value,next=>{state[index]=next;}]; } },
    'expo-location': {
      Accuracy:{Balanced:'balanced',High:'high'},
      requestForegroundPermissionsAsync:async()=>({status:'granted'}),
      getCurrentPositionAsync:async options=>{calls.push(options.accuracy);return position();},
      getLastKnownPositionAsync:async()=>{calls.push('cached');return {coords:{latitude:1,longitude:2},timestamp:1};},
    },
  }, {__DEV__:true,...globals});
  return {api:useLocation(),calls,state};
}
test('route recenter uses a high-accuracy fix with the actual timestamp', async () => {
  const f = fixture(async()=>({coords:{latitude:10.3,longitude:123.9,accuracy:5},timestamp:99}));
  const point = await f.api.getCurrentLocation({fresh:true});
  assert.equal(point.timestamp,99);
  assert.deepEqual(f.calls,['high']);
  assert.equal(f.state[2],false);
});
test('a failed fresh fix never presents a cached or development fallback as the current location', async () => {
  const f = fixture(async()=>{throw Error('GPS unavailable');});
  assert.equal(await f.api.getCurrentLocation({fresh:true}),null);
  assert.deepEqual(f.calls,['high']);
  assert.equal(f.state[0],null);
  assert.match(f.state[1],/fresh location/);
});
test('a stalled fresh GPS request stops waiting and clears loading', async () => {
  const f = fixture(()=>new Promise(()=>{}),{setTimeout:fn=>setTimeout(fn,1)});
  assert.equal(await f.api.getCurrentLocation({fresh:true}),null);
  assert.equal(f.state[2],false);
  assert.deepEqual(f.calls,['high']);
});
test('existing location callers retain their balanced-accuracy cached fallback', async () => {
  const f = fixture(async()=>{throw Error('GPS unavailable');});
  assert.equal((await f.api.getCurrentLocation()).timestamp,1);
  assert.deepEqual(f.calls,['balanced','cached']);
});
