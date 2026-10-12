const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
let db,reservation,circle;
before(async()=>{db=await startDatabase();await seed(db);});
after(async()=>db?.close());
const server=()=>db.as(null,db,'service_role');
test('account erasure RPCs are service-only for all client roles',async()=>{
 for(const id of [null,ids.a,ids.b,ids.owner,ids.other,ids.admin]){
  await db.as(id,db,id?'authenticated':'anon');
  await assert.rejects(db.query('select begin_account_deletion($1)',[ids.a]),/permission denied/);
  await assert.rejects(db.query('select erase_account_personal_data($1)',[ids.a]),/permission denied/);
 }
});
test('assigned owners/admins and active reservations block deletion without changing data',async()=>{
 await server();for(const id of [ids.owner,ids.admin])await assert.rejects(db.query('select begin_account_deletion($1)',[id]),/Transfer venue/);
 await db.as(ids.a);reservation=await booking(db);
 await server();await assert.rejects(db.query('select begin_account_deletion($1)',[ids.a]),/Close active bookings/);
 assert.equal((await db.query('select count(*)::int n from account_deletion_requests')).rows[0].n,0);
 await db.query("update reservations set status='cancelled',payment_status='failed' where id=$1",[reservation.id]);
 await db.query("update reservations set financial_resolution='resolution_required',refund_status='pending_review' where id=$1",[reservation.id]);
 await assert.rejects(db.query('select begin_account_deletion($1)',[ids.a]),/resolve pending/);
 await db.query("update reservations set financial_resolution=null,refund_status='not_applicable' where id=$1",[reservation.id]);
});
test('deletion freezes old sessions, stops sharing and transfers circle ownership',async()=>{
 await server();await db.query("insert into reservation_payments(reservation_id,user_id,spot_id,provider,payment_method,amount,currency,status,attempt_state,provider_payment_id,paid_at,raw_payload,checkout_request) values($1,$2,$3,'paymongo','gcash',150,'PHP','paid','complete','synthetic-retained-payment',now(),'{\"billing\":\"synthetic private data\"}','{\"private\":true}')",[reservation.id,ids.a,ids.venue]);
 await db.as(ids.a);circle=(await db.query("insert into circles(name,owner_id,members) values('Synthetic circle',$1,array[$1::uuid]) returning id",[ids.a])).rows[0].id;
 const code=(await db.query('select * from get_or_create_circle_invite_code($1)',[circle])).rows[0].code;
 await db.as(ids.b);await db.query('select join_circle_by_code($1)',[code]);await db.as(ids.a);
 await db.query('select set_circle_location_sharing(true)');
 await server();const first=(await db.query('select (begin_account_deletion($1)).*',[ids.a])).rows[0];
 const second=(await db.query('select (begin_account_deletion($1)).*',[ids.a])).rows[0];assert.equal(first.erase_after.valueOf(),second.erase_after.valueOf());
 assert.deepEqual((await db.query('select members,owner_id from circles where id=$1',[circle])).rows[0],{members:[ids.b],owner_id:ids.b});
 assert.equal((await db.query('select enabled from circle_location_shares where user_id=$1',[ids.a])).rows[0].enabled,false);
 await db.as(ids.a);assert.equal((await db.query('select * from profiles')).rows.length,0);
 await assert.rejects(db.query('select get_circle_members($1)',[circle]),/deletion in progress/);
 await assert.rejects(db.query('select join_circle_by_code($1)',['ABC123']),/deletion in progress/);
 assert.equal((await db.query("update profiles set display_name='Resurrected' where id=$1",[ids.a])).rowCount,0);
});
test('bounded quiescence and file cleanup prevent premature Auth deletion',async()=>{
 await server();await assert.rejects(db.query('select erase_account_personal_data($1)',[ids.a]),/in-flight/);
 await db.query("insert into storage.objects(bucket_id,name,owner_id) values('payment-proofs',$1,$2)",[`${ids.a}/${reservation.id}/synthetic.png`,ids.a]);
 await db.query("update account_deletion_requests set erase_after=now()-interval '1 second' where user_id=$1",[ids.a]);
 await db.query('select erase_account_personal_data($1)',[ids.a]);
 await assert.rejects(db.query('select ready_account_deletion($1)',[ids.a]),/file cleanup/);
 assert.equal((await db.query('select * from account_deletion_files($1)',[ids.a])).rows.length,1);
});
test('personal data is removed while financial identifiers/amounts/dates survive; retries are idempotent',async()=>{
 await server();await db.query('select erase_account_personal_data($1)',[ids.a]);
 const r=(await db.query('select * from reservations where id=$1',[reservation.id])).rows[0];
 assert.equal(r.user_id,null);assert.equal(r.guest_name,null);assert.equal(r.guest_email,null);assert.equal(r.guest_phone,null);assert.equal(r.payment_reference,null);
 assert.equal(Number(r.fee),150);assert.equal(r.status,'cancelled');assert.ok(r.created_at);
 const payment=(await db.query('select * from reservation_payments where reservation_id=$1',[reservation.id])).rows[0];
 assert.equal(payment.user_id,null);assert.deepEqual(payment.raw_payload,{});assert.equal(payment.checkout_request,null);assert.equal(payment.provider_payment_id,'synthetic-retained-payment');assert.equal(Number(payment.amount),150);assert.ok(payment.paid_at);
 // Simulates Storage API success against the synthetic storage contract only.
 await db.query('delete from storage.objects where owner_id=$1',[ids.a]);await db.query('select ready_account_deletion($1)',[ids.a]);
 // Simulates auth.admin.deleteUser against the synthetic Auth contract only.
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[ids.a]);
 assert.equal((await db.query('select id from profiles where id=$1',[ids.a])).rows.length,0);
 assert.equal((await db.query('select id from reservations where id=$1',[reservation.id])).rows.length,1);
 await db.as(ids.a);assert.equal((await db.query('select * from spots')).rows.length,0);
 await assert.rejects(db.query('select join_circle_by_code($1)',['ABC123']),/deletion in progress/);
});
test('a booking queued behind deletion cannot recreate customer data',async()=>{
 const customer='30000000-0000-4000-8000-000000000007';await server();await db.exec('reset role');await db.query("insert into auth.users(id,email) values($1,'race@synthetic.example.test')",[customer]);
 const deleting=await db.connect(),creating=await db.connect();
 try {
  await db.as(null,deleting,'service_role');await deleting.query('begin');await deleting.query('select begin_account_deletion($1)',[customer]);
  await db.as(customer,creating);const attempt=booking({query:(...args)=>creating.query(...args)},{user_id:customer});
  // The statement has begun while deletion holds the authoritative venue lock.
  const outcome=attempt.then(value=>({value}),error=>({error}));
  await new Promise(resolve=>setTimeout(resolve,75));await deleting.query('commit');
  assert.match((await outcome).error?.message??'',/deletion in progress|Account unavailable|row-level security/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from reservations where user_id=$1',[customer])).rows[0].n,0);
 }finally{await deleting.query('rollback').catch(()=>{});await deleting.end();await creating.end();}
});
