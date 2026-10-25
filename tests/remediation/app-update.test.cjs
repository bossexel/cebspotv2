const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup(runtimeVersion, { downloadFails = false, available = true } = {}) {
  const slots = [], effects = [], calls = { check: 0, fetch: 0, reload: 0, urls: [] };
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect(fn) { effects.push(fn); },
  };
  const updates = { runtimeVersion, isEnabled: true,
    async checkForUpdateAsync() { calls.check++; return { isAvailable: available }; },
    async fetchUpdateAsync() { calls.fetch++; return { isNew: true }; },
    async reloadAsync() { calls.reload++; },
  };
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('src/components/AppUpdatePrompt.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, __DEV__: false, console: { warn() {} },
    require(name) {
      if (name === 'react') return react;
      if (name === 'expo-updates') return updates;
      if (name === 'react-native') return {
        ...Object.fromEntries(['ActivityIndicator','Image','Modal','Pressable','Text','View'].map(x => [x,x])),
        StyleSheet: { create: value => value, absoluteFillObject: {} },
        AppState: { addEventListener: () => ({ remove() {} }) },
        Linking: { async openURL(url) { calls.urls.push(url); if (downloadFails) throw Error('Internal network details'); } },
      };
      if (name.endsWith('/useTheme')) return { useTheme: () => ({ appColors: {} }) };
      if (name.endsWith('/colors')) return { colors: {} };
      if (name.endsWith('/design')) return { fontSize: {}, radius: {}, shadow: {}, spacing: {} };
      if (name.endsWith('.png')) return 1;
      throw Error('Unexpected dependency: ' + name);
    },
  });
  function render() { cursor = 0; effects.length = 0; return module.exports.AppUpdatePrompt(); }
  function find(node, label) {
    if (node?.props?.accessibilityLabel === label) return node;
    for (const child of node?.children || []) { const result = find(child, label); if (result) return result; }
  }
  return { calls, render, find, async mount() { render(); effects.slice().forEach(fn => fn()); await Promise.resolve(); return render(); } };
}

test('1.0.3 update opens the signed APK instead of trying to install native code through OTA', async () => {
  const h = setup('1.0.3'); const tree = await h.mount();
  assert.equal(tree.props.visible, true);
  await h.find(tree, 'Download CebSpot update').props.onPress();
  await flush();
  assert.deepEqual(h.calls, { check: 0, fetch: 0, reload: 0,
    urls: ['https://expo.dev/artifacts/eas/4aKd8iEFWeuOc2YLGJDTmrpLmnoQajvRWgX96sP3bus.apk'] });
  assert.equal(h.render().props.visible, false);
});

test('1.0.4 retains the normal in-app OTA download and restart', async () => {
  const h = setup('1.0.4'); const tree = await h.mount();
  await h.find(tree, 'Update CebSpot').props.onPress();
  await flush();
  assert.deepEqual(h.calls, { check: 1, fetch: 1, reload: 1, urls: [] });
});

test('a failed installer link keeps a retryable friendly prompt', async () => {
  const h = setup('1.0.3', { downloadFails: true }); const tree = await h.mount();
  await h.find(tree, 'Download CebSpot update').props.onPress();
  await flush();
  const failed = h.render(); assert.equal(failed.props.visible, true);
  assert.match(JSON.stringify(failed), /We could not open the download/);
  assert.doesNotMatch(JSON.stringify(failed), /Internal network details/);
  assert.ok(h.find(failed, 'Download CebSpot update'));
});

test('newer runtimes are never offered the older APK and Later dismisses the prompt', async () => {
  const current = setup('1.0.5', { available: false });
  assert.equal((await current.mount()).props.visible, false);
  assert.equal(current.calls.urls.length, 0);
  const legacy = setup('1.0.3'); const tree = await legacy.mount();
  legacy.find(tree, 'Later').props.onPress();
  assert.equal(legacy.render().props.visible, false);
});
