const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('../remediation/load-client.cjs');
const { parseMapCoordinates } = load('src/utils/mapCoordinates.ts');

test('decimal coordinates preserve signed values, zero, precision and latitude/longitude order', () => {
  for (const [latitude, longitude] of [['10.3157123', '123.8854123'], ['-33.8688', '151.2093'], ['0', '0'], ['+45', '-180'], [' .5 ', ' +180 ']]) {
    const result = parseMapCoordinates(latitude, longitude);
    assert.equal(result.error, null);
    assert.equal(result.coordinate.latitude, Number(latitude));
    assert.equal(result.coordinate.longitude, Number(longitude));
  }
});

test('incomplete, pasted non-decimal, nonfinite and out-of-range inputs cannot become a selected pin', () => {
  for (const pair of [['', '123'], ['10', ''], ['-', '123'], ['10.', '123'], ['10', '.'], ['10,31', '123'], ['NaN', '123'], ['10', 'Infinity'], ['1e2', '123'], ['91', '123'], ['10', '-181'], ['-90', '123']]) {
    const result = parseMapCoordinates(...pair);
    assert.equal(result.coordinate, null, pair.join(', '));
    assert.ok(result.error);
  }
});

test('coordinate validation describes a recoverable range error without silently clamping the pin', () => {
  assert.match(parseMapCoordinates('91', '123').error, /Latitude must be between -90 and 90/);
  assert.match(parseMapCoordinates('10', '181').error, /Longitude must be between -180 and 180/);
  assert.match(parseMapCoordinates('90', '123').error, /This map supports latitudes/);
  assert.equal(parseMapCoordinates('85.05112878', '180').error, null);
});
