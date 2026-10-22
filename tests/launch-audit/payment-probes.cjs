const fs = require('node:fs');
const path = require('node:path');
const { fixture, pendingPayment } = require('../backend/payment-harness.cjs');
async function main() {
  const findings = [];
  for (const method of ['gcash', 'qrph']) {
    const f = fixture();
    const res = await Promise.all(Array.from({ length: 10 }, () => f.invoke(`paymongo-create-${method}-checkout`, { reservationId: 'reservation-test' })));
    findings.push({ case: `${method}:10-concurrent-checkouts`, responseCodes: res.map(r => r.status), providerCalls: f.calls.length, uniqueProviderKeys: new Set(f.calls.map(c => c.headers['Idempotency-Key'])).size, paymentRows: f.db.reservation_payments.length });
  }
  {
    const f = fixture();
    await f.invoke('paymongo-create-qrph-checkout', { reservationId: 'reservation-test' });
    await f.invoke('paymongo-create-qrph-checkout', { reservationId: 'reservation-test' });
    findings.push({ case: 'qrph-sequential-retry', providerCalls: f.calls.length, providerExpireCalls: f.calls.filter(c => /expire/.test(c.url)).length, localPaymentStates: f.db.reservation_payments.map(p => p.status), limitation: 'Concurrent mock does not enforce PostgreSQL partial unique indexes; sequential result is compatible with one-pending-payment constraint.' });
  }
  {
    const f = fixture({ payments: [pendingPayment], reservation: { status: 'cancelled', payment_status: 'failed' } });
    const r = await f.webhook(f.event());
    findings.push({ case: 'paid-after-cancellation', http: r.status, paymentStatus: f.db.reservation_payments[0].status, reservationStatus: f.db.reservations[0].status, reservationPaymentStatus: f.db.reservations[0].payment_status, refundStatus: f.db.reservations[0].refund_status || null });
  }
  {
    const f = fixture({ payments: [pendingPayment], failWrite: 'reservations' });
    const r = await f.webhook(f.event());
    findings.push({ case: 'reservation-write-failure-after-payment-write', http: r.status, paymentStatus: f.db.reservation_payments[0].status, reservationStatus: f.db.reservations[0].status });
  }
  {
    const f = fixture({ payments: [pendingPayment] });
    await f.webhook(f.event()); const first = f.db.reservation_payments[0].paid_at;
    await new Promise(r => setTimeout(r, 30)); await f.webhook(f.event());
    findings.push({ case: 'duplicate-paid-event', paidAtChanged: f.db.reservation_payments[0].paid_at !== first });
  }
  {
    const f = fixture({ payments: [pendingPayment] });
    const r = await f.webhook(f.event('checkout_session.payment.paid', 'cs_test_existing', { amount: 100, currency: 'USD' }));
    findings.push({ case: 'signed-amount-currency-mismatch', http: r.status, reservationStatus: f.db.reservations[0].status, paymentAmountStored: f.db.reservation_payments[0].amount });
  }
  {
    const f = fixture({ failWrite: 'reservation_payments' });
    const r = await f.invoke('paymongo-create-gcash-checkout', { reservationId: 'reservation-test' });
    findings.push({ case: 'provider-created-local-save-fails', http: r.status, providerCalls: f.calls.length, paymentRows: f.db.reservation_payments.length });
  }
  fs.writeFileSync(path.join(__dirname, 'evidence/payment-probes.json'), JSON.stringify({ kind: 'actual-handlers-with-mocked-database-and-provider', findings }, null, 2));
  console.log(JSON.stringify(findings, null, 2));
}
main();
