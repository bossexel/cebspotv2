'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('./config.cjs');
const dir = path.join(root, 'tests/performance/evidence'); fs.mkdirSync(dir, { recursive: true });
const check = spawnSync(process.execPath, ['scripts/build-map.cjs', '--check'], { cwd: root, encoding: 'utf8', timeout: 30000 });
if (check.status !== 0) throw Error('Map bundle check failed');
const cli = require.resolve('@playwright/test/cli');
const args = [cli, 'test', '--config', 'playwright.map.config.cjs', '--reporter=json'];
if (process.argv[2]) args.push('--grep', process.argv[2]);
const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 300000, maxBuffer: 5e6 });
const name = 'map-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
fs.writeFileSync(path.join(dir, name), run.stdout || '{}');
try {
  const report = JSON.parse(run.stdout);
  console.log(JSON.stringify({ evidence: name, exitCode: run.status, stats: report.stats }));
} catch { console.log(JSON.stringify({ evidence: name, exitCode: run.status, status: 'INCONCLUSIVE', reason: 'Browser runner did not produce JSON' })); }
process.exitCode = run.status ?? 1;
