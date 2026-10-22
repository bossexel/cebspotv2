'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { root } = require('./config.cjs');
const dir = path.join(root, 'tests/performance/evidence'); fs.mkdirSync(dir, { recursive: true });
for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith('.cjs'))) {
  const checked = spawnSync(process.execPath, ['--check', path.join(__dirname, file)], { encoding: 'utf8', timeout: 10000 });
  if (checked.status !== 0) throw Error('Syntax check failed: ' + file);
}
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/performance/isolated/suite.test.cjs'], { cwd: root, encoding: 'utf8', timeout: 120000 });
fs.writeFileSync(path.join(dir, 'suite-final.tap'), (run.stdout || '') + (run.stderr || ''));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'app', 'src', 'supabase', 'tests/backend', 'tests/performance/isolated', '*.sql', 'package.json', 'package-lock.json', 'app.json', 'app.config.js', 'eas.json', 'render.yaml'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
fs.writeFileSync(path.join(dir, 'source-final.json'), JSON.stringify([...new Set(files)].filter(f => fs.existsSync(path.join(root, f))).sort().map(file => ({ file,
  sha256: createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') })), null, 2));
console.log(JSON.stringify({ exitCode: run.status, summary: run.stdout.split(/\r?\n/).filter(line => /^# (tests|pass|fail|duration_ms) /.test(line)) }));
process.exitCode = run.status ?? 1;
