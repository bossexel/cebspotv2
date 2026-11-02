const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {fromCatalog}=require('./catalog-fixture.cjs');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
const {build,output}=require('../../scripts/build-reservation-upload-dependencies.cjs');
const sql=fs.readFileSync(output,'utf8');
test('reservation proof dependency migration matches original source extraction',()=>assert.equal(sql,build().sql));
async function exercise(db,t){
  try{
    await seed(db);await db.as(ids.a);const reservation=await booking(db);
    await db.exec('reset role');
    const oldGuard=(await db.query("select pg_get_functiondef('public.require_active_account()'::regprocedure) body")).rows[0].body;
    const oldClaim=(await db.query("select pg_get_functiondef(to_regprocedure('public.claim_private_upload(uuid,text,uuid)')) body")).rows[0].body;
    const before=(await db.query('select to_jsonb(r) body from reservations r where id=$1',[reservation.id])).rows[0].body;
    await t.test('install and rerun preserve existing records and installed guard implementations',async()=>{
      await db.exec(sql);await db.exec(sql);
      assert.deepEqual((await db.query('select to_jsonb(r) body from reservations r where id=$1',[reservation.id])).rows[0].body,before);
      assert.equal((await db.query("select pg_get_functiondef('public.require_active_account()'::regprocedure) body")).rows[0].body,oldGuard);
      if(oldClaim)assert.equal((await db.query("select pg_get_functiondef('public.claim_private_upload(uuid,text,uuid)'::regprocedure) body")).rows[0].body,oldClaim);
    });
    await t.test('all client roles are denied admission and cleanup RPCs',async()=>{
      for(const id of [null,ids.a,ids.b,ids.owner,ids.other,ids.admin]){
        await db.as(id,db,id?'authenticated':'anon');
        await assert.rejects(db.query("select claim_private_upload($1,'reservation_proof',$2)",[ids.a,reservation.id]),/permission denied/);
        await assert.rejects(db.query('select * from list_expired_private_uploads(10)'),/permission denied/);
      }
    });
    await t.test('owned active proof admission, user isolation and persistent quota',async()=>{
      await db.as(null,db,'service_role');
      await assert.rejects(db.query("select claim_private_upload($1,'reservation_proof',$2)",[ids.b,reservation.id]),/unavailable/);
      for(let i=0;i<5;i++)assert.equal((await db.query("select claim_private_upload($1,'reservation_proof',$2) value",[ids.a,reservation.id])).rows[0].value.allowed,true);
      assert.equal((await db.query("select claim_private_upload($1,'reservation_proof',$2) value",[ids.a,reservation.id])).rows[0].value.allowed,false);
      assert.equal((await db.query('select count(*)::int n from private_upload_admissions')).rows[0].n,5);
      assert.equal((await db.query('select account_is_active($1) active',[ids.a])).rows[0].active,true);
      await db.query('insert into account_deletion_requests(user_id) values($1)',[ids.b]);
      assert.equal((await db.query('select account_is_active($1) active',[ids.b])).rows[0].active,false);
    });
    await t.test('cleanup selects old unattached proof only and cannot delete records itself',async()=>{
      await db.exec('reset role');
      const orphan=`${ids.a}/${reservation.id}/11111111-1111-4111-8111-111111111111.png`;
      const attached=`${ids.a}/${reservation.id}/22222222-2222-4222-8222-222222222222.png`;
      await db.query("insert into storage.buckets(id,name) values('payment-proofs','payment-proofs') on conflict do nothing");
      await db.query("insert into storage.objects(bucket_id,name,created_at) values('payment-proofs',$1,now()-interval '2 days'),('payment-proofs',$2,now()-interval '2 days')",[orphan,attached]);
      await db.query('update reservations set payment_proof_url=$1 where id=$2',[attached,reservation.id]);
      await db.as(null,db,'service_role');
      assert.deepEqual((await db.query('select * from list_expired_private_uploads(50)')).rows,[{bucket_id:'payment-proofs',object_name:orphan}]);
      assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,2);
    });
  }finally{await db.close();}
}
test('proof dependency upgrade on fresh full-chain installation',async t=>exercise(await startDatabase({through:'20261101192553_align_reservation_backend.sql'}),t));
const capture=process.env.RESERVATION_SCHEMA_CAPTURE;
test('proof dependency upgrade on captured hosted public schema plus booking alignment',{skip:!capture},async t=>{
  const document=JSON.parse(fs.readFileSync(capture,'utf8').replace(/^\uFEFF/,''));
  const db=await fromCatalog(document.rows[0].catalog);
  try{await db.exec(fs.readFileSync('supabase/migrations/20261101192553_align_reservation_backend.sql','utf8'));}
  catch(error){await db.close();throw error;}
  await exercise(db,t);
});
