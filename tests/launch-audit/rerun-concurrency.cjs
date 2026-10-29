// Fresh loopback PostgreSQL only; applies the complete current migration chain.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { startDatabase } = require('../remediation/database.cjs');
const { seed, booking } = require('../remediation/fixtures.cjs');
async function main() {
  const db = await startDatabase(); const clients = []; const actors = [];
  try {
    await seed(db);
    for (let i = 0; i < 50; i++) {
      const id = randomUUID(); actors.push(id);
      await db.exec('reset role');
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, `race-${id}@fixture.example.test`]);
      const client = await db.connect(); clients.push(client); await db.as(id, client);
    }
    const started = performance.now();
    const outcomes = await Promise.all(clients.map(async (client, i) => {
      const begin = performance.now();
      try { const row = await booking(client, { user_id: actors[i] }); return { accepted: true, ms: performance.now() - begin, rowId: row.id }; }
      catch (error) { return { accepted: false, ms: performance.now() - begin, code: error.code, message: error.message }; }
    }));
    const durationMs = performance.now() - started;
    await db.exec('reset role');
    const stored = (await db.query('select count(*)::int n from reservations')).rows[0].n;
    const timings = outcomes.map(o => o.ms).sort((a,b) => a-b);
    const report = {
      kind: '50-distinct-users-complete-migrations-loopback-sql-race', runAt: new Date().toISOString(),
      migrationCount: db.manifest.length, migrations: db.manifest,
      accepted: outcomes.filter(o => o.accepted).length, rejected: outcomes.filter(o => !o.accepted).length,
      storedRows: stored, durationMs: Math.round(durationMs), p95WriteLatencyMs: Math.round(timings[Math.ceil(timings.length * .95)-1]),
      rejectionCodes: [...new Set(outcomes.filter(o => !o.accepted).map(o => o.code))],
      rejectionMessages: [...new Set(outcomes.filter(o => !o.accepted).map(o => o.message))],
      limitations: 'Connections initialized sequentially before the measured race. Not API/HTTP/Auth/provider load, sustained throughput, matching hosted PostgreSQL version, or production capacity.',
    };
    const out = path.join(__dirname, 'evidence/2026-10-29-rerun'); fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out, 'booking-race.json'), JSON.stringify(report, null, 2) + '\n');
    assert.equal(report.accepted, 1); assert.equal(report.rejected, 49); assert.equal(stored, 1);
    console.log(JSON.stringify({ ...report, migrations: undefined }, null, 2));
  } finally { for (const client of clients) await client.end(); await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
