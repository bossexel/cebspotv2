const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, pendingPayment } = require('./payment-harness.cjs');

test('synthetic payment adapter supports authoritative webhook session retrieval and replay', async () => {
  const payment = { ...pendingPayment, paid_at: null };
  const harness = fixture({ payments: [payment] });
  const payload = harness.event();

  const firstResponse = await harness.webhook(payload);
  assert.equal(firstResponse.status, 200);
  assert.equal(harness.db.reservation_payments.length, 1);
  assert.equal(harness.db.reservation_payments[0].status, 'paid');
  assert.ok(harness.db.reservation_payments[0].paid_at);
  const firstPaidAt = harness.db.reservation_payments[0].paid_at;
  assert.equal(harness.db.reservations[0].status, 'confirmed');
  assert.equal(harness.calls.filter(call => call.method === 'GET').length, 1);

  // Replaying the same signed provider event must not create another row or rewrite paid_at.
  const replayResponse = await harness.webhook(payload);
  assert.equal(replayResponse.status, 200);
  assert.equal(harness.db.reservation_payments.length, 1);
  assert.equal(harness.db.reservation_payments[0].paid_at, firstPaidAt);
  assert.equal(harness.calls.filter(call => call.method === 'GET').length, 1);
  assert.equal(harness.writes.filter(write => write.table === 'reservation_payments').length, 0);
});
