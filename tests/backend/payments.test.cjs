const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, pendingPayment } = require('./payment-harness.cjs');

for (const method of ['gcash', 'qrph']) {
  const name = `paymongo-create-${method}-checkout`;
  test(`${method}: rejects missing authentication without a provider request or write`, async () => {
    const f = fixture();
    assert.equal((await f.invoke(name, { reservationId: 'reservation-test' }, { token: '' })).status, 400);
    assert.equal(f.calls.length, 0);
    assert.equal(f.writes.length, 0);
  });
  test(`${method}: rejects another user's reservation`, async () => {
    const f = fixture({ reservation: { user_id: 'another-user' } });
    const response = await f.invoke(name, { reservationId: 'reservation-test' });
    assert.match((await response.json()).error, /not found/i);
    assert.equal(f.calls.length, 0);
    assert.equal(f.writes.length, 0);
  });
  for (const reservation of [{ payment_status: 'paid' }, { status: 'cancelled' }, { status: 'completed' }, { status: 'no_show' }]) {
    test(`${method}: rejects unavailable reservation ${JSON.stringify(reservation)}`, async () => {
      const f = fixture({ reservation });
      assert.equal((await f.invoke(name, { reservationId: 'reservation-test' })).status, 400);
      assert.equal(f.calls.length, 0);
      assert.equal(f.writes.length, 0);
    });
  }
  test(`${method}: creates pending checkout with centavo amount and persists references`, async () => {
    const f = fixture();
    const response = await f.invoke(name, { reservationId: 'reservation-test', successUrl: 'https://untrusted.invalid/' });
    assert.equal(response.status, 200);
    const attrs = f.calls[0].payload.data.attributes;
    assert.equal(attrs.line_items[0].amount, 15000);
    assert.equal(attrs.line_items[0].currency, 'PHP');
    assert.equal(attrs.payment_method_types[0], method);
    assert.equal(attrs.send_email_receipt, false);
    assert.match(attrs.success_url, /^cebspot:\/\/confirmed\//);
    assert.equal(f.db.reservation_payments[0].status, 'pending');
    assert.equal(f.db.reservations[0].payment_reference, (await response.json()).checkoutSessionId);
  });
  test(`${method}: provider failure is surfaced without marking reservation paid`, async () => {
    const f = fixture({ providerFailure: true });
    const response = await f.invoke(name, { reservationId: 'reservation-test' });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /provider failure/);
    assert.equal(f.db.reservation_payments.length, 0);
    assert.equal(f.db.reservations[0].payment_status, 'pending');
  });
}

test('GCash reuses a pending checkout without a second provider request', async () => {
  const f = fixture({ payments: [pendingPayment] });
  const response = await f.invoke('paymongo-create-gcash-checkout', { reservationId: 'reservation-test' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reused, true);
  assert.equal(f.calls.length, 0);
});

test('QR Ph retry expires the old attempt and creates a new one', async () => {
  const f = fixture({ payments: [{ ...pendingPayment, payment_method: 'qrph' }] });
  assert.equal((await f.invoke('paymongo-create-qrph-checkout', { reservationId: 'reservation-test' })).status, 200);
  assert.equal(f.db.reservation_payments[0].status, 'expired');
  assert.equal(f.db.reservation_payments[1].status, 'pending');
});

test('webhook rejects missing, tampered and stale signatures before database writes', async () => {
  const f = fixture({ payments: [pendingPayment] });
  assert.equal((await f.invoke('paymongo-webhook', f.event(), { token: '' })).status, 400);
  assert.equal((await f.webhook(f.event(), { secret: 'wrong-secret' })).status, 400);
  assert.equal((await f.webhook(f.event(), { timestamp: Math.floor(Date.now() / 1000) - 600 })).status, 400);
  assert.equal(f.writes.length, 0);
});

test('signed paid event confirms reservation; duplicate event does not duplicate payment rows', async () => {
  const f = fixture({ payments: [pendingPayment] });
  assert.equal((await f.webhook(f.event())).status, 200);
  assert.equal(f.db.reservations[0].status, 'confirmed');
  assert.equal(f.db.reservations[0].payment_status, 'paid');
  assert.equal((await f.webhook(f.event())).status, 200);
  assert.equal(f.db.reservation_payments.length, 1);
});

test('signed failure cancels a pending reservation', async () => {
  const f = fixture({ payments: [pendingPayment] });
  assert.equal((await f.webhook(f.event('payment.failed'))).status, 200);
  assert.equal(f.db.reservations[0].status, 'cancelled');
  assert.equal(f.db.reservation_payments[0].status, 'failed');
});

test('late paid event never reopens a cancelled reservation', async () => {
  const f = fixture({ reservation: { status: 'cancelled' }, payments: [pendingPayment] });
  assert.equal((await f.webhook(f.event())).status, 200);
  assert.equal(f.db.reservations[0].status, 'cancelled');
});

test('untracked payment notification is acknowledged without modifying any records', async () => {
  const f = fixture();
  const response = await f.webhook(f.event());
  assert.equal((await response.json()).ignored, true);
  assert.equal(f.writes.length, 0);
});

test('database write failure is surfaced for webhook retry', async () => {
  const f = fixture({ payments: [pendingPayment], failWrite: 'reservation_payments' });
  assert.equal((await f.webhook(f.event())).status, 400);
  assert.equal(f.db.reservations[0].payment_status, 'pending');
});

// Regression expectations below deliberately describe required payment behavior.
// Failures identify defects in the real handlers, not a successful live transaction.
test('a late failure cannot downgrade an already paid reservation', async () => {
  const f = fixture({ payments: [pendingPayment] });
  await f.webhook(f.event());
  await f.webhook(f.event('payment.failed'));
  assert.equal(f.db.reservations[0].payment_status, 'paid');
  assert.equal(f.db.reservations[0].status, 'confirmed');
});

test('unhandled event cannot reset a paid reservation to pending', async () => {
  const f = fixture({ payments: [pendingPayment] });
  await f.webhook(f.event());
  await f.webhook(f.event('payment.refunded'));
  assert.notEqual(f.db.reservations[0].status, 'pending_payment');
});

test('duplicate paid notification preserves a completed reservation', async () => {
  const f = fixture({ reservation: { status: 'completed', payment_status: 'paid' }, payments: [{ ...pendingPayment, status: 'paid' }] });
  await f.webhook(f.event());
  assert.equal(f.db.reservations[0].status, 'completed');
});

test('failure of an expired QR attempt cannot cancel its replacement checkout', async () => {
  const f = fixture({ payments: [{ ...pendingPayment, payment_method: 'qrph' }] });
  await f.invoke('paymongo-create-qrph-checkout', { reservationId: 'reservation-test' });
  await f.webhook(f.event('payment.failed', pendingPayment.provider_checkout_session_id));
  assert.equal(f.db.reservations[0].status, 'pending_payment');
});
