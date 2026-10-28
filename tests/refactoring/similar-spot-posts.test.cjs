const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('../remediation/load-client.cjs');

const id = n => `27000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture(data, error = null) {
  const calls = [];
  const query = {};
  for (const method of ['select', 'eq', 'in', 'order', 'or', 'limit']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.then = resolve => Promise.resolve({ data, error }).then(resolve);
  query.maybeSingle = async () => ({ data, error });
  const supabase = { from(table) { calls.push(['from', table]); return query; } };
  const { localUpdateService } = load('src/services/localUpdateService.ts', {
    '../lib/supabase': { hasSupabaseConfig: true, supabase },
  });
  return { service: localUpdateService, calls };
}
const posts = Array.from({ length: 7 }, (_, index) => ({
  id: id(20 - index), spot_id: id(99), user_id: index % 2 ? id(1) : id(2),
  user_name: index % 2 ? 'Alice' : 'Bob', title: 'One confirmed cafe', body: `Independent caption ${index}`,
  image_url: `https://fixture.test/${index}.jpg`, source_type: 'spot_submission', source_id: id(index + 30),
  spot_count: index, comments_count: index + 1, created_at: '2026-10-27T01:00:00.123456+00:00',
}));

test('similar posts query uses confirmed spot identity, stable newest order and a bounded page', async () => {
  const f = fixture(posts);
  const page = await f.service.getPostsForSpot(id(99));
  assert.deepEqual(f.calls.find(call => call[0] === 'from'), ['from', 'local_updates']);
  assert.deepEqual(f.calls.find(call => call[0] === 'eq'), ['eq', 'spot_id', id(99)]);
  assert.equal(JSON.stringify(f.calls.find(call => call[0] === 'in')), JSON.stringify(['in', 'source_type', ['spot_submission', 'community']]));
  assert.equal(JSON.stringify(f.calls.filter(call => call[0] === 'order')),
    JSON.stringify([['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }]]));
  assert.deepEqual(f.calls.find(call => call[0] === 'limit'), ['limit', 7]);
  const fields = f.calls.find(call => call[0] === 'select')[1].split(',');
  assert.equal(fields.includes('media_urls'), false, 'full galleries load only when opening a post');
  for (const field of ['user_id', 'user_name', 'body', 'image_url', 'spot_count', 'comments_count', 'created_at']) assert.ok(fields.includes(field));
  assert.equal(page.items.length, 6);
  assert.equal(page.items[0].body, 'Independent caption 0');
  assert.equal(page.items[1].user_name, 'Alice');
  assert.equal(page.items[0].comments_count, 1);
  assert.equal(page.nextCursor.id, posts[5].id);
  assert.equal(page.nextCursor.createdAt, posts[5].created_at);
});

test('next-page cursor keeps microseconds and the post ID to avoid skipping same-time posts', async () => {
  const f = fixture([posts[6]]);
  const page = await f.service.getPostsForSpot(id(99), { createdAt: posts[5].created_at, id: posts[5].id });
  const filter = f.calls.find(call => call[0] === 'or')[1];
  assert.equal(filter, `created_at.lt.${posts[5].created_at},and(created_at.eq.${posts[5].created_at},id.lt.${posts[5].id})`);
  assert.equal(page.nextCursor, null);
  assert.equal(page.items[0].id, posts[6].id);
  for (const bad of [
    { id: 'bad),spot_id.neq.null', createdAt: posts[5].created_at },
    { id: posts[5].id, createdAt: '2026-10-27T01:00:00Z),spot_id.neq.null' },
    { id: posts[5].id, createdAt: 'invalid' },
  ]) await assert.rejects(f.service.getPostsForSpot(id(99), bad), /Invalid post cursor/);
});

test('post lookup opens the exact author and thread even when that post is outside the Activity page', async () => {
  const f = fixture({ ...posts[0], media_urls: ['bob-1.jpg', 'bob-2.jpg'] });
  const post = await f.service.getLocalUpdateById(posts[0].id);
  assert.deepEqual(f.calls.find(call => call[0] === 'eq'), ['eq', 'id', posts[0].id]);
  assert.equal(post.user_name, 'Bob');
  assert.equal(post.source_id, posts[0].source_id);
  assert.equal(post.id, posts[0].id);
  assert.equal(JSON.stringify(post.media_urls), JSON.stringify(['bob-1.jpg', 'bob-2.jpg']));
  assert.equal(await fixture(null).service.getLocalUpdateById(id(99)), null);
});

test('unavailable similar posts remain a retryable error and are distinct from a successful empty list', async () => {
  const page = await fixture([]).service.getPostsForSpot(id(99));
  assert.equal(page.items.length, 0);
  assert.equal(page.nextCursor, null);
  await assert.rejects(fixture(null, new Error('Synthetic outage')).service.getPostsForSpot(id(99)), /Synthetic outage/);
  await assert.rejects(fixture(null, new Error('Synthetic outage')).service.getLocalUpdateById(id(99)), /Synthetic outage/);
});
