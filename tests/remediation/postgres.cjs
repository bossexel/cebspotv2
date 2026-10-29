// Optional real multi-session database for the walk-in integration tests.
// Installs stay outside application dependencies. Every run creates a new local
// cluster, binds only to loopback, and stops it in the test cleanup hook.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const { execFileSync, spawn } = require('node:child_process');

exports.startPostgres = async function startPostgres(root) {
  const packages = process.env.WALK_IN_PG_PACKAGES || path.join(root, '.codex-tmp/walk-in-validation/node_modules');
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const binaries = await import(pathToFileURL(path.join(packages, `@embedded-postgres/${platform}-${process.arch}/dist/index.js`)).href);
  const { Client } = require(path.join(packages, 'pg'));
  fs.mkdirSync(path.join(root, '.codex-tmp/walk-in-validation'), { recursive: true });
  const data = fs.mkdtempSync(path.join(root, '.codex-tmp/walk-in-validation/pg-data-'));
  const port = await new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
  execFileSync(binaries.initdb, ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8'], { windowsHide: true, stdio: 'pipe' });
  const serverProcess = spawn(binaries.postgres, ['-D', data, '-h', '127.0.0.1', '-p', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  serverProcess.stderr.on('data', chunk => { log += chunk; });
  const config = { host: '127.0.0.1', port, user: 'postgres', database: 'postgres', connectionTimeoutMillis: 500, query_timeout: 10000 };
  let client;
  for (let attempt = 0; attempt < 100; attempt++) {
    client = new Client(config);
    try { await client.connect(); break; }
    catch { await client.end().catch(() => {}); client = null; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!client) {
    serverProcess.kill();
    throw new Error(`Local PostgreSQL did not start: ${log}`);
  }
  return {
    query: (sql, parameters) => client.query(sql, parameters),
    exec: sql => client.query(sql),
    async connect() { const connection = new Client({ ...config, connectionTimeoutMillis: 5000 }); await connection.connect(); return connection; },
    async close() {
      await client.end();
      execFileSync(binaries.pg_ctl, ['-D', data, '-m', 'fast', '-w', 'stop'], { windowsHide: true, stdio: 'pipe' });
    },
  };
};
