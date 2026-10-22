const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../remediation/load-client.cjs');

const owner = load('src/features/owner-dashboard/model.ts');
const plain = value => JSON.parse(JSON.stringify(value));

test('manual approval still requires an unsettled manual payment and proof review or a reference', () => {
  const reservation = {
    id: 'reservation', status: 'pending_payment', payment_required: true,
    payment_status: 'pending', payment_method: 'gcash', payment_proof_url: 'private/proof',
  };
  assert.equal(owner.canManuallyApproveReservation(reservation), true);
  assert.equal(owner.getApprovalGateReason(reservation, new Set()), 'Review proof first');
  assert.equal(owner.getApprovalGateReason(reservation, new Set(['reservation'])), null);
  assert.equal(owner.getApprovalGateReason({ ...reservation, payment_proof_url: null }, new Set()), 'No proof or reference yet');
  assert.equal(owner.getApprovalGateReason({ ...reservation, payment_proof_url: null, payment_reference: ' reference ' }, new Set()), null);

  for (const payment_method of ['paymongo_gcash', 'paymongo_qrph']) {
    assert.equal(owner.canManuallyApproveReservation({ ...reservation, payment_method }), false);
  }
  for (const status of ['confirmed', 'checked_in', 'completed', 'cancelled', 'no_show']) {
    assert.equal(owner.canManuallyApproveReservation({ ...reservation, status }), false);
  }
  assert.equal(owner.canManuallyApproveReservation({ ...reservation, payment_status: 'paid' }), false);
  assert.equal(owner.canManuallyApproveReservation({ ...reservation, payment_required: false }), false);
});

test('attendance permits eligible free bookings and paid bookings only', () => {
  for (const status of ['pending', 'confirmed', 'rescheduled']) {
    assert.equal(owner.canRecordAttendance({ status, payment_required: false }), true);
    assert.equal(owner.canRecordAttendance({ status, payment_required: true, payment_status: 'paid' }), true);
    assert.equal(owner.canRecordAttendance({ status, payment_required: true, payment_status: 'pending' }), false);
  }
  for (const status of ['pending_payment', 'checked_in', 'completed', 'cancelled', 'no_show']) {
    assert.equal(owner.canRecordAttendance({ status, payment_required: false }), false);
    assert.equal(owner.canRecordAttendance({ status, payment_required: true, payment_status: 'paid' }), false);
  }
});

test('owner gallery preserves ordering, date fallback, deduplication and video exclusion', () => {
  const datedPhoto = 'https://fixture.invalid/owner-gallery/spot/1792123200000-0.jpg';
  const spot = { images: [' cover ', datedPhoto, 'cover', '', '%bad'], created_at: '2026-10-01T00:00:00Z' };
  const reviews = [{ id: 'review', created_at: '2026-10-10T00:00:00Z',
    media_urls: ['cover', 'video', ' community ', 'community'], media_types: ['image', 'video', 'image', 'image'] }];
  const gallery = plain(owner.buildOwnerGallery(spot, reviews));
  assert.deepEqual(gallery.map(item => item.url), ['cover', datedPhoto, '%bad', 'community']);
  assert.equal(gallery[0].createdAt, spot.created_at);
  assert.equal(gallery[1].createdAt, new Date(1792123200000).toISOString());
  assert.equal(gallery[2].createdAt, spot.created_at);
  assert.equal(gallery[3].source, 'community');
  assert.equal(gallery[3].createdAt, reviews[0].created_at);
  assert.deepEqual(plain(owner.buildOwnerGallery(null, reviews)), []);
  assert.equal(owner.getReviewsRating([{ rating: 0 }, { rating: null }, { rating: 5 }, { rating: 3 }]), 4);
  assert.equal(owner.getReviewsRating([]), 0);
});

class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-16T04:00:00Z'])); }
}
const analytics = load('src/services/admin-dashboard/analytics.ts', {}, { Date: FixedDate });
const date = days => analytics.daysAgo(days).toISOString();

test('dashboard analytics retain daily counts, cumulative totals and paid revenue rules', () => {
  const input = {
    spots: [-1, 0, 1, 20].map(days => ({ created_at: date(days) })).concat({ created_at: 'invalid' }),
    users: [
      { role: 'owner', created_at: date(20) }, { role: 'owner', created_at: date(1) },
      { role: 'owner', created_at: date(-1) }, { role: 'user', created_at: date(0) },
      { role: 'owner', created_at: 'invalid' },
    ],
    reservations: [
      { created_at: date(0), status: 'confirmed', payment_status: 'paid', reservation_fee: 100 },
      { created_at: date(0), status: 'checked_in', payment_status: 'paid', reservation_fee: 0, fee: 20 },
      { created_at: date(1), status: 'completed', payment_status: 'paid', reservation_fee: 40 },
      { created_at: date(1), status: 'cancelled', payment_status: 'paid', reservation_fee: 900 },
      { created_at: date(0), status: 'confirmed', payment_status: 'pending', reservation_fee: 70 },
      { created_at: date(0), status: 'pending', payment_status: 'paid', reservation_fee: 90 },
      { created_at: date(20) }, { created_at: 'invalid' }, { created_at: null },
    ],
    reports: [{ createdAt: date(0) }, { createdAt: 'invalid' }],
  };
  const result = plain(analytics.buildDailyInsights(input, 3));
  for (const [key, expected] of Object.entries({
    reservations: [0, 2, 4], reservationBar: [6, 50, 100], estimatedRevenue: [0, 40, 120],
    newSpots: [0, 1, 1], newSpotBar: [6, 100, 100], totalSpots: [1, 2, 3],
    activeOwners: [1, 2, 2], reportsFiled: [0, 0, 1],
  })) assert.deepEqual(result.map(row => row[key]), expected, key);
  assert.deepEqual(plain(analytics.buildDailyInsights(input, 0)), []);
});

test('daily chart series preserve empty bars, labels and out-of-range handling', () => {
  const rows = [0, 0, 1, 20].map(days => ({ created_at: date(days) }));
  rows.push({ created_at: null });
  const result = plain(analytics.buildDailySeries(rows, 3));
  assert.deepEqual(result.bars, [6, 50, 100]);
  assert.equal(result.labels.length, 3);
  assert.deepEqual(plain(analytics.buildDailySeries([], 3)).bars, [6, 6, 6]);
  assert.throws(() => analytics.buildDailySeries([{ created_at: 'invalid' }]), /Invalid time value/);
});

test('admin searches preserve blank queries, case folding and numeric submission fields', () => {
  const presentation = load('src/features/admin-dashboard/presentation.ts');
  const users = [{ id: '1', name: 'Maria', email: 'owner@fixture.invalid', role: 'Owner', location: null }];
  assert.deepEqual(Array.from(presentation.filterUsers(users, '   ')), users);
  assert.deepEqual(Array.from(presentation.filterUsers(users, '  MARIA  ')), users);
  assert.equal(presentation.filterUsers(users, 'missing').length, 0);
  const submissions = [{ id: '2', popularityScore: 147, voteCount: 12 }];
  assert.deepEqual(Array.from(presentation.filterSubmissions(submissions, '147')), submissions);
  assert.equal(presentation.filterSubmissions(submissions, 'undefined').length, 0);
});

test('status badges preserve danger and warning precedence over label tones', () => {
  const { getStatusBadgeTone } = load('src/features/admin-dashboard/presentation.ts');
  for (const [label, tone] of [
    ['Owner', 'owner'], ['restaurant', 'owner'], ['Pending', 'pending'],
    ['VERIFIED', 'success'], ['Success', 'success'], ['Spotter', 'success'], ['Unknown', 'default'],
  ]) {
    assert.equal(getStatusBadgeTone(label), tone);
    assert.equal(getStatusBadgeTone(label, false, true), 'warning');
    assert.equal(getStatusBadgeTone(label, true, true), 'danger');
  }
});
