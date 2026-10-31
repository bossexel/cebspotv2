const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startDatabase } = require('./database.cjs');
const uuid = n => `31000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [alice, bob, admin] = [uuid(1), uuid(2), uuid(3)];
let db;

async function submitAsAlice(name) {
  await db.as(alice);
  return (await db.query(`insert into public.spot_submissions
    (name,description,category,categories,address,latitude,longitude,images,submitter_id)
    values($1,'Original caption','Specialty Coffee',array['Specialty Coffee','Dog Friendly'],
      'Original address',10.31,123.90,array['fixture-photo.jpg'],$2) returning *`, [name, alice])).rows[0];
}

before(async () => {
  db = await startDatabase({ through: '20261031000100_owner_managed_spot_posts.sql' });
  for (const [id, email] of [[alice, 'owner-a@fixture.test'], [bob, 'owner-b@fixture.test'], [admin, 'testadmin6000@gmail.com']]) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, email]);
  }
  await db.query("update public.profiles set role='admin' where id=$1", [admin]);
});
after(async () => { await db?.close(); });

test('legacy approved Activity posts gain their submitted categories without changing their content or timestamp', async () => {
  const legacy = await startDatabase({ through: '20261030000100_activity_post_votes.sql' });
  try {
    await legacy.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [alice, 'legacy-owner@fixture.test']);
    const submission = (await legacy.query(`insert into public.spot_submissions
      (name,description,category,categories,address,latitude,longitude,images,submitter_id,status,created_at)
      values('Old Cafe','Old caption','Specialty Coffee',array['Specialty Coffee','Dog Friendly'],
        'Old Cebu address',10.31,123.90,array['old-photo.jpg'],$1,'approved','2026-10-01T08:30:00Z') returning *`, [alice])).rows[0];
    await legacy.query("update public.local_updates set source_type='community' where source_id=$1", [submission.id]);
    const before = (await legacy.query('select * from public.local_updates where source_id=$1', [submission.id])).rows[0];

    await legacy.exec(fs.readFileSync('supabase/migrations/20261031000100_owner_managed_spot_posts.sql', 'utf8'));

    const afterUpgrade = (await legacy.query('select * from public.local_updates where id=$1', [before.id])).rows[0];
    assert.equal(afterUpgrade.category, 'Specialty Coffee');
    assert.deepEqual(afterUpgrade.categories, ['Specialty Coffee', 'Dog Friendly']);
    for (const field of ['title', 'body', 'location_name', 'image_url', 'source_type', 'source_id', 'created_at']) {
      assert.deepEqual(afterUpgrade[field], before[field], `legacy Activity field ${field} stays unchanged`);
    }
    const pageItem = (await legacy.query(`select category,categories from public.get_local_updates_page_with_category(25,'newest')
      where source_id=$1`, [submission.id])).rows[0];
    assert.deepEqual(pageItem, { category: 'Specialty Coffee', categories: ['Specialty Coffee', 'Dog Friendly'] });
  } finally {
    await legacy.close();
  }
});

test('custom category is published on Activity and owner edits preserve the thread and votes', async () => {
  const submission = await submitAsAlice('Editable fixture spot');
  const post = (await db.query('select * from public.local_updates where source_id=$1', [submission.id])).rows[0];
  assert.equal(post.category, 'Specialty Coffee');
  assert.deepEqual(post.categories, ['Specialty Coffee', 'Dog Friendly']);
  assert.equal((await db.query(`select category from public.get_local_updates_page_with_category(25,'newest') where source_id=$1`, [submission.id])).rows[0].category, 'Specialty Coffee');
  await db.as(bob);
  await db.query("select * from public.add_local_update_comment($1,$2,$3)", [post.id, 'Keep this thread', null]);
  await db.query("select * from public.vote_on_spot_submission($1,'up')", [submission.id]);

  await db.as(alice);
  const edited = await db.query(`select public.update_own_spot_submission($1,$2,$3,$4,$5,$6,$7,$8,$9) result`, [
    submission.id, 'Edited fixture spot', 'Edited caption', 'Dog Friendly', ['Dog Friendly', 'Specialty Coffee'],
    'Edited Cebu address', 10.32, 123.91, true,
  ]);
  assert.deepEqual(edited.rows[0].result, { id: submission.id, status: 'pending' });
  const updatedSubmission = (await db.query('select * from public.spot_submissions where id=$1', [submission.id])).rows[0];
  const updatedPost = (await db.query('select * from public.local_updates where id=$1', [post.id])).rows[0];
  assert.equal(updatedSubmission.name, 'Edited fixture spot');
  assert.equal(updatedSubmission.status, 'pending');
  assert.equal(updatedPost.title, 'Edited fixture spot');
  assert.equal(updatedPost.location_name, 'Edited Cebu address');
  assert.equal(updatedPost.category, 'Dog Friendly');
  assert.deepEqual(updatedPost.categories, ['Dog Friendly', 'Specialty Coffee']);
  assert.equal(updatedPost.created_at.toISOString(), post.created_at.toISOString());
  assert.equal(updatedPost.spot_count, 1);
  assert.equal((await db.query('select count(*)::int n from public.local_update_comments where local_update_id=$1', [post.id])).rows[0].n, 1);

  await db.as(bob);
  assert.equal((await db.query("update public.spot_submissions set name='Direct write bypass' where id=$1 returning id", [submission.id])).rowCount, 0);
  assert.equal((await db.query('delete from public.spot_submissions where id=$1 returning id', [submission.id])).rowCount, 0);
  await assert.rejects(db.query(`select public.update_own_spot_submission($1,'Hijack','x','Cafe',array['Cafe'],'Elsewhere',10,123,false)`, [submission.id]), /not found/);
  await assert.rejects(db.query('select public.delete_own_spot_submission($1)', [submission.id]), /not found/);
});

test('rejected edits return to moderation; deleting own unapproved content cascades only its thread and votes', async () => {
  const rejected = await submitAsAlice('Rejected fixture spot');
  await db.query("update public.spot_submissions set status='rejected',rejection_reason='Needs detail' where id=$1", [rejected.id]);
  await db.as(alice);
  await db.query(`select public.update_own_spot_submission($1,'Fixed fixture spot','Caption','Cafe',array['Cafe'],
    'Cebu address',10.30,123.89,false)`, [rejected.id]);
  assert.equal((await db.query('select status from public.spot_submissions where id=$1', [rejected.id])).rows[0].status, 'pending');

  const removable = await submitAsAlice('Removable fixture spot');
  const removablePost = (await db.query('select * from public.local_updates where source_id=$1', [removable.id])).rows[0];
  await db.as(bob);
  await db.query("select * from public.add_local_update_comment($1,$2,$3)", [removablePost.id, 'Temporary fixture comment', null]);
  await db.query("select * from public.vote_on_spot_submission($1,'up')", [removable.id]);
  await db.as(alice);
  const deleted = await db.query('select public.delete_own_spot_submission($1) result', [removable.id]);
  assert.deepEqual(deleted.rows[0].result, { id: removable.id, deleted: true });
  assert.equal((await db.query('select count(*)::int n from public.spot_submissions where id=$1', [removable.id])).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from public.local_updates where id=$1', [removablePost.id])).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from public.local_update_comments where local_update_id=$1', [removablePost.id])).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from public.spot_submission_votes where submission_id=$1', [removable.id])).rows[0].n, 0);
});

test('approved edits return the post to review without changing the live listing; deletion stays admin-controlled', async () => {
  const approved = await submitAsAlice('Approved fixture spot');
  await db.as(admin);
  const spotId = (await db.query('select (public.approve_spot_submission($1)).id', [approved.id])).rows[0].id;
  await db.as(alice);
  await assert.rejects(db.query('select public.delete_own_spot_submission($1)', [approved.id]), /Approved spots cannot be deleted/);
  await db.query(`select public.update_own_spot_submission($1,'Edited approved post','New caption','Cafe',array['Cafe'],
    'New Activity address',10.32,123.91,false)`, [approved.id]);
  assert.equal((await db.query('select status from public.spot_submissions where id=$1', [approved.id])).rows[0].status, 'pending');
  assert.equal((await db.query('select title,location_name,spot_id from public.local_updates where source_id=$1', [approved.id])).rows[0].spot_id, spotId);
  assert.equal((await db.query('select name,address,is_public from public.spots where id=$1', [spotId])).rows[0].name, 'Approved fixture spot');
});
