// Execute the deployment's exact read-only queries on a disposable local cluster.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { fromCatalog } = require('./catalog-fixture.cjs');
const { seed } = require('./fixtures.cjs');
async function main() {
  const capture = process.env.RESERVATION_SCHEMA_CAPTURE;
  if (!capture) throw new Error('Local catalog capture required');
  const document = JSON.parse(fs.readFileSync(capture, 'utf8').replace(/^\uFEFF/, ''));
  const db = await fromCatalog(document.rows[0].catalog);
  try {
    await db.exec(fs.readFileSync('supabase/migrations/20261101192553_align_reservation_backend.sql','utf8'));
    await seed(db, { confirm: false });
    for (const [file, field] of [
      ['reservation-upgrade-preflight.sql','preflight'],
      ['reservation-upgrade-postcheck.sql','postcheck'],
      ['reservation-anonymous-read-check.sql','anonymous_check'],
    ]) {
      const results = await db.query(fs.readFileSync('supabase/verification/'+file,'utf8'));
      const row = results.find(result => result.rows?.[0]?.[field])?.rows[0][field];
      assert.ok(row, file+' must return its expected aggregate');
      if (field==='postcheck') for (const key of ['walk_in_visits','venue_table_states','availability_rpc','verified_inventory_column','hold_expiry_column','payment_idempotency_column','financial_resolution_column','payment_webhook_events','payment_session_retirements','private_event_guard','new_tables_have_rls','walk_in_direct_insert_blocked','table_state_direct_insert_blocked','anonymous_availability_execute']) assert.equal(row[key],true,key);
      if (field==='anonymous_check') assert.equal(row.private_event_rows_visible,0);
      console.log(file+': read-only execution and assertions passed');
    }
  } finally { await db.close(); }
}
main().catch(error => {console.error(error.message);process.exitCode=1;});
