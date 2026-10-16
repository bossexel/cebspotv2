const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('activity posts expose one branded Spot control with its count and no downvote control', () => {
  const screen = read('app/activity.tsx');

  assert.match(screen, /function SpotPinIcon/);
  assert.match(screen, /toggleSpotSubmissionVote\(item\.source_id\)/);
  assert.match(screen, /formatSpotScore\(item\.spot_count\)/);
  assert.match(screen, /accessibilityState=\{\{ selected: currentVote === 'up'/);
  assert.doesNotMatch(screen, /ArrowUp|ArrowDown|Downvote|voteForUpdate\(item, 'down'\)/);
});

for (const sqlFile of ['supabase-schema.sql', 'supabase/migrations/20260901000000_schema_foundation.sql']) {
  test(`${sqlFile} lets an author Spot their own submission`, () => {
    const sql = read(sqlFile);

    assert.match(
      sql,
      /insert into public\.spot_submission_votes \(submission_id, user_id, vote_type\)[\s\S]*values \(canonical\.id, current_user_id, 'up'\)/i,
    );
    assert.doesNotMatch(sql, /raise exception ['"][^'"]*(own|author|submitter)[^'"]*vote/i);
  });
}
