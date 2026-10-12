// Run local verification with a sanitized, retained command record.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const [label, executable, ...args] = process.argv.slice(2);
if (!label || !/^[a-z0-9-]+$/.test(label) || !executable) throw new Error('Usage: node scripts/remediation-check.cjs label executable [args...]');
const secrets = [];
for (const name of ['.env.local', '.env.test.local', '.env.perf.local']) {
  if (!fs.existsSync(path.join(root, name))) continue;
  for (const line of fs.readFileSync(path.join(root, name), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (match && /SECRET|PASSWORD|SERVICE_ROLE|TOKEN/.test(match[1])) {
      const value = match[2].replace(/^['"]|['"]$/g, '');
      if (value.length >= 8) secrets.push(value);
    }
  }
}
const sanitize = text => secrets.reduce((result, secret) => result.split(secret).join('[REDACTED]'), text)
  .replace(/\b(?:sk_live_|sk_test_|whsk_)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_PROVIDER_KEY]')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
const startedAt = new Date().toISOString();
// Invoke npm through its JS entry so Windows .cmd shell quoting is unnecessary.
const command = executable === 'npm' ? process.execPath : executable;
const commandArgs = executable === 'npm' ? [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args] : args;
const child = spawn(command, commandArgs, { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk.toString(); });
child.on('error', error => { output += `\n${error.message}`; });
child.on('close', code => {
  const clean = sanitize(output);
  const dir = path.join(root, 'tests/remediation/evidence/commands');
  fs.mkdirSync(dir, { recursive: true });
  const report = { label, command: [executable, ...args].map(sanitize), startedAt, finishedAt: new Date().toISOString(), exitCode: code, output: clean };
  fs.writeFileSync(path.join(dir, `${label}.json`), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(clean);
  process.exitCode = code ?? 1;
});
