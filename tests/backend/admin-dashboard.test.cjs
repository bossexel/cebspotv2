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
  assert.match(screen, /pathname:\s*'\/reset-password'/);
  assert.match(screen, /requested:\s*'1'/);
});

test('every mutating admin RPC performs the server-side admin check', () => {
  const sql = read('supabase-admin-dashboard.sql');
  for (const name of [
    'approve_spot_submission',
    'delete_admin_spot_submission',
    'review_owner_access_request',
    'dismiss_admin_report',
    'apply_spot_edit_suggestion',
    'delete_admin_spot',
    'delete_admin_owner_request',
  ]) {
    assert.match(sqlFunction(sql, name), /if not public\.is_current_user_admin\(\)/i, name);
  }
});

test('admin dashboard routes operational actions through secured RPCs', () => {
  const service = read('src/services/adminDashboardService.ts');

  assert.match(service, /rpc\('get_admin_dashboard'/);
  assert.match(service, /rpc\('approve_spot_submission'/);
  assert.match(service, /rpc\('delete_admin_spot_submission'/);
  assert.match(service, /rpc\('review_owner_access_request'/);
  assert.match(service, /rpc\('dismiss_admin_report'/);
  assert.match(service, /rpc\('apply_spot_edit_suggestion'/);
  assert.match(service, /rpc\('delete_admin_spot'/);
  assert.match(service, /rpc\('delete_admin_owner_request'/);
});

test('spot deletion is admin-only and preserves booking history', () => {
  const migration = read('supabase/migrations/20261020000100_admin_spot_delete.sql');
  const deletion = sqlFunction(migration, 'delete_admin_spot');
  const screen = read('app/admin.tsx');

  assert.match(deletion, /if not public\.is_current_user_admin\(\)/i);
  assert.match(deletion, /from public\.reservations[\s\S]*reservation\.spot_id\s*=\s*target_spot_id/i);
  assert.match(deletion, /delete from public\.spots where id = target_spot_id/i);
  assert.match(migration, /revoke all on function public\.delete_admin_spot\(uuid\) from public, anon/i);
  assert.match(screen, /accessibilityLabel={`Delete \$\{item\.name\}`}/);
  assert.match(screen, /Spots with booking history are protected and cannot be deleted/);
});

test('owner request deletion is admin-only and does not revoke provisioned access', () => {
  const migration = read('supabase/migrations/20261021000100_admin_owner_request_delete.sql');
  const deletion = sqlFunction(migration, 'delete_admin_owner_request');
  const screen = read('app/admin.tsx');

  assert.match(deletion, /if not public\.is_current_user_admin\(\)/i);
  assert.match(deletion, /delete from public\.activities[\s\S]*target_id = target_request_id::text/i);
  assert.match(deletion, /delete from public\.owner_access_requests where id = target_request_id/i);
  assert.doesNotMatch(deletion, /delete from public\.(profiles|spots|owner_spot_access)/i);
  assert.match(migration, /revoke all on function public\.delete_admin_owner_request\(uuid\) from public, anon/i);
  assert.match(screen, /accessibilityLabel={`Delete \$\{request\.applicant\}'s owner request`}/);
  assert.match(screen, /It does not delete the applicant, the spot, or owner access already granted/);
});

test('pending spot submission deletion is admin-only and removes linked post data without deleting the user', () => {
  const migration = read('supabase/migrations/20261022000100_admin_spot_submission_delete.sql');
  const deletion = sqlFunction(migration, 'delete_admin_spot_submission');
  const screen = read('app/admin.tsx');

  assert.match(deletion, /if not public\.is_current_user_admin\(\)/i);
  assert.match(deletion, /deleted_submission\.status <> 'pending'/i);
  assert.match(deletion, /delete from public\.activities[\s\S]*target_id = target_submission_id::text/i);
  assert.match(deletion, /delete from public\.local_updates[\s\S]*source_type = 'spot_submission'/i);
  assert.match(deletion, /delete from public\.spot_submissions where id = target_submission_id/i);
  assert.doesNotMatch(deletion, /delete from public\.profiles/i);
  assert.match(migration, /revoke all on function public\.delete_admin_spot_submission\(uuid\) from public, anon/i);
  assert.match(screen, /accessibilityLabel={`Delete \$\{submission\.name\} submission`}/);
  assert.match(screen, /Delete Submission/);
  assert.match(screen, /The submitting user is not deleted/);
});

test('barangay leaderboard opens an interactive admin spot map', () => {
  const screen = read('app/admin.tsx');
  const service = read('src/services/adminDashboardService.ts');

  assert.match(screen, /actionLabel="Open spot map overview"/);
  assert.match(screen, /actionLabel="Open overview spot map"/);
  assert.match(screen, /function OverviewSection[\s\S]*getAdminSpotMapRows\(client\)/);
  assert.match(screen, /function SpotMapOverviewModal/);
  assert.match(screen, /onMarkerPress=\{\(marker\) => onSelectSpot\(marker\.id\)\}/);
  assert.match(screen, /ALL MAPPED SPOTS/);
  assert.match(screen, /getSpotCategoryColor\(spot\.category, spot\.categories\)/);
  assert.match(screen, /selectedCategory === 'All'/);
  assert.match(screen, /Filter mapped spots/);
  assert.doesNotMatch(screen, /imageUrl: spot\.image/);
  assert.doesNotMatch(screen, /source=\{\{ uri: selectedSpot\.image \}\}/);
  assert.match(service, /getAdminSpotMapRows/);
  assert.match(service, /category,categories,address,latitude,longitude/);
});

test('top spot categories opens a scrollable full-ranking overview', () => {
  const screen = read('app/admin.tsx');
  const service = read('src/services/adminDashboardService.ts');
  const analytics = read('src/services/admin-dashboard/analytics.ts');

  assert.match(screen, /title="Top spot categories"[\s\S]*?categoryOverview/);
  assert.match(screen, /function CategoryRankingOverviewModal/);
  assert.match(screen, /Open category ranking overview/);
  assert.match(screen, /Full spot category rankings/);
  assert.match(screen, /data\.slice\(0, 5\)/);
  assert.match(service, /categories: publicSpotCategories/);
  assert.match(service, /\[spot\.category, \.\.\.\(spot\.categories \?\? \[\]\)\]/);
  assert.match(service, /readAllAdminSpotCategories/);
  assert.match(service, /\.select\('id,category,categories', \{ count: 'exact' \}\)[\s\S]*?\.range\(/);
  assert.match(service, /buildSpotCategoryProgress\(categoryResult\.data\)/);
  assert.match(analytics, /limit === null \? ranked : ranked\.slice\(0, limit\)/);
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
  assert.match(screen, /const usersPerPage = 7/);
  assert.match(screen, /filteredUsers\.slice\(pageStart, pageStart \+ usersPerPage\)/);
  assert.match(screen, /Show previous users/);
  assert.match(screen, /Show next users/);
  assert.doesNotMatch(sql, /from public\.profiles[\s\S]{0,100}limit 12/i);
});

test('Admin Updates supports protected CRUD and a published-only user feed', () => {
  const migration = read('supabase/migrations/20261022000200_admin_updates.sql');
  const service = read('src/services/adminUpdateService.ts');
  const adminScreen = read('app/admin.tsx');
  const userScreen = read('app/index.tsx');

  assert.match(migration, /create table if not exists public\.admin_updates/i);
  assert.match(migration, /admin_updates_published_read[\s\S]*is_published = true/i);
  for (const operation of ['insert', 'update', 'delete']) {
    assert.match(
      migration,
      new RegExp(`admin_updates_admin_${operation}[\\s\\S]*public\\.is_current_user_admin\\(\\)`, 'i'),
      operation,
    );
  }
  assert.match(service, /createAdminUpdate/);
  assert.match(service, /editAdminUpdate/);
  assert.match(service, /deleteAdminUpdate/);
  assert.match(service, /getPublishedAdminUpdates/);
  assert.match(adminScreen, /accessibilityLabel="Open Admin Updates"/);
  assert.match(adminScreen, /function AdminUpdatesModal/);
  assert.match(adminScreen, /Only published updates are visible to users/);
  assert.match(userScreen, />Admin Updates<\/Text>/);
  assert.match(userScreen, /subscribeToPublishedAdminUpdates/);
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
