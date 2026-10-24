const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
let db;
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create table local_updates (id uuid primary key, user_id uuid, user_name text, user_photo_url text,
      title text, body text, location_name text, latitude double precision, longitude double precision,
      image_url text, media_urls text[], source_type text, source_id text, spot_count integer, comments_count integer,
      created_at timestamptz, visible boolean default true);
    alter table local_updates enable row level security;
    create policy readable on local_updates for select using (visible);
    grant select on local_updates to anon, authenticated;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261025000100_activity_feed_pagination.sql', 'utf8'));
  for (let n = 1; n <= 40; n++) await db.query(`insert into local_updates
    (id,title,spot_count,comments_count,created_at,latitude,longitude,media_urls,visible)
    values ($1,$2,$3,0,'2026-10-24T00:00:00Z',$4,123.9,ARRAY['large','media','array'],$5)`,
    [id(n), `Post ${n}`, n, 10.3 + n * .01, n !== 40]);
  await db.exec('set role anon');
});
after(async () => { await db?.close(); });

async function page(sort, cursor, size = 12) {
  return (await db.query(`select * from get_local_updates_page($1,$2,$3,$4,$5,10.3,123.9,'2026-10-25T00:00:00Z')`,
    [size, sort, cursor?.created_at ?? null, cursor?.id ?? null, cursor?.feed_rank ?? null])).rows;
}
test('all sorts paginate tied timestamps without duplicates and preserve RLS', async () => {
  for (const sort of ['newest', 'popular', 'nearest']) {
    let cursor, seen = [], rows;
    do {
      rows = await page(sort, cursor);
      const items = rows.slice(0, 12);
      seen.push(...items.map(item => item.id));
      cursor = items.at(-1);
      assert.ok(items.every(item => !Object.hasOwn(item, 'media_urls')));
    } while (rows.length > 12);
    assert.equal(seen.length, 39);
    assert.equal(new Set(seen).size, 39);
    assert.equal(seen.includes(id(40)), false);
    assert.equal(seen[0], sort === 'nearest' ? id(1) : id(39));
  }
});
test('page size is capped and post-snapshot inserts do not shift the cursor', async () => {
  assert.equal((await page('newest', null, 10000)).length, 26);
  const first = await page('newest');
  await db.exec('reset role');
  await db.query("insert into local_updates (id,created_at) values ($1,'2026-10-26')", [id(41)]);
  await db.exec('set role anon');
  const second = await page('newest', first[11]);
  assert.equal(second[0].id, first[12].id);
  assert.ok(second.every(item => item.id !== id(41)));
});

test('public bucket ceilings retain smaller limits and leave private documents unchanged', async () => {
  await db.exec(`reset role; create schema storage;
    create table storage.buckets(id text primary key, file_size_limit bigint);
    insert into storage.buckets values ('spot-images',null),('profile-photos',100000),('payment-proofs',5242880);`);
  const sql = fs.readFileSync('supabase/migrations/20261025000200_public_media_size_limits.sql', 'utf8');
  await db.exec(sql); await db.exec(sql);
  const rows = (await db.query('select * from storage.buckets order by id')).rows;
  assert.deepEqual(rows.map(row => [row.id, Number(row.file_size_limit)]), [
    ['payment-proofs',5242880], ['profile-photos',100000], ['spot-images',3145728],
  ]);
});
