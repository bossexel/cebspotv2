// Exact hosted postcheck, executed only on a disposable local database.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {fromCatalog}=require('./catalog-fixture.cjs');
async function main(){
  if(!process.env.RESERVATION_SCHEMA_CAPTURE)throw new Error('Local schema capture required');
  const document=JSON.parse(fs.readFileSync(process.env.RESERVATION_SCHEMA_CAPTURE,'utf8').replace(/^\uFEFF/,''));
  const db=await fromCatalog(document.rows[0].catalog);
  try{
    // The captured catalog covers public only; supply the existing Storage
    // platform bucket as a synthetic fixture, then verify migration privacy.
    await db.exec("insert into storage.buckets(id,name,public) values('payment-proofs','payment-proofs',true)");
    for(const file of ['20261101192553_align_reservation_backend.sql','20261102070521_reservation_private_upload_dependencies.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    const result=await db.query(fs.readFileSync('supabase/verification/reservation-upload-postcheck.sql','utf8'));
    const row=result.find(r=>r.rows?.[0]?.postcheck)?.rows[0].postcheck;
    assert.ok(row);
    for(const key of ['dependency_tables_present','dependency_tables_rls','client_direct_writes_blocked','private_rpcs_service_only','payment_proofs_private'])assert.equal(row[key],true,key);
    assert.equal(row.recovery_eligible_count,0);
    assert.equal(row.legacy_manual_review_count,0);
    console.log('Exact upload postcheck executed with all local assertions passing.');
  }finally{await db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
