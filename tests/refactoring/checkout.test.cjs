const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../remediation/load-client.cjs');

for (const [method, endpoint] of [
  ['createGcashCheckout', 'paymongo-create-gcash-checkout'],
  ['createQrphCheckout', 'paymongo-create-qrph-checkout'],
]) {
  function checkout(result) {
    const calls = [];
    const { paymongoCheckoutService } = load('src/services/paymongoCheckoutService.ts', {
      '../lib/supabase': { supabase: { functions: {
        async invoke(name, options) { calls.push({ name, options }); return result; },
      } } },
    });
    return { calls, create: input => paymongoCheckoutService[method](input) };
  }

  test(`${method} preserves its endpoint, request body and response`, async () => {
    const data = { checkoutUrl: 'https://fixture.invalid/checkout', checkoutSessionId: 'session', amount: 100, currency: 'PHP' };
    const input = { reservationId: 'reservation', successUrl: 'cebspot://success', cancelUrl: 'cebspot://cancel' };
    const f = checkout({ data, error: null });
    assert.equal(await f.create(input), data);
    assert.equal(f.calls[0].name, endpoint);
    assert.equal(f.calls[0].options.body, input);
  });

  test(`${method} preserves provider error parsing and malformed response handling`, async () => {
    const cases = [
      [null, 'PayMongo did not return a checkout URL.'],
      [{ message: 'Client failure' }, 'Client failure'],
      [{ context: { json: async () => ({ error: 'Provider error' }) } }, 'Provider error'],
      [{ context: { json: async () => ({ message: 'Provider message' }) } }, 'Provider message'],
      [{ context: { json: async () => { throw Error('Consumed'); }, text: async () => 'Provider text' } }, 'Provider text'],
      [{ context: { json: async () => { throw Error('Consumed'); }, text: async () => { throw Error('Consumed'); } } }, 'PayMongo checkout request failed.'],
    ];
    for (const [error, message] of cases) {
      const f = checkout({ data: { checkoutSessionId: 'incomplete' }, error });
      await assert.rejects(f.create({ reservationId: 'reservation' }), { message });
    }
  });
}
