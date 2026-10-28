const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('./load-client.cjs');

const model = load('src/features/onboarding/model.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const firstVisit = {
  eligible: true, account: 'alice', path: '/', homeReady: true, active: false,
  deepLink: false, requested: false, storedAccount: 'alice', status: 'not_started', offered: false,
};

test('first launch starts only after account, home, theme/fonts/navigation readiness', () => {
  assert.equal(model.shouldStartHomeGuide(firstVisit), true);
  for (const changes of [{ eligible: false }, { homeReady: false }, { active: true }, { account: undefined }, { storedAccount: 'bob' }, { status: undefined }, { offered: true }]) {
    assert.equal(model.shouldStartHomeGuide({ ...firstVisit, ...changes }), false);
  }
});

test('completed/skipped states stay dismissed on relaunch; Help can explicitly replay either', () => {
  for (const status of ['completed', 'skipped']) {
    assert.equal(model.shouldStartHomeGuide({ ...firstVisit, status }), false);
    assert.equal(model.shouldStartHomeGuide({ ...firstVisit, status, requested: true, offered: true }), true);
  }
});

test('notification and deep-link routes are never intercepted, even by replay requests', () => {
  for (const path of ['/spot/real-id', '/activity', '/reservation/id', '/confirmed/id', '/submit-spot', '/auth/callback', '/owner-dashboard', '/admin']) {
    assert.equal(model.shouldStartHomeGuide({ ...firstVisit, path, requested: true }), false);
  }
  assert.equal(model.shouldStartHomeGuide({ ...firstVisit, deepLink: true, requested: true }), false);
});

test('guest, owner, administrator, loading and mismatched account/profile are excluded', () => {
  assert.equal(model.canOfferGuide(true, true, 'alice', 'alice', 'user'), true);
  for (const role of ['owner', 'admin', null]) assert.equal(model.canOfferGuide(true, true, 'alice', 'alice', role), false);
  assert.equal(model.canOfferGuide(false, true, 'alice', 'alice', 'user'), false);
  assert.equal(model.canOfferGuide(true, false, 'alice', 'alice', 'user'), false);
  assert.equal(model.canOfferGuide(true, true, 'bob', 'alice', 'user'), false);
  assert.equal(model.canOfferGuide(true, true, undefined, undefined, 'user'), false);
});

test('active overlays are immediately invalid after logout, account switch, role change or navigation', () => {
  const session = { account: 'alice', path: '/' };
  assert.equal(model.sessionIsActive(session, true, 'alice', '/'), true);
  assert.equal(model.sessionIsActive(session, true, 'bob', '/'), false);
  assert.equal(model.sessionIsActive(session, true, undefined, '/'), false);
  assert.equal(model.sessionIsActive(session, false, 'alice', '/'), false);
  assert.equal(model.sessionIsActive(session, true, 'alice', '/activity'), false);
  assert.equal(model.sessionIsActive(null, true, 'alice', '/'), false);
});

test('introduction advances to real targets; Previous is bounded and Finish reaches welcome', () => {
  let phase = { stage: 'intro', index: 0 };
  assert.deepEqual(plain(model.advanceGuide(phase, -1, 7)), phase);
  for (let i = 0; i < 3; i++) phase = model.advanceGuide(phase, 1, 7);
  assert.deepEqual(plain(phase), { stage: 'tour', index: 0 });
  for (let i = 0; i < 7; i++) phase = model.advanceGuide(phase, 1, 7);
  assert.deepEqual(plain(phase), { stage: 'welcome', index: 0 });
  assert.deepEqual(plain(model.advanceGuide(phase, -1, 7)), { stage: 'tour', index: 6 });
});

test('no-data walkthrough has a valid shorter progression without invented spots', () => {
  const steps = model.homeSteps.filter(step => !step.optional);
  assert.equal(steps.length, 5);
  let phase = { stage: 'tour', index: 0 };
  for (let i = 0; i < steps.length; i++) phase = model.advanceGuide(phase, 1, steps.length);
  assert.equal(phase.stage, 'welcome');
});

test('invalid/unmounted/offscreen measurements cannot produce a spotlight', () => {
  for (const rect of [
    { x: 0, y: 0, width: 0, height: 0 }, { x: NaN, y: 0, width: 50, height: 50 },
    { x: 0, y: 900, width: 50, height: 50 }, { x: -100, y: 0, width: 50, height: 50 },
  ]) assert.equal(model.visibleRect(rect, 360, 800), null);
  assert.deepEqual(plain(model.visibleRect({ x: -10, y: 30, width: 100, height: 50 }, 360, 800)), { x: 0, y: 30, width: 90, height: 50 });
});

test('tooltips stay within safe areas in portrait, landscape and small windows', () => {
  for (const [width, height] of [[360, 800], [800, 360], [320, 480]]) {
    for (const rect of [null, { x: 10, y: 45, width: 120, height: 55 }, { x: 20, y: height - 100, width: 250, height: 60 }]) {
      const position = model.tooltipPlacement(rect, width, height, 24, 20);
      assert.ok(position.top >= 36);
      assert.ok(position.top + position.maxHeight <= height - 32);
      assert.ok(position.left >= 12);
      assert.ok(position.maxHeight > 0);
    }
  }
  const crowded = model.tooltipPlacement({ x: 40, y: 170, width: 200, height: 70 }, 360, 440, 24, 20);
  assert.equal(crowded.top, 36);
  assert.ok(crowded.maxHeight >= 360);
});

test('Android search and navigation targets keep their screen position and a clear tooltip gap', () => {
  const search = model.visibleRect({ x: 16, y: 46, width: 328, height: 52 }, 360, 800);
  assert.equal(search.y, 46);
  const searchTip = model.tooltipPlacement(search, 360, 800, 24, 20);
  assert.ok(searchTip.top >= search.y + search.height + 12);

  const share = model.visibleRect({ x: 151, y: 708, width: 58, height: 58 }, 360, 800);
  const shareTip = model.tooltipPlacement(share, 360, 800, 24, 20);
  assert.ok(shareTip.top + shareTip.maxHeight <= share.y - 12);
  const community = model.homeSteps.find(step => step.title === 'Explore together');
  assert.deepEqual(plain(community.alsoTargets), ['activity']);
});

test('spotlights use same-window coordinates and distinct real control targets', () => {
  const target = { x: 302, y: 744, width: 44, height: 44 };
  const rect = model.visibleRect(model.windowRectToOverlay(target, { x: 8, y: 24 }), 360, 800);
  assert.deepEqual(plain(rect), { x: 294, y: 720, width: 44, height: 44 });
  const steps = model.homeSteps;
  assert.equal(steps.find(step => step.title === 'Save a favorite').target, 'spot-card-bookmark');
  assert.equal(steps.find(step => step.title === 'Share a spot').target, 'bottom-nav-share');
  assert.equal(steps.find(step => step.title === 'Make yourself at home').target, 'bottom-nav-profile');
});

test('guide title always has a valid Android font size before overlay layout settles', () => {
  for (const width of [0, -1, NaN, Infinity, 1, 320, 720]) {
    const size = model.guideTitleFontSize(width);
    assert.ok(Number.isFinite(size) && size > 0);
    assert.ok(size <= 42);
  }
});

function storage(mock, globals) {
  return load('src/features/onboarding/storage.ts', { '@react-native-async-storage/async-storage': { default: mock } }, globals).onboardingStorage;
}

test('persistence round trip isolates accounts and survives service recreation (relaunch)', async () => {
  const disk = new Map();
  const mock = { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value); } };
  let service = storage(mock);
  assert.equal(await service.read('alice'), 'not_started');
  await service.write('alice', 'completed');
  await service.write('bob', 'skipped');
  service = storage(mock);
  assert.equal(await service.read('alice'), 'completed');
  assert.equal(await service.read('bob'), 'skipped');
  assert.equal(await service.read('charlie'), 'not_started');
  assert.equal(disk.size, 2);
});

test('missing/corrupt/old-version state is safely treated as not started', () => {
  for (const value of [null, '', 'true', '{bad json', 'in_progress']) assert.equal(model.parseStatus(value), 'not_started');
  assert.equal(model.parseStatus('completed'), 'completed');
  assert.equal(model.parseStatus('skipped'), 'skipped');
  assert.notEqual(model.onboardingKey('alice'), model.onboardingKey('bob'));
});

test('storage rejection never prevents skip/finish or reopens the guide in this process', async () => {
  const service = storage({ getItem: async () => { throw Error('unavailable'); }, setItem: async () => { throw Error('disk full'); } });
  assert.equal(await service.read('alice'), null);
  await service.write('alice', 'skipped');
  assert.equal(await service.read('alice'), 'skipped');
  await service.write('alice', 'completed');
  assert.equal(await service.read('alice'), 'completed');
});

test('a stalled restore times out without blocking the application', async () => {
  const service = storage({ getItem: () => new Promise(() => {}) }, { setTimeout: fn => setTimeout(fn, 1) });
  assert.equal(await service.read('alice'), null);
});

test('a slow completed-guide restore never becomes a new-user state or overwrites completion', async () => {
  let release;
  let calls = 0;
  const service = storage({
    getItem: () => ++calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve('completed'),
    setItem: async () => { throw Error('A restore must not write onboarding state.'); },
  }, { setTimeout: fn => setTimeout(fn, 1) });
  assert.equal(await service.read('alice'), null);
  release('completed');
  assert.equal(await service.read('alice'), 'completed');
  assert.equal(model.shouldStartHomeGuide({ eligible:true,account:'alice',storedAccount:'alice',status:null,
    path:'/',homeReady:true,active:false,deepLink:false,requested:false,offered:false }),false);
});

test('late restore cannot overwrite a skip made during a Help restart', async () => {
  let resolveRead;
  const service = storage({ getItem: () => new Promise(resolve => { resolveRead = resolve; }), setItem: async () => {} });
  const reading = service.read('alice');
  await service.write('alice', 'skipped');
  resolveRead(null);
  assert.equal(await reading, 'skipped');
});

test('rapid skip then completion writes stay ordered even when storage is slow', async () => {
  const writes = [];
  let release;
  const service = storage({
    getItem: async () => null,
    setItem: async (key, value) => {
      if (value === 'skipped') await new Promise(resolve => { release = resolve; });
      writes.push(value);
    },
  });
  const skipped = service.write('alice', 'skipped');
  const completed = service.write('alice', 'completed');
  await Promise.resolve();
  assert.equal(await service.read('alice'), 'completed');
  release();
  await Promise.all([skipped, completed]);
  assert.deepEqual(writes, ['skipped', 'completed']);
});
