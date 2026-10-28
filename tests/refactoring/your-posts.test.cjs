const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('../remediation/load-client.cjs');
const id = n => `27000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture(submissions, links = [], error = null, linkError = null) {
  const calls = [];
  const { yourPostsService } = load('src/services/yourPostsService.ts', {
    '../lib/supabase': { hasSupabaseConfig: true, supabase: {
      from(table) {
        calls.push([table, 'from']);
        const query = {};
        for (const method of ['select', 'eq', 'in', 'order', 'or', 'limit']) {
          query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
        }
        query.then = (resolve, reject) => Promise.resolve(table === 'spot_submissions'
          ? { data: submissions, error } : { data: links, error: linkError }).then(resolve, reject);
        return query;
      },
    } },
  });
  return { service: yourPostsService, calls };
}

test('own posts retain independent submissions and resolve exact post IDs in one author-scoped batch', async () => {
  const submissions = [
    { id: id(3), name: 'Cafe', description: 'My return visit', images: ['new.jpg'], status: 'pending' },
    { id: id(2), name: 'Cafe', description: 'My first visit', images: ['old.jpg'], status: 'approved' },
    { id: id(1), name: 'Another place', status: 'rejected', rejection_reason: 'Needs location details' },
  ];
  const f = fixture(submissions, [{ id: id(33), source_id: id(3) }, { id: id(22), source_id: id(2) }]);
  const page = await f.service.getPage('alice');
  assert.deepEqual(f.calls.find(call => call[1] === 'eq'), ['spot_submissions', 'eq', 'submitter_id', 'alice']);
  assert.equal(page.items.length, 3);
  assert.equal(page.items[0].postId, id(33));
  assert.equal(page.items[1].postId, id(22));
  assert.equal(page.items[2].postId, null);
  assert.equal(page.items[0].description, 'My return visit');
  assert.equal(page.items[1].images[0], 'old.jpg');
  assert.equal(page.nextCursor, null);
  assert.deepEqual(f.calls.filter(call => call[1] === 'from'), [['spot_submissions', 'from'], ['local_updates', 'from']]);
  assert.deepEqual(f.calls.find(call => call[0] === 'local_updates' && call[1] === 'eq'), ['local_updates', 'eq', 'user_id', 'alice']);
  assert.deepEqual(f.calls.find(call => call[0] === 'local_updates' && call[1] === 'select'), ['local_updates', 'select', 'id,source_id']);
});

test('bounded keyset pages retain microseconds and never look up sentinel rows', async () => {
  const rows = Array.from({ length: 13 }, (_, index) => ({ id: id(100 - index), created_at: '2026-10-27T01:00:00.123456+00:00' }));
  const f = fixture(rows);
  const page = await f.service.getPage('alice');
  assert.deepEqual(f.calls.find(call => call[1] === 'limit'), ['spot_submissions', 'limit', 13]);
  assert.equal(page.items.length, 12);
  assert.equal(page.nextCursor.id, rows[11].id);
  assert.equal(page.nextCursor.createdAt, rows[11].created_at);
  assert.equal(f.calls.find(call => call[0] === 'local_updates' && call[2] === 'source_id')[3].length, 12);
  const next = fixture([rows[12]]);
  await next.service.getPage('alice', page.nextCursor);
  assert.deepEqual(next.calls.find(call => call[1] === 'or'), ['spot_submissions', 'or',
    `created_at.lt.${rows[11].created_at},and(created_at.eq.${rows[11].created_at},id.lt.${rows[11].id})`]);
});

test('a failed post-link batch preserves submissions and supports a small author-scoped lookup on tap', async () => {
  const page = await fixture([{ id: id(1) }], null, null, new Error('Links outage')).service.getPage('alice');
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].postId, undefined);
  const f = fixture([], [{ id: id(5) }]);
  assert.equal(await f.service.getPostId('alice', id(1)), id(5));
  assert.deepEqual(f.calls.filter(call => call[1] === 'eq'), [
    ['local_updates', 'eq', 'user_id', 'alice'], ['local_updates', 'eq', 'source_id', id(1)],
  ]);
  assert.deepEqual(f.calls.find(call => call[1] === 'select'), ['local_updates', 'select', 'id']);
  await assert.rejects(fixture([], null, null, new Error('Offline')).service.getPostId('alice', id(1)), /Offline/);
});

test('ambiguous historical links never guess which original thread to open', async () => {
  const links = [{ id: id(2), source_id: id(1) }, { id: id(3), source_id: id(1) }];
  const f = fixture([{ id: id(1) }], links);
  assert.equal((await f.service.getPage('alice')).items[0].postId, null);
  assert.equal(await f.service.getPostId('alice', id(1)), null);
});

test('an empty account is different from a failed request and needs no post lookups', async () => {
  const f = fixture([]);
  const page = await f.service.getPage('new-user');
  assert.equal(page.items.length, 0);
  assert.equal(page.nextCursor, null);
  assert.equal(f.calls.filter(call => call[1] === 'from').length, 1);
  await assert.rejects(fixture(null, [], new Error('Synthetic outage')).service.getPage('alice'), /Synthetic outage/);
});

test('signed-out and malformed cursor requests never issue an unscoped query', async () => {
  const f = fixture([]);
  await assert.rejects(f.service.getPage(''), /Sign in/);
  for (const cursor of [
    { id: 'bad),submitter_id.neq.null', createdAt: '2026-10-27T01:00:00Z' },
    { id: id(1), createdAt: 'bad),submitter_id.neq.null' },
  ]) await assert.rejects(f.service.getPage('alice', cursor), /Invalid posts page/);
  await assert.rejects(f.service.getPostId('', id(1)), /Sign in/);
  assert.equal(f.calls.length, 0);
});
