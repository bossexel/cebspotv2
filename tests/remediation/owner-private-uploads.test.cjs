const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
let db,draft,path,submitted;
before(async()=>{db=await startDatabase();await seed(db);});
after(async()=>db?.close());
const draftFor=async(email)=> (await db.query('select (create_owner_application_draft($1)).*',[email])).rows[0];
const payload=()=>({contact_name:'Synthetic Applicant',contact_email:draft.business_email,contact_phone:'09171234567',
  spot_name:'Synthetic application',spot_address:'Synthetic fixture address',category:'Cafe',
  access_needs:['Reservations'],verification_documents:[path],message:'Synthetic test only'});
const submit=async(body=payload(),id=draft.id)=>(await db.query('select (submit_owner_application($1,$2)).*',[id,JSON.stringify(body)])).rows[0];
const store=async(name,metadata={mimetype:'image/png',size:20},created=new Date())=>{
  await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,metadata,created_at) values('owner-verification-documents',$1,$2,$3)",[name,JSON.stringify(metadata),created]);
};
test('anonymous applications and document metadata cannot bypass authenticated admission',async()=>{
  await db.as(null,db,'anon');
  await assert.rejects(draftFor('business@fixture.example.test'),/permission denied/);
  await assert.rejects(db.query("insert into owner_access_requests(contact_name,contact_email,spot_name,spot_address,category) values('Forged','x@fixture.test','Forged','Address','Cafe')"),/permission denied/);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('owner-verification-documents','anonymous.png')"),/row-level security/);
});
test('draft is server-owned, reused for retries, and invisible to other customers/owners',async()=>{
  await db.as(ids.a);draft=await draftFor('business@fixture.example.test');
  assert.equal(draft.requester_id,ids.a);assert.equal(draft.expires_at-draft.created_at,1800000);
  assert.equal((await draftFor(draft.business_email)).id,draft.id);
  for(const actor of [ids.b,ids.owner,ids.other,ids.admin]) {
    await db.as(actor);assert.equal((await db.query('select id from owner_application_drafts where id=$1',[draft.id])).rows.length,0);
    await assert.rejects(submit(),/Owned application/);
  }
  path=`${ids.a}/${draft.id}/${randomUUID()}.png`;await store(path);
});
test('only service role may claim an upload, tied to the owned request and active deadline',async()=>{
  await db.as(ids.a);await assert.rejects(db.query('select claim_private_upload($1,$2,$3)',[ids.a,'owner_document',draft.id]),/permission denied/);
  await db.as(null,db,'service_role');
  await assert.rejects(db.query('select claim_private_upload($1,$2,$3)',[ids.b,'owner_document',draft.id]),/unavailable/);
  assert.equal((await db.query('select claim_private_upload($1,$2,$3) result',[ids.a,'owner_document',draft.id])).rows[0].result.allowed,true);
});
test('private document read is limited to requester and reviewing administrator even with permissive overlap',async()=>{
  await db.exec('reset role');await db.exec('create policy legacy_upload_allow_all on storage.objects for all using(true) with check(true)');
  for(const [actor,visible] of [[null,false],[ids.a,true],[ids.b,false],[ids.owner,false],[ids.other,false],[ids.admin,false]]) {
    await db.as(actor,db,actor?'authenticated':'anon');
    assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,Number(visible));
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('owner-verification-documents',$1)",[`${ids.a}/${draft.id}/${randomUUID()}.png`]),/row-level security/);
  }
});
test('application rejects missing, foreign, oversized or unsupported documents and invalid contacts',async()=>{
  const bad=[];
  for(const [metadata,suffix] of [[{mimetype:'text/html',size:20},'png'],[{mimetype:'image/png',size:5242881},'png']]) {
    const file=`${ids.a}/${draft.id}/${randomUUID()}.${suffix}`;await store(file,metadata);bad.push(file);
  }
  await db.as(ids.a);
  for(const file of [...bad,`${ids.b}/${draft.id}/${randomUUID()}.png`,'https://fixture.invalid/proof.png']) await assert.rejects(submit({...payload(),verification_documents:[file]}),/Verification document/);
  await assert.rejects(submit({...payload(),contact_phone:'123'}),/contact phone/);
  await assert.rejects(submit({...payload(),verification_documents:[path,path]}),/verification files/);
  await assert.rejects(submit({...payload(),access_needs:['Administrator']}),/verification files/);
});
test('protected application submission is idempotent; admin can review linked documents only',async()=>{
  await db.as(ids.a);submitted=await submit();assert.equal(submitted.id,draft.id);assert.equal(submitted.requester_id,ids.a);assert.equal(submitted.status,'pending');
  assert.equal((await submit()).id,submitted.id);
  await assert.rejects(db.query("update owner_access_requests set status='approved' where id=$1",[draft.id]),/permission denied/);
  await db.as(ids.admin);assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,1);
  await db.as(null,db,'service_role');await assert.rejects(db.query('select claim_private_upload($1,$2,$3)',[ids.a,'owner_document',draft.id]),/unavailable/);
});
test('concurrent upload admission cannot exceed per-resource or per-user limits',async()=>{
  await db.as(ids.b);const drafts=[];for(let i=0;i<3;i++)drafts.push(await draftFor(`quota-${i}@fixture.example.test`));
  async function claim(id){const c=await db.connect();try{await db.as(null,c,'service_role');return (await c.query('select claim_private_upload($1,$2,$3) result',[ids.b,'owner_document',id])).rows[0].result;}finally{await c.end();}}
  const first=await Promise.all(Array.from({length:9},()=>claim(drafts[0].id)));assert.equal(first.filter(x=>x.allowed).length,5);
  const second=await Promise.all(Array.from({length:12},(_,i)=>claim(drafts[1+i%2].id)));assert.equal(second.filter(x=>x.allowed).length,5);
  assert.ok([...first,...second].filter(x=>!x.allowed).every(x=>x.retry_after>=1 && x.retry_after<=3600));
});
test('expired drafts and abandoned reservation holds cannot admit uploads',async()=>{
  await db.as(ids.other);const d=await draftFor('expired@fixture.example.test');
  await db.as(ids.a);const reservation=await booking(db);
  await db.exec('reset role');await db.query("update owner_application_drafts set expires_at=now()-interval '1 second' where id=$1",[d.id]);
  await db.query("update reservations set hold_expires_at=now()-interval '1 second' where id=$1",[reservation.id]);
  await db.as(ids.other);await assert.rejects(submit({...payload(),contact_email:d.business_email},d.id),/expired/);
  await db.as(null,db,'service_role');
  for(const [actor,kind,id] of [[ids.other,'owner_document',d.id],[ids.a,'reservation_proof',reservation.id]]) await assert.rejects(db.query('select claim_private_upload($1,$2,$3)',[actor,kind,id]),/unavailable/);
});
test('competing business applications cannot create duplicate pending requests',async()=>{
  const email='competing@fixture.example.test';const attempts=[];
  for(const actor of [ids.b,ids.other]){
    await db.as(actor);const d=await draftFor(email);const file=`${actor}/${d.id}/${randomUUID()}.png`;await store(file);
    attempts.push({actor,d,body:{...payload(),contact_email:email,verification_documents:[file]}});
  }
  const outcomes=await Promise.allSettled(attempts.map(async({actor,d,body})=>{
    const c=await db.connect();try{await db.as(actor,c);return await c.query('select submit_owner_application($1,$2)',[d.id,JSON.stringify(body)]);}finally{await c.end();}
  }));
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  assert.match(outcomes.find(o=>o.status==='rejected').reason.message,/This business email cannot be used for an owner request/);
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from owner_access_requests where contact_email=$1 and status='pending'",[email])).rows[0].n,1);
});
test('orphan cleanup is server-only and preserves linked documents while bounding batches',async()=>{
  await db.exec('reset role');await db.query("update storage.objects set created_at=now()-interval '2 days' where name=$1",[path]);
  const orphan=`${ids.a}/${draft.id}/${randomUUID()}.pdf`;await store(orphan,{mimetype:'application/pdf',size:20},new Date(Date.now()-172800000));
  await db.as(ids.admin);await assert.rejects(db.query('select * from list_expired_private_uploads(100)'),/permission denied/);
  await db.as(null,db,'service_role');const rows=(await db.query('select * from list_expired_private_uploads(100)')).rows;
  assert.ok(rows.some(r=>r.object_name===orphan));assert.ok(!rows.some(r=>r.object_name===path));assert.ok(rows.length<=50);
});
