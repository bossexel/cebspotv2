'use strict';
// Generates a SEPARATE local Supabase project; never edits the app's linked Supabase project.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { root } = require('./config.cjs');
const stack = path.join(root, 'tests/performance/local-stack/supabase');
if (fs.existsSync(stack)) throw Error('Local stack already prepared; review it before replacing anything');
fs.mkdirSync(path.join(stack, 'migrations'), { recursive: true });
fs.writeFileSync(path.join(stack, 'config.toml'), `project_id = "cebspot-performance-isolated"
[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 54322
shadow_port = 54320
major_version = 15
[db.seed]
enabled = false
[studio]
enabled = true
port = 54323
[inbucket]
enabled = true
port = 54324
[storage]
enabled = true
file_size_limit = "30MiB"
[auth]
enabled = true
site_url = "http://localhost:8081"
enable_signup = true
[auth.email]
enable_signup = true
enable_confirmations = true
[edge_runtime]
enabled = false
[analytics]
enabled = false
`);
const inputs = ['supabase-schema.sql', 'supabase-popular-submissions-workflow.sql', 'supabase-review-interactions.sql',
  'supabase-reservation-attendance.sql', 'supabase-admin-dashboard.sql',
  'supabase/migrations/20260915000100_admin_identity_cutover.sql',
  'supabase/migrations/20261006000100_audit_authorization_hardening.sql'];
const manifest = [];
for (const [index, file] of inputs.entries()) {
  const bytes = fs.readFileSync(path.join(root, file));
  const name = `2026100800000${index}_snapshot.sql`;
  fs.writeFileSync(path.join(stack, 'migrations', name), bytes);
  manifest.push({ source: file, migration: name, sha256: createHash('sha256').update(bytes).digest('hex') });
}
fs.writeFileSync(path.join(stack, 'snapshot-manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared tests/performance/local-stack with unchanged SQL snapshots and RLS.');
console.log('Next: install/start Docker Desktop and Supabase CLI; run supabase start from that directory. SQL startup is NOT yet verified.');
