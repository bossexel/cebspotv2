const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('approval timestamps record transitions, reject spoofing, and retain unknown history', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.spot_submissions(id text primary key, name text, status text, created_at timestamptz default now());
      insert into public.spot_submissions(id,status) values('historical','approved');`);
    await db.exec(fs.readFileSync('supabase/migrations/20261127022215_spot_submission_approval_time.sql', 'utf8'));
    assert.equal((await db.query("select approved_at from spot_submissions where id='historical'")).rows[0].approved_at, null);
    await db.exec("insert into spot_submissions(id,status,approved_at) values('new','pending','2000-01-01');");
    assert.equal((await db.query("select approved_at from spot_submissions where id='new'")).rows[0].approved_at, null);
    await db.exec("update spot_submissions set status='approved', approved_at='2000-01-01' where id='new';");
    const approved = (await db.query("select approved_at from spot_submissions where id='new'")).rows[0].approved_at;
    assert.ok(new Date(approved).getTime() > Date.now() - 30000);
    await db.exec("update spot_submissions set name='Edited', approved_at='2000-01-01' where id='new';");
    assert.equal((await db.query("select approved_at from spot_submissions where id='new'")).rows[0].approved_at.getTime(), approved.getTime());
    const sorted = await db.query("select id from spot_submissions order by approved_at desc nulls last");
    assert.deepEqual(sorted.rows.map(row => row.id), ['new', 'historical']);
    await db.exec("update spot_submissions set status='pending' where id='new';");
    assert.equal((await db.query("select approved_at from spot_submissions where id='new'")).rows[0].approved_at, null);
    await db.exec("update spot_submissions set status='approved' where id='new';");
    assert.ok((await db.query("select approved_at from spot_submissions where id='new'")).rows[0].approved_at > approved);
  } finally { await db.close(); }
});
