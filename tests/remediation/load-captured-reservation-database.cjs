// Preload existing, unchanged SQL suites against the captured hosted schema.
// All writes go to a brand-new loopback cluster containing synthetic users only.
const fs = require('node:fs');
const { fromCatalog } = require('./catalog-fixture.cjs');
const { output } = require('../../scripts/build-reservation-upgrade.cjs');
const database = require('./database.cjs');
if (!process.env.RESERVATION_SCHEMA_CAPTURE) throw new Error('An explicit read-only catalog capture is required');
const document = JSON.parse(fs.readFileSync(process.env.RESERVATION_SCHEMA_CAPTURE,'utf8').replace(/^\uFEFF/,''));
database.startDatabase = async (options = {}) => {
  if (Object.keys(options).length) throw new Error('This fixture supports only the complete focused upgrade');
  const db = await fromCatalog(document.rows[0].catalog);
  try { await db.exec(fs.readFileSync(output,'utf8')); return db; }
  catch (error) { await db.close(); throw error; }
};
