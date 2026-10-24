const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-client.cjs');

function sessionFixture(options = {}) {
  let refreshes = 0;
  const session = { access_token: 'old', expires_at: options.expired ? 1 : 9999999999 };
  const module = load('src/services/mediaSession.ts', {
    '../lib/supabase': { hasSupabaseConfig: true, supabase: { auth: {
      async getSession() { return { data: { session: options.missing ? null : session } }; },
      async refreshSession() {
        refreshes++;
        await new Promise(resolve => setTimeout(resolve, 5));
        if (options.refreshError) return { data: {}, error: options.refreshError };
        session.access_token = 'fresh'; session.expires_at = 9999999999;
        return { data: { session } };
      },
    } } },
  });
  return { send: module.withMediaSession, get refreshes() { return refreshes; } };
}

test('expired sessions refresh before sending and concurrent uploads share the refresh', async () => {
  const f = sessionFixture({ expired: true });
  const tokens = [];
  await Promise.all([1, 2, 3].map(() => f.send(async headers => { tokens.push(headers.Authorization); return { status: 200 }; })));
  assert.equal(f.refreshes, 1);
  assert.deepEqual(tokens, ['Bearer fresh', 'Bearer fresh', 'Bearer fresh']);
});

test('401 refreshes and retries once; 403/503 never cause refresh or sign out', async () => {
  for (const status of [401, 403, 503]) {
    const f = sessionFixture(); let calls = 0;
    const result = await f.send(async () => { calls++; return { status }; });
    assert.equal(result.status, status);
    assert.equal(calls, status === 401 ? 2 : 1);
    assert.equal(f.refreshes, status === 401 ? 1 : 0);
  }
});

test('missing sessions and failed refreshes do not send media', async () => {
  for (const options of [{ missing: true }, { expired: true, refreshError: { status: 400 } }, { expired: true, refreshError: { status: 503 } }]) {
    const f = sessionFixture(options); let calls = 0;
    await assert.rejects(f.send(async () => { calls++; return { status: 200 }; }));
    assert.equal(calls, 0);
  }
});

function compressionFixture(options = {}) {
  const passes = [], deleted = [], videoOptions = [];
  const service = load('src/services/mediaCompression.ts', {
    'react-native': { Platform: { OS: 'android' }, Image: { getSize(uri, cb) { cb(options.width ?? 4000, options.height ?? 6000); } } },
    'expo-file-system': {
      async getInfoAsync() { return { exists: true, size: options.bytes ?? 100000 }; },
      async deleteAsync(uri) { deleted.push(uri); },
    },
    'expo-image-manipulator': { SaveFormat: { JPEG: 'jpeg' }, async manipulateAsync(uri, actions, save) {
      passes.push({ uri, actions, save }); return { uri: `file:///small-${passes.length}.jpg` };
    } },
    'react-native-compressor': {
      async getVideoMetaData() { return { duration: options.duration ?? 15 }; },
      Video: { async compress(uri, opts) { videoOptions.push(opts); return options.unchanged ? uri : 'file:///small.mp4'; } },
    },
  });
  return { ...service, passes, deleted, videoOptions };
}

test('portrait photos and avatars are resized before encoding, with enforced byte limits', async () => {
  const f = compressionFixture();
  await f.compressPhoto('file:///original.jpg');
  assert.equal(f.passes[0].actions[0].resize.height, 1280);
  assert.equal(f.passes[0].save.format, 'jpeg');
  await f.compressPhoto('file:///avatar.jpg', f.mediaLimits.avatar);
  assert.equal(f.passes[1].actions[0].resize.height, 512);
  assert.equal(f.deleted.includes('file:///original.jpg'), false);
  const big = compressionFixture({ bytes: 10 * 1024 * 1024 });
  await assert.rejects(big.compressPhoto('file:///original.jpg'), /small enough/);
  assert.equal(big.passes.length, 4);
  assert.equal(big.deleted.length, 4);
  assert.ok(big.passes.every(pass => pass.uri === 'file:///original.jpg'));
});

test('videos are transcoded at a bounded bitrate and reject long, oversized, or unprocessed output', async () => {
  const f = compressionFixture();
  assert.equal(await f.compressVideo('file:///source.mov'), 'file:///small.mp4');
  assert.equal(f.videoOptions[0].maxSize, 640);
  assert.equal(f.videoOptions[0].bitrate, 850000);
  assert.equal(f.videoOptions[0].minimumFileSizeForCompress, 0);
  for (const options of [{ duration: 16 }, { duration: NaN }, { bytes: 4 * 1024 * 1024 }, { unchanged: true }]) {
    const bad = compressionFixture(options);
    await assert.rejects(bad.compressVideo('file:///source.mov'));
    assert.equal(bad.deleted.includes('file:///source.mov'), false);
  }
});

test('technical errors cannot leak into user-facing upload messages', () => {
  const { userErrorMessage } = load('src/utils/userError.ts');
  for (const message of ['relation secret_table does not exist', 'HTTP 503 at https://internal.example', 'JWT parse failure: secret', 'column xyz missing']) {
    assert.equal(userErrorMessage({ message }, 'Please try again.'), 'Please try again.');
  }
});

test('feed client uses the server snapshot and sends cursor fields without loading full media', async () => {
  const calls = [];
  const rows = Array.from({ length: 13 }, (_, i) => ({ id: String(i), created_at: '2026-10-20T00:00:00Z',
    feed_rank: i, feed_snapshot_at: '2026-10-25T00:00:00Z' }));
  const { localUpdateService } = load('src/services/localUpdateService.ts', {
    '../lib/supabase': { hasSupabaseConfig: true, supabase: { async rpc(name, params) {
      calls.push({ name, params }); return { data: rows, error: null };
    } } },
  });
  const first = await localUpdateService.getLocalUpdatesPage();
  assert.equal(first.items.length, 12);
  assert.equal(calls[0].params.snapshot_at, null);
  assert.equal(first.nextCursor.id, '11');
  await localUpdateService.getLocalUpdatesPage({ cursor: first.nextCursor });
  assert.equal(calls[1].params.snapshot_at, rows[0].feed_snapshot_at);
  assert.equal(calls[1].params.cursor_id, '11');
});

test('live feed events batch changed rows without querying the database again', async () => {
  let handler, removed = false;
  const deliveries = [];
  const channel = { on(event, filter, callback) { handler = callback; return this; }, subscribe() { return this; } };
  const { localUpdateService } = load('src/services/localUpdateService.ts', {
    '../lib/supabase': { hasSupabaseConfig: true, supabase: {
      channel() { return channel; }, removeChannel() { removed = true; },
      rpc() { assert.fail('Live changes must not refetch pages'); },
    } },
  });
  const stop = localUpdateService.subscribeToFeedChanges(changes => deliveries.push(changes), () => {});
  handler({ eventType: 'UPDATE', new: { id: 'a', spot_count: 1 } });
  handler({ eventType: 'UPDATE', new: { id: 'a', spot_count: 2 } });
  handler({ eventType: 'DELETE', old: { id: 'b' } });
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].length, 2);
  assert.equal(deliveries[0][0].item.spot_count, 2);
  handler({ eventType: 'UPDATE', new: { id: 'c' } });
  stop(); assert.equal(removed, true);
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(deliveries.length, 1);
});
