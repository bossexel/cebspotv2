const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startDatabase } = require('./database.cjs');
const id = n => `27000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [alice,bob,admin] = [id(1),id(2),id(3)];
const migration = fs.readFileSync('supabase/migrations/20261027000100_independent_spot_posts.sql','utf8');
let db, historical, oldPost, originalHistory, review, a, b, spotId;
async function submit(user, extra = {}) {
  await db.as(user);
  return (await db.query(`insert into spot_submissions(name,description,category,address,latitude,longitude,images,submitter_id,spot_id,different_place)
    values($1,$2,'Cafe',$3,$4,123.9,$5,$6,$7,$8) returning *`,
    [extra.name ?? 'Shared Cafe',extra.caption ?? `Caption ${user}`,extra.address ?? 'Lahug, Cebu',extra.latitude ?? 10.33,
      [extra.image ?? `https://fixture.test/${user}.jpg`],user,extra.spotId ?? null,extra.different ?? false])).rows[0];
}
async function post(submissionId) {
  return (await db.query('select * from local_updates where source_id=$1',[submissionId])).rows[0];
}
before(async () => {
  db = await startDatabase({ through: '20261025000200_public_media_size_limits.sql' });
  for (const [user,email] of [[alice,'alice@fixture.test'],[bob,'bob@fixture.test'],[admin,'testadmin6000@gmail.com']]) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,email]);
  }
  await db.query("update profiles set role='admin' where id=$1",[admin]);
  historical = (await db.query(`insert into spot_submissions(name,description,category,address,latitude,longitude,images,submitter_id,created_at)
    values('Historical Cafe','Original Alice caption','Cafe','Fixture',10.3,123.9,ARRAY['alice.jpg'],$1,'2026-10-01') returning *`,[alice])).rows[0];
  oldPost = (await db.query(`insert into local_updates(user_id,user_name,title,body,location_name,media_urls,source_type,source_id,created_at)
    values($1,'Alice','Historical Cafe','Original caption','Fixture',ARRAY['alice.jpg','bob.jpg'],'spot_submission',$2,'2026-10-01') returning *`,[alice,historical.id])).rows[0];
  await db.query(`insert into local_update_comments(local_update_id,user_id,user_name,body) values($1,$2,'Bob','Keep this thread')`,[oldPost.id,bob]);
  await db.query(`insert into spot_submission_votes(submission_id,user_id) values($1,$2)`,[historical.id,bob]);
  const missing = (await db.query(`insert into spot_submissions(name,description,category,address,latitude,longitude,images,submitter_id,created_at)
    values('Historical Cafe','Bob own caption','Cafe','Fixture',10.3,123.9,ARRAY['bob.jpg'],$1,'2026-10-02') returning *`,[bob])).rows[0];
  originalHistory = { post: await post(historical.id), missing };
  await db.exec(migration);
});
after(async () => { await db?.close(); });

test('upgrade retains mixed historical posts and interactions, restores independent sources, and flags ambiguity', async () => {
  assert.deepEqual(await post(historical.id), {...originalHistory.post,spot_id:null});
  const restored = await post(originalHistory.missing.id);
  assert.equal(restored.user_id,bob);
  assert.equal(restored.body,'Bob own caption');
  assert.deepEqual(restored.media_urls,['bob.jpg']);
  assert.equal(restored.created_at.toISOString(),originalHistory.missing.created_at.toISOString());
  assert.equal((await db.query('select count(*)::int n from local_update_comments where local_update_id=$1',[oldPost.id])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from spot_submission_votes where submission_id=$1',[historical.id])).rows[0].n,1);
  const reasons = (await db.query('select reason from spot_post_relationship_audit')).rows.map(r=>r.reason);
  assert.ok(reasons.includes('historical_grouped_media'));
  assert.ok(reasons.includes('missing_independent_post'));
});

test('two users publish independent posts about one map listing; reviews stay unchanged', async () => {
  a = await submit(alice,{caption:'Alice first post',image:'alice-new.jpg'});
  const beforeApproval = await post(a.id);
  await db.as(admin);
  spotId = (await db.query('select (approve_spot_submission($1)).id',[a.id])).rows[0].id;
  await db.exec('reset role');
  review = (await db.query(`insert into reviews(spot_id,user_id,user_name,rating,comment) values($1,$2,'Alice',4,'Actual review') returning *`,[spotId,alice])).rows[0];
  const approvedPost = await post(a.id);
  assert.deepEqual(approvedPost,{...beforeApproval,spot_id:spotId});
  b = await submit(bob,{spotId,caption:'Bob independent post',image:'bob-new.jpg'});
  const bobPost = await post(b.id);
  assert.notEqual(bobPost.id,approvedPost.id);
  assert.equal(bobPost.user_id,bob);
  assert.equal(bobPost.body,'Bob independent post');
  assert.deepEqual(bobPost.media_urls,['bob-new.jpg']);
  assert.equal(bobPost.spot_id,spotId);
  assert.equal(b.status,'pending');
  await db.query('select * from publish_spot_submission_local_update($1)',[b.id]);
  await db.query('select * from publish_spot_submission_local_update($1)',[b.id]);
  await db.exec('reset role');
  assert.deepEqual(await post(a.id),approvedPost);
  assert.equal((await db.query('select count(*)::int n from spots')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from local_updates where source_id=$1',[b.id])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from spot_submission_votes where submission_id=$1',[b.id])).rows[0].n,0);
  assert.deepEqual((await db.query('select * from reviews where id=$1',[review.id])).rows[0],review);
  await db.as(null,db,'anon');
  const feed = (await db.query("select * from get_local_updates_page(25,'newest')")).rows;
  assert.ok(feed.findIndex(p=>p.source_id===b.id)<feed.findIndex(p=>p.source_id===a.id));
  assert.deepEqual((await db.query('select * from get_spot_submission_group_media($1)',[b.id])).rows,[{media_url:'bob-new.jpg'}]);
});

test('admin linking preserves the newer post, its reactions and thread, and leaves moderation pending', async () => {
  const c = await submit(bob,{caption:'New unlinked post',image:'third.jpg'});
  const p = await post(c.id);
  await db.query('select * from vote_on_spot_submission($1,$2)',[c.id,'up']);
  await db.query('select * from add_local_update_comment($1,$2,$3)',[p.id,'My own thread',null]);
  const interacted = await post(c.id);
  assert.equal((await db.query('select id from local_updates where spot_id=$1 and id=$2',[spotId,p.id])).rows.length,0);
  await assert.rejects(db.query('select link_spot_submission($1,$2)',[c.id,spotId]),/Admin access/);
  await db.as(admin);
  await db.query('select link_spot_submission($1,$2)',[c.id,spotId]);
  assert.deepEqual(await post(c.id),{...interacted,spot_id:spotId});
  const similarPost = (await db.query('select * from local_updates where spot_id=$1 and id=$2',[spotId,p.id])).rows[0];
  assert.equal(similarPost.user_id,bob);
  assert.equal(similarPost.body,'New unlinked post');
  assert.equal(similarPost.spot_count,1);
  assert.equal(similarPost.comments_count,1);
  assert.equal((await db.query('select status from spot_submissions where id=$1',[c.id])).rows[0].status,'pending');
  assert.equal((await db.query('select count(*)::int n from local_update_comments where local_update_id=$1',[p.id])).rows[0].n,1);
  await db.query('select approve_spot_submission($1)',[c.id]);
  await db.query('select approve_spot_submission($1)',[c.id]);
  assert.equal((await db.query('select count(*)::int n from spots')).rows[0].n,1);
  assert.deepEqual((await db.query('select * from reviews where id=$1',[review.id])).rows[0],review);
});

test('possible duplicates require an explicit decision; distinct nearby branches can be approved', async () => {
  const c = await submit(bob,{address:'Next door branch',latitude:10.3301});
  const suggestions = (await db.query('select * from find_matching_spots($1,$2,$3)',[c.name,c.latitude,c.longitude])).rows;
  assert.ok(suggestions.some(s=>s.id===spotId));
  await db.as(admin);
  await assert.rejects(db.query('select approve_spot_submission($1)',[c.id]),/Possible existing spot/);
  await db.query('select confirm_distinct_spot_submission($1)',[c.id]);
  const branch = (await db.query('select (approve_spot_submission($1)).id',[c.id])).rows[0].id;
  assert.notEqual(branch,spotId);
  assert.equal((await db.query('select count(*)::int n from spots')).rows[0].n,2);
  assert.equal((await post(c.id)).spot_id,branch);
  assert.equal((await db.query('select id from local_updates where spot_id=$1 and source_id=$2',[spotId,c.id])).rows.length,0);
});

test('linking never resurrects a rejected post or grants moderation rights to a user', async () => {
  const c = await submit(bob,{spotId});
  await assert.rejects(db.query('select approve_spot_submission($1)',[c.id]),/Admin access/);
  await db.exec('reset role');
  await db.query("update spot_submissions set status='rejected' where id=$1",[c.id]);
  await db.as(admin);
  await assert.rejects(db.query('select link_spot_submission($1,$2)',[c.id,spotId]),/Rejected/);
  await db.as(null,db,'anon');
  assert.equal((await db.query('select * from local_updates where source_id=$1',[c.id])).rows.length,0);
});

test('direct post inserts cannot bypass submission identity, and popularity cannot create duplicate pins', async () => {
  await db.as(bob);
  await assert.rejects(db.query(`insert into local_updates(user_id,user_name,title,location_name,source_type,source_id)
    values($1,'Bob','Forged','Fixture','spot_submission',$2)`,[bob,a.id]),/Publish spot posts/);
  await db.as(admin);
  await assert.rejects(db.query('select * from promote_popular_spot_submissions(0,10)'),/individual admin approval/);
  assert.equal((await db.query('select count(*)::int n from spots')).rows[0].n,2);
});

test('concurrent approvals of unlinked submissions cannot create two pins for a possible shared place', async () => {
  const c = await submit(alice,{name:'Concurrency Cafe',latitude:10.38});
  const d = await submit(bob,{name:'Concurrency Cafe',latitude:10.38});
  const other = await db.connect();
  try {
    await db.as(admin);
    await db.as(admin,other);
    const results = await Promise.allSettled([
      db.query('select approve_spot_submission($1)',[c.id]),
      other.query('select approve_spot_submission($1)',[d.id]),
    ]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const failed = results.find(r=>r.status==='rejected');
    assert.match(failed.reason.message,/Possible existing spot/);
    assert.equal((await db.query("select count(*)::int n from spots where name='Concurrency Cafe'")).rows[0].n,1);
    const posts = (await db.query('select * from local_updates where source_id=any($1::text[])',[[c.id,d.id]])).rows;
    assert.equal(posts.length,2);
  } finally { await other.end(); }
});

test('a hidden linked listing cannot cause approval to create a replacement duplicate', async () => {
  const c = await submit(bob,{spotId});
  await db.exec('reset role');
  await db.query('update spots set is_public=false where id=$1',[spotId]);
  try {
    await db.as(admin);
    await assert.rejects(db.query('select approve_spot_submission($1)',[c.id]),/Linked listing is unavailable/);
    assert.equal((await db.query("select count(*)::int n from spots where name='Shared Cafe'")).rows[0].n,2);
    assert.equal((await db.query('select status from spot_submissions where id=$1',[c.id])).rows[0].status,'pending');
  } finally {
    await db.exec('reset role');
    await db.query('update spots set is_public=true where id=$1',[spotId]);
  }
});

test('historical audit data is visible to admins and isolated from other users', async () => {
  await db.as(bob);
  assert.equal((await db.query('select count(*)::int n from spot_post_relationship_audit')).rows[0].n,0);
  await db.as(admin);
  assert.ok((await db.query('select count(*)::int n from spot_post_relationship_audit')).rows[0].n>=2);
  await db.query('select delete_admin_spot_submission($1)',[originalHistory.missing.id]);
  assert.equal((await db.query('select count(*)::int n from spot_post_relationship_audit where submission_id=$1',[originalHistory.missing.id])).rows[0].n,0);
});
