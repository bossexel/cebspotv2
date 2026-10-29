// Exercise the focused migration against the documented older beta contract,
// without installing booking, payment or account-erasure overhaul migrations.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startDatabase } = require('./database.cjs');
const { ids, seed, booking } = require('./fixtures.cjs');
let db, submission, post, commerceBefore, guardBefore;
const migration = fs.readFileSync('supabase/migrations/20261030000100_activity_post_votes.sql','utf8');
before(async () => {
  db = await startDatabase({through:'20261006000100_audit_authorization_hardening.sql'});
  for (const name of ['20261013000700_circle_location_controls.sql',
    '20261027000100_independent_spot_posts.sql','20261028000100_beta_identity_prerequisites.sql']) {
    await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  }
  await seed(db,{confirm:false,fee:150});
  await booking(db);
  commerceBefore=(await db.query('select * from reservations order by id')).rows;
  guardBefore=(await db.query("select pg_get_functiondef('require_active_account()'::regprocedure) definition")).rows[0].definition;
  await db.as(ids.a);
  submission=(await db.query(`insert into spot_submissions(name,category,address,latitude,longitude,
    submitter_id) values('Legacy synthetic cafe','Cafe','Fixture',10.3,123.9,$1) returning id`,[ids.a])).rows[0].id;
  await db.exec('reset role');
  await db.query("update spot_submissions set status='approved' where id=$1",[submission]);
  post=(await db.query("update local_updates set source_type='community' where source_id=$1 returning *",[submission])).rows[0];
  await db.as(ids.b);
  assert.equal((await db.query('select * from vote_on_spot_submission($1,$2)',[submission,'up'])).rows[0].vote_count,1);
  assert.equal((await db.query('select spot_count from local_updates where id=$1',[post.id])).rows[0].spot_count,0);
  await db.exec('reset role');
  await db.exec(migration);
});
after(async () => { await db?.close(); });

test('focused upgrade supports historical likes on the older beta without replacing its account guard',async () => {
  const guard=(await db.query("select pg_get_functiondef('require_active_account()'::regprocedure) definition")).rows[0].definition;
  assert.equal(guard,guardBefore);
  assert.equal((await db.query("select to_regclass('account_deletion_requests') name")).rows[0].name,null);
  assert.deepEqual((await db.query('select * from reservations order by id')).rows,commerceBefore);
  assert.equal((await db.query('select spot_count from local_updates where id=$1',[post.id])).rows[0].spot_count,1,
    'upgrade repairs the historical displayed counter from preserved votes');
  await db.as(ids.b);
  assert.equal((await db.query('select * from toggle_spot_submission_vote($1)',[submission])).rows[0].vote_count,0);
  assert.equal((await db.query('select spot_count from local_updates where id=$1',[post.id])).rows[0].spot_count,0);
  const relike=(await db.query('select * from toggle_spot_submission_vote($1)',[submission])).rows[0];
  assert.equal(relike.vote_count,1);
  assert.equal(relike.voted,true);
  assert.equal((await db.query('select * from toggle_spot_submission_vote($1)',[submission])).rows[0].voted,false);
});

test('older beta still requires a confirmed account and does not enable orphaned content',async () => {
  await db.exec('reset role');
  const unconfirmed='30000000-1111-4000-8000-000000000001';
  await db.query('insert into auth.users(id,email) values($1,$2)',[unconfirmed,'unconfirmed@fixture.test']);
  await db.as(unconfirmed);
  await assert.rejects(db.query('select * from toggle_spot_submission_vote($1)',[submission]),/confirmed signed-in account/);
  await db.exec('reset role');
  await db.query('delete from local_updates where id=$1',[post.id]);
  await db.as(ids.b);
  await assert.rejects(db.query('select * from toggle_spot_submission_vote($1)',[submission]),/unavailable/);
  assert.equal((await db.query('select count(*)::int n from spot_submission_votes where submission_id=$1',[submission])).rows[0].n,0);
});
