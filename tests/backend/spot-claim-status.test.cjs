const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

for (const sqlFile of ['supabase-schema.sql', 'supabase-spot-claim-status.sql']) {
  test(`${sqlFile} returns only a privacy-safe ownership hint`, () => {
    const sql = read(sqlFile);

    assert.match(sql, /create or replace function public\.get_spot_claim_status/i);
    assert.match(sql, /security definer/i);
    assert.match(sql, /left\(local_part, least\(2, length\(local_part\)\)\) \|\| '•••@' \|\| domain_part/i);
    assert.match(sql, /'ownerHint', masked_owner_email/i);
    assert.doesNotMatch(sql, /'ownerHint', primary_owner_email/i);
    assert.match(sql, /grant execute on function public\.get_spot_claim_status\(uuid\) to anon, authenticated/i);
  });
}

test('spot details send the exact listing into the owner-access flow', () => {
  const details = read('app/spot/[id].tsx');

  assert.match(details, /pathname: '\/owner-access'/);
  assert.match(details, /spotId: spot\.id/);
  assert.match(details, /spotName: spot\.name/);
  assert.match(details, /spotAddress: spot\.address/);
});

test('owner-access checks management before showing the claim form', () => {
  const screen = read('app/owner-access.tsx');
  const service = read('src/services/ownerAccessService.ts');

  assert.match(service, /rpc\('get_spot_claim_status'/);
  assert.match(screen, /This spot is already managed/);
  assert.match(screen, /is owned by/);
  assert.match(screen, /claimStatus\.ownerHint/);
  assert.match(screen, /label=\{claimStatus\.hasAccess \? 'Open Owner Dashboard' : 'Request Access'\}/);
  assert.match(screen, /spot_id: selectedSpotId \?\? null/);
});
