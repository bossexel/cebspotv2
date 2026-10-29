const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const script = fs.readFileSync(path.join(__dirname, '../../scripts/deploy-edge-functions.sh'), 'utf8');
const scriptPath = path.join(__dirname, '../../scripts/deploy-edge-functions.sh');
const deploymentDoc = fs.readFileSync(path.join(__dirname, '../../docs/deployment-2026-10-28.md'), 'utf8');

test('deployment helper requires staging ref and rejects refs present in deployment history', () => {
  assert.match(script, /STAGING_PROJECT_REF/);
  assert.match(script, /grep -Fq "\$STAGING_PROJECT_REF" "\$deployment_doc"/);
  assert.match(script, /Refusing: target matches a production\/beta reference/);
});

test('deployment helper offers a no-deploy dry run and requires a separate staging acknowledgement', () => {
  assert.match(script, /DRY_RUN:-0/);
  assert.match(script, /Validated isolated staging target; no deploy invoked/);
  assert.match(script, /DEPLOY_STAGING_ACK/);
  assert.match(script, /supabase functions deploy/);
  assert.deepEqual((script.match(/supabase functions deploy/g) || []).length, 1);
});

test('shell dry-run validates a synthetic staging ref and refuses a documented beta ref', () => {
  const bash = ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe'].find(candidate => fs.existsSync(candidate));
  assert.ok(bash, 'Git Bash is required to exercise the deployment guard');
  const run = ref => spawnSync(bash, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, STAGING_PROJECT_REF: ref, DRY_RUN: '1', DEPLOY_STAGING_ACK: '' },
  });
  const valid = run('abcdefghijklmnopqrst');
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /no deploy invoked/);
  const documentedRefs = [...deploymentDoc.matchAll(/\b[a-z0-9]{20}\b/g)].map(match => match[0]);
  assert.ok(documentedRefs.length > 0, 'deployment history should contain a beta/production project ref');
  const refused = run(documentedRefs[0]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /matches a production\/beta reference/);
  assert.equal(refused.stderr.includes(documentedRefs[0]), false, 'refusal output must not reveal the ref');
});
