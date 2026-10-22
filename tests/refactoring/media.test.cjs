const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../remediation/load-client.cjs');

test('upload decoding preserves binary bytes, padding, whitespace and empty input', () => {
  const { base64ToArrayBuffer } = load('src/utils/base64.ts');
  const inputs = ['', 'f', 'fo', 'foo', Buffer.from(Array.from({ length: 256 }, (_, i) => i))];
  for (const input of inputs) {
    const expected = Buffer.from(input);
    const encoded = expected.toString('base64');
    for (const value of [encoded, encoded.replace(/=+$/, ''), `\n ${encoded}\t`]) {
      assert.deepEqual(Buffer.from(base64ToArrayBuffer(value)), expected);
    }
  }
});

test('media reading uses native bytes for device URIs and fetch for browser sources', async () => {
  const reads = [];
  const requests = [];
  const body = new Uint8Array([255, 0, 127]).buffer;
  const media = load('src/utils/mediaFile.ts', {
    'expo-file-system': {
      EncodingType: { Base64: 'base64' },
      async readAsStringAsync(uri, options) {
        reads.push({ uri, options });
        return '/wB/';
      },
    },
  }, {
    async fetch(uri) {
      requests.push(uri);
      return { ok: uri !== 'blob:missing', arrayBuffer: async () => body };
    },
  });

  for (const scheme of ['file', 'content', 'ph']) {
    assert.deepEqual(Buffer.from(await media.readMediaBody(`${scheme}:///photo`, 'Read failed')), Buffer.from(body));
  }
  assert.equal(reads.length, 3);
  assert.equal(reads[0].options.encoding, 'base64');
  assert.equal(requests.length, 0);
  for (const uri of ['blob:photo', 'data:image/png;base64,/wB/']) {
    assert.equal(media.isBrowserBlobUri(uri), true);
    assert.equal(await media.readMediaBody(uri, 'Read failed'), body);
  }
  assert.equal(media.isLocalFileUri('https://fixture.invalid/photo'), false);
  assert.equal(media.isBrowserBlobUri('https://fixture.invalid/photo'), false);
  await assert.rejects(media.readMediaBody('blob:missing', 'Review photo could not be read'), /Review photo could not be read/);
});

function reviewUploads(failAt) {
  const uploads = [];
  const cleaned = [];
  const removed = [];
  const client = {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'spot-images');
        return {
          async upload(path, body, options) {
            uploads.push({ path, body, options });
            return { error: uploads.length === failAt ? { message: 'Synthetic storage failure' } : null };
          },
          getPublicUrl(path) { return { data: { publicUrl: `https://fixture.invalid/${path}` } }; },
          async remove(paths) { removed.push(...paths); return { error: null }; },
        };
      },
    },
  };
  const { reviewMediaService } = load('src/services/reviewMediaService.ts', {
    '../lib/supabase': { hasSupabaseConfig: true, supabase: client },
    'expo-file-system': {
      EncodingType: { Base64: 'base64' },
      async readAsStringAsync(uri) {
        assert.match(uri, /processed/);
        return '/wB/';
      },
    },
    './imageAnonymization': {
      imageAnonymizationService: {
        async anonymizeImage(uri) { return uri + '-processed'; },
        async cleanupProcessedImage(processed, original) { cleaned.push({ processed, original }); },
      },
    },
  });
  return { service: reviewMediaService, uploads, cleaned, removed };
}

test('review upload failure removes committed storage objects and cleans every processed image', async () => {
  const f = reviewUploads(2);
  const assets = ['file:///one', 'file:///two'].map(uri => ({ uri, type: 'image' }));
  await assert.rejects(f.service.anonymizeAndUpload(assets, 'user', 'spot'), /Unable to upload review photo 2/);
  assert.equal(f.cleaned.length, 2);
  assert.deepEqual(f.removed, [f.uploads[0].path]);
  assert.deepEqual(Buffer.from(f.uploads[0].body), Buffer.from([255, 0, 127]));
  assert.equal(f.uploads[0].options.contentType, 'image/jpeg');
});

test('review uploads preserve source restrictions and return public URLs after processing', async () => {
  const blocked = reviewUploads();
  await assert.rejects(blocked.service.anonymizeAndUpload([
    { uri: 'https://fixture.invalid/original.jpg', type: 'image' },
  ], 'user', 'spot'), /cannot be privacy processed/);
  assert.equal(blocked.uploads.length, 0);
  assert.equal(blocked.cleaned.length, 0);

  const f = reviewUploads();
  const urls = await f.service.anonymizeAndUpload([{ uri: 'file:///one', type: 'image' }], 'user', 'spot');
  assert.deepEqual(Array.from(urls), [`https://fixture.invalid/${f.uploads[0].path}`]);
  assert.equal(f.cleaned.length, 1);
  assert.equal(f.removed.length, 0);
});
