const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../remediation/load-client.cjs');
const { getApprovalHistory, approvalPageSize } = load('src/features/admin-dashboard/approvalHistory.ts');

function harness(result = { data: [], error: null }) {
  const calls = [];
  const query = Object.fromEntries(['select', 'eq', 'ilike', 'order', 'range'].map(method =>
    [method, (...args) => { calls.push([method, ...args]); return query; }]));
  query.abortSignal = signal => { calls.push(['abortSignal', signal]); return Promise.resolve(result); };
  return { calls, client: { from: name => { assert.equal(name, 'spot_submissions'); return query; } } };
}

test('latest approval sorts on recorded approval time, with missing dates last and stable ties', async () => {
  const h = harness();
  const signal = new AbortController().signal;
  await getApprovalHistory(h.client, { status: 'all', sort: 'latest-approved', offset: 0, search: '' }, signal);
  assert.deepEqual(h.calls.filter(call => call[0] === 'eq'), [['eq', 'status', 'approved']]);
  assert.equal(h.calls.find(call => call[0] === 'order')[1], 'approved_at');
  assert.equal(h.calls.find(call => call[0] === 'order')[2].nullsFirst, false);
  assert.equal(h.calls.filter(call => call[0] === 'order').at(-1)[1], 'id');
  assert.equal(h.calls.find(call => call[0] === 'abortSignal')[1], signal);
});

test('status filters, submission order and literal search are sent before server pagination', async () => {
  const h = harness();
  await getApprovalHistory(h.client, { status: 'pending', sort: 'oldest', offset: 20, search: '  50%_spot  ' }, new AbortController().signal);
  assert.equal(h.calls.find(call => call[0] === 'eq')[2], 'pending');
  assert.equal(h.calls.find(call => call[0] === 'order')[1], 'created_at');
  assert.equal(h.calls.find(call => call[0] === 'order')[2].ascending, true);
  assert.equal(h.calls.find(call => call[0] === 'ilike')[2], '%50\\%\\_spot%');
  assert.deepEqual(h.calls.find(call => call[0] === 'range'), ['range', 20, 40]);
});

test('the extra row detects a next page without skipping any results', async () => {
  const rows = Array.from({ length: approvalPageSize + 1 }, (_, id) => ({ id: String(id) }));
  const h = harness({ data: rows, error: null });
  const page = await getApprovalHistory(h.client, { status: 'all', sort: 'newest', offset: 0, search: '' }, new AbortController().signal);
  assert.equal(page.rows.length, approvalPageSize);
  assert.equal(page.hasMore, true);
  assert.equal(h.calls.some(call => call[0] === 'eq'), false);
});

test('backend failures remain errors rather than appearing as an empty successful history', async () => {
  const h = harness({ data: null, error: new Error('Unavailable') });
  await assert.rejects(getApprovalHistory(h.client, { status: 'all', sort: 'newest', offset: 0, search: '' }, new AbortController().signal), /Unavailable/);
});
