// Side-effect-free deployment diagnostic. Returns booleans, never configuration
// values, credentials, user records, provider responses or signed URLs.
export function paymentReadiness(read: (name: string) => string | undefined) {
  let returnBridgeConfigured = false;
  try {
    const url = new URL(read('CHECKOUT_RETURN_BASE_URL') ?? '');
    returnBridgeConfigured = url.protocol === 'https:' && !url.username && !url.password
      && !url.hash && !url.search && url.pathname === '/payment-return.html';
  } catch { /* Missing or malformed configuration fails closed. */ }
  const checks = {
    testModeConfigured: /^sk_test_[A-Za-z0-9_]+$/.test(read('PAYMONGO_SECRET_KEY') ?? ''),
    testWebhookConfigured: Boolean(read('PAYMONGO_TEST_WEBHOOK_SECRET')),
    paymentWorkerConfigured: (read('PAYMENT_WORKER_TOKEN') ?? '').length >= 32,
    privateUploadWorkerConfigured: (read('PRIVATE_UPLOAD_WORKER_TOKEN') ?? '').length >= 32,
    returnBridgeConfigured,
  };
  return { contract: 'reservation-payments-v1', configurationReady: Object.values(checks).every(Boolean), checks };
}
