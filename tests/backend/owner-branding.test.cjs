const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('dedicated owner provisioning rejects existing CebSpot identities', () => {
  const edgeFunction = read('supabase/functions/provision-owner-account/index.ts');

  assert.match(edgeFunction, /authUserExists\(businessEmail/);
  assert.match(edgeFunction, /from\('profiles'\)[\s\S]*\.ilike\('email', businessEmail\)/);
  assert.match(edgeFunction, /This email is already registered in CebSpot/);
  assert.match(edgeFunction, /separate business email/i);
});

test('owner request submission rejects registered and already-pending business emails', () => {
  const screen = read('app/owner-access.tsx');
  const service = read('src/services/ownerAccessService.ts');
  const sql = read('supabase-owner-business-email-validation.sql');

  assert.match(service, /rpc\('get_owner_business_email_status'/);
  assert.match(screen, /emailStatus === 'registered'/);
  assert.match(screen, /emailStatus === 'pending'/);
  assert.match(sql, /from auth\.users[\s\S]*from public\.profiles/i);
  assert.match(sql, /before insert on public\.owner_access_requests/i);
  assert.match(sql, /owner_requests_reject_unavailable_email/i);
});

test('dedicated owner invitation is finalized server-side and rolled back on failure', () => {
  const edgeFunction = read('supabase/functions/provision-owner-account/index.ts');

  assert.match(edgeFunction, /auth\.admin\.inviteUserByEmail/);
  assert.match(edgeFunction, /rpc\('finalize_dedicated_owner_account'/);
  assert.match(edgeFunction, /auth\.admin\.deleteUser\(invitedUserId\)/);
  assert.doesNotMatch(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY[^\n]*EXPO_PUBLIC/);
});

test('database finalizer creates an owner-only profile and spot assignment', () => {
  const sql = read('supabase-dedicated-owner-accounts.sql');

  assert.match(sql, /owner_request\.requester_id is not null[\s\S]*separate business email/i);
  assert.match(sql, /set role = 'owner'/i);
  assert.match(sql, /insert into public\.owner_spot_access/i);
  assert.match(sql, /set owner_id = dedicated_owner_id/i);
  assert.match(sql, /grant execute on function public\.finalize_dedicated_owner_account[\s\S]*to service_role/i);
  assert.match(sql, /revoke all on function public\.finalize_dedicated_owner_account[\s\S]*from anon, authenticated/i);
});

test('admin approval uses account provisioning while rejection stays in the review RPC', () => {
  const service = read('src/services/adminDashboardService.ts');

  assert.match(service, /decision === 'approved'[\s\S]*functions\.invoke\('provision-owner-account'/);
  assert.match(service, /rpc\('review_owner_access_request'/);
});

test('mobile owner dashboard loads the spot assigned to the signed-in business account', () => {
  const dashboard = read('app/owner-dashboard.tsx');
  const service = read('src/services/ownerAccessService.ts');

  assert.match(service, /getPrimaryManagedSpotId/);
  assert.match(service, /from\('owner_spot_access'\)/);
  assert.match(dashboard, /getPrimaryManagedSpotId\(ownerSupabase\)/);
  assert.match(dashboard, /spotService\.getSpotById\(assignedSpotId/);
  assert.doesNotMatch(dashboard, /testowner@cebspot\.com/i);
  assert.doesNotMatch(dashboard, /66666666-6666-4666-8666-666666666666/);
});

test('signed-in roles are confined to their dedicated application surface', () => {
  const layout = read('app/_layout.tsx');
  const roles = read('src/constants/authRoles.ts');
  const profile = read('app/profile.tsx');

  assert.match(layout, /canAccessRootRoute\(accountRole, currentRoute\)/);
  assert.match(layout, /router\.replace\(getRoleHome\(accountRole\)\)/);
  assert.match(layout, /isUserSession[\s\S]*reservationReminderService/);
  assert.match(roles, /role === 'owner'\) return rootRoute === 'owner-dashboard'/);
  assert.match(roles, /role === 'admin'\) return rootRoute === 'admin'/);
  assert.doesNotMatch(profile, /router\.push\('\/owner-dashboard'\)/);
});

test('standalone owner portal derives its venue from owner_spot_access', () => {
  const portal = read('public/owner-portal/owner-portal-live.js');

  assert.match(portal, /from\("owner_spot_access"\)/);
  assert.match(portal, /activeSpotId = primaryAccess\.spot_id/);
  assert.doesNotMatch(portal, /testowner@cebspot\.com/i);
  assert.doesNotMatch(portal, /claim_test_cebspot_owner_access/i);
});

test('master schema removes prototype-only owner assignment hooks', () => {
  const schema = read('supabase-schema.sql');

  assert.match(schema, /drop function if exists public\.claim_test_cebspot_owner_access\(\)/i);
  assert.match(schema, /drop function if exists public\.enforce_test_cebspot_spot_owner\(\)/i);
  assert.match(schema, /drop function if exists public\.enforce_test_cebspot_owner_access\(\)/i);
  assert.doesNotMatch(schema, /create or replace function public\.claim_test_cebspot_owner_access\(\)/i);
});

test('fallback data keeps the Test Cebspot Club brand and category', () => {
  const sampleData = read('src/constants/sampleData.ts');
  assert.match(sampleData, /name: 'Test Cebspot Club'/);
  assert.match(sampleData, /category: 'Club'/);
  assert.doesNotMatch(sampleData, /Test Cebspot Restaurant/);
});
