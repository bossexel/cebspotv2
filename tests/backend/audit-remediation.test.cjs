const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('live discovery does not replace empty or failed backend results with sample listings', () => {
  const screen = read('app/index.tsx');

  assert.doesNotMatch(screen, /enhanceSpots\(sampleSpots|fetchedSpots\.length \? fetchedSpots : sampleSpots/);
  assert.match(screen, /setSpotLoadError\('Live spots could not be loaded/);
  assert.match(screen, /Retry loading spots/);
  assert.doesNotMatch(screen, /enhanceSpots\(sampleSpots, distanceOriginRef\.current\)/);
});

test('a failed review write is reported as a failure rather than inserted as session-only content', () => {
  const screen = read('app/spot/[id].tsx');
  const failureMessage = screen.indexOf("'Review not posted'");
  assert.notEqual(failureMessage, -1);
  const nextHandler = screen.indexOf('async function submitReviewReply', failureMessage);
  const failedSubmit = screen.slice(failureMessage, nextHandler);

  assert.doesNotMatch(failedSubmit, /local-review-/);
  assert.doesNotMatch(failedSubmit, /setReviews\(\(current\) => \[/);
});

test('booking insertion rejects null slots and requires the selected table to exist in venue inventory', () => {
  const migration = read('supabase/migrations/20261006000100_audit_authorization_hardening.sql');
  assert.match(migration, /coalesce\(new\.slot_id, ''\) not in \('sunset', 'prime', 'late'\)/i);
  assert.match(migration, /table_entry ->> 'tableId', table_entry ->> 'table_id'/i);
});

