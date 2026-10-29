const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startDatabase } = require('./database.cjs');
const id = n => `30000000-1234-4000-8000-${String(n).padStart(12,'0')}`;
const [author,bob,carol,erasing] = [id(1),id(2),id(3),id(4)];
const migration = fs.readFileSync('supabase/migrations/20261030000100_activity_post_votes.sql','utf8');
let db, historical, historicalPost, modern, modernPost, rejected;
async function submit() {
  await db.as(author);
  const s = (await db.query(`insert into spot_submissions(name,description,category,address,
    latitude,longitude,images,submitter_id) values('Synthetic Cafe','Caption remains intact',
    'Cafe','Fixture',10.3,123.9,ARRAY['synthetic.jpg'],$1) returning id`,[author])).rows[0].id;
  const p = (await db.query('select * from local_updates where source_id=$1',[s])).rows[0];
  return [s,p];
}
before(async () => {
  db = await startDatabase({through:'20261028000100_beta_identity_prerequisites.sql'});
  for (const user of [author,bob,carol,erasing]) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@fixture.test`]);
  }
  [historical,historicalPost] = await submit();
  await db.exec('reset role');
  await db.query("update spot_submissions set status='approved' where id=$1",[historical]);
  await db.query("update local_updates set source_type='community' where id=$1",[historicalPost.id]);
  await db.query(`insert into local_update_comments(local_update_id,user_id,user_name,body)
    values($1,$2,'Bob','Preserve this thread')`,[historicalPost.id,bob]);
  // Demonstrate the pre-upgrade database defect: the vote is persisted but the
  // historical post's displayed counter is left unchanged.
  await db.as(bob);
  assert.equal((await db.query('select * from vote_on_spot_submission($1,$2)',[historical,'up'])).rows[0].vote_count,1);
  assert.equal((await db.query('select spot_count from local_updates where id=$1',[historicalPost.id])).rows[0].spot_count,0);
  await db.exec('reset role');
  await db.exec(migration);
  await db.exec(migration); // Reapplying this focused upgrade is safe.
  [modern,modernPost] = await submit();
  [rejected] = await submit();
  await db.exec('reset role');
  await db.query("update spot_submissions set status='rejected' where id=$1",[rejected]);
  await db.query('insert into account_deletion_requests(user_id) values($1)',[erasing]);
});
after(async () => { await db?.close(); });

test('upgrade retains the original like, author, caption, media, post type and comment thread', async () => {
  await db.exec('reset role');
  const p = (await db.query('select * from local_updates where id=$1',[historicalPost.id])).rows[0];
  for (const key of ['id','user_id','body','created_at','media_urls']) assert.deepEqual(p[key],historicalPost[key]);
  assert.equal(p.source_type,'community');
  assert.equal((await db.query('select count(*)::int n from spot_submission_votes where submission_id=$1',[historical])).rows[0].n,1);
  assert.equal(p.spot_count,1);
  assert.equal((await db.query('select count(*)::int n from local_update_comments where local_update_id=$1',[p.id])).rows[0].n,1);
});

test('historical post supports unlike, like and current counters through both installed-client RPCs', async () => {
  await db.as(bob);
  const unlike = (await db.query('select * from toggle_spot_submission_vote($1)',[historical])).rows[0];
  assert.equal(unlike.voted,false);
  assert.equal(unlike.vote_count,0);
  await db.as(carol);
  const like = (await db.query('select * from vote_on_spot_submission($1,$2)',[historical,'up'])).rows[0];
  assert.equal(like.vote_count,1);
  assert.equal(like.vote_type,'up');
  assert.equal((await db.query('select spot_count from local_updates where id=$1',[historicalPost.id])).rows[0].spot_count,1);
  await db.exec('reset role');
  const notifications = (await db.query("select user_id,target_id from activities where type='spot_liked' and target_id=$1",[historical])).rows;
  assert.equal(notifications.length,2); // Original Bob like, then Carol like.
  assert.ok(notifications.every(n=>n.user_id===author && n.target_id===historical));
  await db.as(bob);
  assert.equal((await db.query("select id from activities where type='spot_liked' and target_id=$1",[historical])).rows.length,0);
  assert.equal((await db.query('select count(*)::int n from spot_submission_votes where submission_id=$1 and user_id=$2',[historical,carol])).rows[0].n,0,
    'a voter cannot read another user’s persisted selection');
});

test('new posts and authors own likes work without touching an unrelated historical post', async () => {
  await db.as(author);
  const first = (await db.query('select * from vote_on_spot_submission($1,$2)',[modern,'up'])).rows[0];
  assert.equal(first.vote_count,1);
  assert.equal((await db.query('select spot_count from local_updates where id=$1',[modernPost.id])).rows[0].spot_count,1);
  assert.equal((await db.query('select spot_count from local_updates where id=$1',[historicalPost.id])).rows[0].spot_count,1);
  await db.exec('reset role');
  assert.equal((await db.query("select id from activities where type='spot_liked' and target_id=$1",[modern])).rows.length,0);
});

test('anonymous, deleted-account, rejected and nonexistent post votes are rejected', async () => {
  await db.as(null,db,'anon');
  await assert.rejects(db.query('select * from toggle_spot_submission_vote($1)',[modern]),/permission denied/);
  await db.as(erasing);
  await assert.rejects(db.query('select * from vote_on_spot_submission($1,$2)',[modern,'up']),/Account deletion/);
  await db.as(bob);
  await assert.rejects(db.query(`insert into spot_submission_votes(submission_id,user_id,vote_type)
    values($1,$2,'up')`,[modern,bob]),/permission denied/);
  await assert.rejects(db.query('delete from spot_submission_votes where submission_id=$1',[historical]),/permission denied/);
  await assert.rejects(db.query("update spot_submission_votes set vote_type='down' where submission_id=$1",[historical]),/permission denied/);
  for (const source of [rejected,id(999)]) {
    await assert.rejects(db.query('select * from vote_on_spot_submission($1,$2)',[source,'up']),/unavailable/);
  }
  await assert.rejects(db.query('select * from vote_on_spot_submission($1,$2)',[modern,null]),/Vote type/);
});

test('vote direction changes preserve up/down totals and unrelated users votes', async () => {
  await db.as(bob);
  const down=(await db.query('select * from vote_on_spot_submission($1,$2)',[modern,'down'])).rows[0];
  assert.equal(down.up_count,1);
  assert.equal(down.down_count,1);
  assert.equal(down.vote_count,0);
  const up=(await db.query('select * from vote_on_spot_submission($1,$2)',[modern,'up'])).rows[0];
  assert.equal(up.up_count,2);
  assert.equal(up.down_count,0);
  const off=(await db.query('select * from vote_on_spot_submission($1,$2)',[modern,'up'])).rows[0];
  assert.equal(off.vote_count,1);
  assert.equal(off.voted,false);
});

test('concurrent likes count both users and repeated toggles by one user serialize', async () => {
  const [submission,p] = await submit();
  const other = await db.connect();
  try {
    await db.as(bob);
    await db.as(carol,other);
    await Promise.all([
      db.query('select * from toggle_spot_submission_vote($1)',[submission]),
      other.query('select * from toggle_spot_submission_vote($1)',[submission]),
    ]);
    assert.equal((await db.query('select spot_count from local_updates where id=$1',[p.id])).rows[0].spot_count,2);
    await db.as(bob,other);
    await Promise.all([
      db.query('select * from toggle_spot_submission_vote($1)',[submission]),
      other.query('select * from toggle_spot_submission_vote($1)',[submission]),
    ]);
    assert.equal((await db.query('select spot_count from local_updates where id=$1',[p.id])).rows[0].spot_count,2);
    assert.equal((await db.query('select count(*)::int n from spot_submission_votes where submission_id=$1',[submission])).rows[0].n,1,
      'the authenticated voter sees only their own selected state');
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from spot_submission_votes where submission_id=$1',[submission])).rows[0].n,2,
      'the stored vote rows still contain both users selections');
  } finally { await other.end(); }
});
