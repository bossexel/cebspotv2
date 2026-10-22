'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./config.cjs');
const secrets = new Set();
for (const file of ['.env.local', '.env.test.local', '.env.perf.local', 'face-blur-service/.env']) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) continue;
  for (const line of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && /password|secret|token|key/i.test(match[1])) {
      const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (value.length >= 8) secrets.add(value);
    }
  }
}
for (const [key, value] of Object.entries(process.env)) if (/password|secret|token|key/i.test(key) && value.length >= 8) secrets.add(value);
const evidence = path.join(root, 'tests/performance/evidence');
let filesChecked = 0, filesRedacted = 0;
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(json|jsonl|md|tap|txt)$/.test(entry.name)) {
      let text = fs.readFileSync(file, 'utf8'), changed = false; filesChecked++;
      for (const secret of secrets) if (text.includes(secret)) { text = text.split(secret).join('[REDACTED]'); changed = true; }
      if (changed) { fs.writeFileSync(file, text); filesRedacted++; }
    }
  }
}
visit(evidence);
const result = { kind: 'evidence-secret-check', dateUtc: new Date().toISOString(), filesChecked, filesRedacted,
  scope: 'Exact values of configured keys/passwords/secrets/tokens, never printed. Supplementary review remains necessary before public release.' };
fs.writeFileSync(path.join(evidence, 'sanitization.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ filesChecked, filesRedacted }));
