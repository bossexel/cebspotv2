const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function sqlFunction(sql, name) {
  const start = sql.search(new RegExp(`create or replace function public\\.${name}\\b`, 'i'));
  assert.notEqual(start, -1, `${name} must be defined`);
  const end = sql.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${name} must have a complete SQL body`);
  return sql.slice(start, end);
}

test('admin identity is checked server-side by authenticated user, role, and email', () => {
  const sql = read('supabase-admin-dashboard.sql');
  const guard = sqlFunction(sql, 'is_current_user_admin');

  assert.match(guard, /profile\.id\s*=\s*auth\.uid\(\)/i);
  assert.match(guard, /profile\.role\s*=\s*'admin'/i);
  assert.match(guard, /lower\(profile\.email\)\s*=\s*'testadmin6000@gmail\.com'/i);
});

test('admin identity cutover revokes the old role and promotes the new account', () => {
  const migration = read('supabase/migrations/20260915000100_admin_identity_cutover.sql');
  const roles = read('src/constants/authRoles.ts');

  assert.match(roles, /ADMIN_EMAIL\s*=\s*'testadmin6000@gmail\.com'/i);
  assert.match(migration, /set role = 'user'[\s\S]*testadmin@cebspot\.com/i);
  assert.match(migration, /set role = 'admin'[\s\S]*testadmin6000@gmail\.com/i);
  assert.match(sqlFunction(migration, 'is_current_user_admin'), /testadmin6000@gmail\.com/i);
});

test('admin login offers password visibility and recovery controls', () => {
  const screen = read('app/admin.tsx');

  assert.match(screen, /<PasswordInput/);
  assert.match(screen, /Forgot password\?/);
  assert.match(screen, /resetPasswordForEmail/);
  assert.match(screen, /createURL\('\/reset-password'\)/);
});

test('every mutating admin RPC performs the server-side admin check', () => {
  const sql = read('supabase-admin-dashboard.sql');
  for (const name of [
    'approve_spot_submission',
    'review_owner_access_request',
    'dismiss_admin_report',
    'apply_spot_edit_suggestion',
  ]) {
    assert.match(sqlFunction(sql, name), /if not public\.is_current_user_admin\(\)/i, name);
  }
});

test('admin dashboard routes operational actions through secured RPCs', () => {
  const service = read('src/services/adminDashboardService.ts');

  assert.match(service, /rpc\('get_admin_dashboard'/);
  assert.match(service, /rpc\('approve_spot_submission'/);
  assert.match(service, /rpc\('review_owner_access_request'/);
  assert.match(service, /rpc\('dismiss_admin_report'/);
  assert.match(service, /rpc\('apply_spot_edit_suggestion'/);
});

test('admin members are paged from the full profiles table instead of the 12-row dashboard preview', () => {
  const service = read('src/services/adminDashboardService.ts');
  const screen = read('app/admin.tsx');
  const sql = read('supabase-admin-dashboard.sql');

  assert.match(service, /readAllAdminProfiles/);
  assert.match(service, /\.select\('id,email,display_name,role,location,created_at,photo_url', \{ count: 'exact' \}\)[\s\S]*\.range\(/);
  assert.match(service, /users: normalizeAdminUserRows\(allProfileRows/);
  assert.match(service, /formatAdminUserLocation/);
  assert.match(screen, /if \(item === 'All'\) onClearQuery\(\)/);
  assert.doesNotMatch(sql, /from public\.profiles[\s\S]{0,100}limit 12/i);
});

test('admin screen exposes live moderation and owner-review handlers', () => {
  const screen = read('app/admin.tsx');

  assert.match(screen, /handleApproveSubmission/);
  assert.match(screen, /handleDismissReport/);
  assert.match(screen, /handleApplyReport/);
  assert.match(screen, /handleReviewOwnerRequest/);
  assert.match(screen, /ownerVerificationDocumentService\.getSignedUrl/);
});

for (const sqlFile of ['supabase-admin-dashboard.sql', 'supabase-fix-owner-request-rejection.sql']) {
  test(`${sqlFile} lets admins reject applications without an account id`, () => {
    const sql = read(sqlFile);
    const reviewFunction = sqlFunction(sql, 'review_owner_access_request');

    assert.match(reviewFunction, /owner_request\.requester_id := requester_profile\.id/);
    assert.match(
      reviewFunction,
      /requester_profile\.id is null and normalized_decision = 'approved'/,
    );
    assert.match(reviewFunction, /where owner_request\.requester_id is not null/);
  });
}
