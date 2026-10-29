const test = require('node:test');
const assert = require('node:assert/strict');
const { assertPayMongoTestKey } = require('../../scripts/paymongo-test-key-guard.cjs');

test('provider verification guard accepts a test key shape', () => {
  assert.equal(assertPayMongoTestKey('sk_test_fixture123'), true);
});

test('provider verification guard refuses live, publishable, malformed and missing keys', () => {
  for (const value of ['sk_live_fixture123', 'pk_test_fixture123', '', undefined, null, 'sk_test_bad-value']) {
    assert.throws(() => assertPayMongoTestKey(value), /test-mode key/);
  }
});
