const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('payment methods stay locked until contact details and deposit terms are complete', () => {
  const checkout = read('app/checkout/[id].tsx');

  assert.match(checkout, /useState<PaymentMode \| null>\(null\)/);
  assert.match(checkout, /const paymentAccessGranted = contactDetailsComplete && paymentTermsAccepted/);
  assert.match(checkout, /disabled=\{!paymentAccessGranted \|\| !qrphEnabled\}/);
  assert.match(checkout, /accessibilityRole="checkbox"/);
  assert.match(checkout, /EXPO_PUBLIC_PAYMONGO_GCASH_ENABLED === 'true'/);
  assert.match(checkout, /EXPO_PUBLIC_PAYMONGO_QRPH_ENABLED !== 'false'/);
  assert.match(checkout, /\{paymongoGcashEnabled \? \(/);
});

test('checkout takes identity from the database profile and records the phone snapshot', () => {
  const checkout = read('app/checkout/[id].tsx');

  assert.match(checkout, /profile\?\.first_name/);
  assert.match(checkout, /profile\?\.last_name/);
  assert.match(checkout, /const customerEmail = profile\?\.email/);
  assert.match(checkout, /guest_name: customerName/);
  assert.match(checkout, /guest_email: customerEmail/);
  assert.match(checkout, /guest_phone: normalizedGuestPhone/);
});

test('checkout records the short deposit acceptance and retains the five-minute table hold', () => {
  const checkout = read('app/checkout/[id].tsx');
  const reservation = read('app/reservation/[id].tsx');

  assert.match(checkout, /50%, non refundable down payment/);
  assert.doesNotMatch(checkout, /within 60 minutes/);
  assert.match(checkout, /I have read and accept reservation/);
  assert.match(checkout, />Terms and Conditions</);
  assert.match(checkout, /payment_terms_accepted: true/);
  assert.match(checkout, /payment_terms_accepted_at: new Date\(\)\.toISOString\(\)/);
  assert.match(reservation, /tableHoldDurationSeconds = 5 \* 60/);
});

for (const sqlFile of ['supabase-schema.sql', 'supabase-reservation-contact-details.sql']) {
  test(`${sqlFile} stores and enforces paid reservation verification details`, () => {
    const sql = read(sqlFile);

    assert.match(sql, /guest_name text/i);
    assert.match(sql, /guest_email text/i);
    assert.match(sql, /guest_phone text/i);
    assert.match(sql, /payment_terms_accepted boolean not null default false/i);
    assert.match(sql, /create trigger reservations_require_checkout_details/i);
    assert.match(sql, /interval '5 minutes'/i);
  });
}

test('owner and confirmation views expose the saved verification details', () => {
  const ownerDashboard = read('app/owner-dashboard.tsx');
  const confirmation = read('app/confirmed/[id].tsx');

  assert.match(ownerDashboard, /Guest Phone/);
  assert.match(ownerDashboard, /Deposit Terms/);
  assert.match(confirmation, /reservation\.guest_phone/);
  assert.match(confirmation, /reservation\.guest_name/);
  assert.match(confirmation, /reservation\.guest_email/);
});
