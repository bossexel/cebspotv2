const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

for (const platform of ['web', 'ios']) {
  test(`${platform} cannot initialize app routing or native services`, () => {
    const imports = [];
    assert.throws(() => vm.runInNewContext(read('index.js'), {
      require(name) {
        imports.push(name);
        if (name === 'react-native') return { Platform: { OS: platform } };
        throw new Error(`Unexpected initialization: ${name}`);
      },
    }), /Android only/);
    assert.deepEqual(imports, ['react-native']);
  });
}

test('Android initializes gestures, background notifications and app routing', () => {
  const imports = [];
  let backgroundHandler;
  vm.runInNewContext(read('index.js'), {
    require(name) {
      imports.push(name);
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      if (name === 'react-native-notify-kit') return {
        default: { onBackgroundEvent(handler) { backgroundHandler = handler; } },
      };
      return {};
    },
  });
  assert.deepEqual(imports, [
    'react-native', 'react-native-gesture-handler', 'react-native-notify-kit', 'expo-router/entry',
  ]);
  assert.equal(typeof backgroundHandler, 'function');
});

for (const target of ['android', 'admin-web']) {
 for (const hasUpstreamResolver of [false, true]) {
  test(`Metro isolates ${target} bundles and preserves resolution (upstream: ${hasUpstreamResolver})`, () => {
    const calls = [];
    const resolve = (...args) => { calls.push(args); return 'resolved'; };
    const module = { exports: {} };
    vm.runInNewContext(read('metro.config.js'), {
      __dirname: root,
      module,
      process: { env: { EXPO_PUBLIC_CEBSPOT_TARGET: target } },
      require(name) {
        assert.equal(name, 'expo/metro-config');
        return { getDefaultConfig: () => ({ resolver: {
          resolveRequest: hasUpstreamResolver ? resolve : undefined,
        } }) };
      },
    });
    const { resolver } = module.exports;
    const context = { resolveRequest: resolve };
    const supported = target === 'admin-web' ? 'web' : 'android';
    for (const platform of ['web', 'ios', 'android'].filter((item) => item !== supported)) {
      assert.throws(() => resolver.resolveRequest(context, './index', platform), /Android only/);
    }
    assert.equal(calls.length, 0);
    assert.equal(resolver.resolveRequest(context, './index', supported), 'resolved');
    assert.deepEqual(calls, [[context, './index', supported]]);
  });
 }
}

test('customer/owner config is Android-only and Render builds a separate admin route tree', () => {
  function configFor(target) {
    const module = { exports: {} };
    vm.runInNewContext(read('app.config.js'), {
      module, process: { env: { EXPO_PUBLIC_CEBSPOT_TARGET: target } },
      require: () => JSON.parse(read('app.json')),
    });
    return module.exports.expo;
  }
  const expo = configFor('android');
  const admin = configFor('admin-web');
  const { scripts, dependencies } = JSON.parse(read('package.json'));
  assert.deepEqual(Array.from(expo.platforms), ['android']);
  assert.equal(expo.web, undefined);
  assert.equal(expo.ios, undefined);
  assert.equal(expo.extra.router.root, './app');
  assert.deepEqual(Array.from(admin.platforms), ['web']);
  assert.equal(admin.extra.router.root, './admin-app');
  assert.equal(admin.web.output, 'single');
  assert.match(scripts['build:android'], /--platform android$/);
  assert.equal(scripts.build, 'node scripts/admin-web.cjs export --platform web');
  assert.equal(scripts.web, undefined);
  assert.equal(scripts.ios, undefined);
  assert.ok(dependencies['react-native-web']);
  assert.match(read('render.yaml'), /buildCommand: npm ci && npm run build/);
  for (const artifact of ['vercel.json', 'public/owner-portal']) {
    assert.equal(fs.existsSync(path.join(root, artifact)), false, `${artifact} must remain removed`);
  }
});

test('platform entry resolution keeps native services out of admin web startup', () => {
  const { resolveEntryPoint } = require('@expo/config/paths');
  assert.equal(path.basename(resolveEntryPoint(root, { platform: 'android' })), 'index.js');
  assert.equal(path.basename(resolveEntryPoint(root, { platform: 'web' })), 'index.web.js');
  assert.throws(() => vm.runInNewContext(read('index.web.js'), {
    process: { env: {} }, require() { throw new Error('Unexpected initialization'); },
  }), /Android only/);
  const imports = [];
  vm.runInNewContext(read('index.web.js'), {
    process: { env: { EXPO_PUBLIC_CEBSPOT_TARGET: 'admin-web' } },
    require(name) { imports.push(name); return {}; },
  });
  assert.deepEqual(imports, ['react-native-gesture-handler', 'expo-router/entry']);
});

test('admin route root contains no customer or owner application routes', () => {
  function walk(dir) {
    return fs.readdirSync(path.join(root, 'admin-app', dir), { withFileTypes: true }).flatMap((entry) => {
      const relative = path.posix.join(dir, entry.name);
      return entry.isDirectory() ? walk(relative) : [relative];
    });
  }
  assert.deepEqual(walk('').sort(), [
    '+not-found.tsx', '_layout.tsx', 'admin.tsx', 'admin/spot/[id].tsx', 'auth/callback.tsx',
    'index.tsx', 'login.tsx', 'reset-password.tsx',
  ].sort());
});

test('admin browser alerts display errors and respect cancellation before running actions', () => {
  const ts = require('typescript');
  const source = ts.transpileModule(read('src/utils/platformAlert.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const messages = [];
  let accepted = false;
  vm.runInNewContext(source, {
    exports,
    require: () => ({ Alert: { alert() { throw new Error('Web must not use native Alert'); } }, Platform: { OS: 'web' } }),
    window: { alert: (message) => messages.push(message), confirm: (message) => { messages.push(message); return accepted; } },
  });
  exports.platformAlert.alert('Login failed', 'Check your credentials.');
  assert.deepEqual(messages, ['Login failed\n\nCheck your credentials.']);
  let actions = 0;
  let cancellations = 0;
  const buttons = [
    { style: 'cancel', onPress() { cancellations++; } },
    { onPress() { actions++; } },
  ];
  exports.platformAlert.alert('Log out?', 'Confirm sign out', buttons);
  assert.equal(actions, 0);
  assert.equal(cancellations, 1);
  accepted = true;
  exports.platformAlert.alert('Log out?', 'Confirm sign out', buttons);
  assert.equal(actions, 1);
});
