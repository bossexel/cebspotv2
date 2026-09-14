import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const env = { ...process.env };
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const version = require('../app.json').expo.version;
const expected = require('expo/bundledNativeModules.json');
const semver = require('semver');
const dependencies = ['react-native-webview', 'react-native-gesture-handler', 'react-native-reanimated', 'react-native-maps']
  .map((name) => {
    const installed = require(`${name}/package.json`).version;
    return { name, installed, expected: expected[name], compatible: semver.satisfies(installed, expected[name]) };
  });
const carto = env.EXPO_PUBLIC_CARTO_BASEMAPS_API_KEY?.trim();
const maptiler = env.EXPO_PUBLIC_MAPTILER_KEY?.trim();
const selectedProvider = carto ? 'CARTO' : maptiler ? 'MapTiler' : 'OpenStreetMap';
const tilePath = '16/55324/30877.png';
const providers = [
  ...(carto ? [{ name: 'CARTO', url: `https://basemaps.cartocdn.com/rastertiles/voyager/${tilePath}?key=${encodeURIComponent(carto)}` }] : []),
  ...(maptiler ? [{ name: 'MapTiler', url: `https://api.maptiler.com/maps/streets-v2/256/${tilePath}?key=${encodeURIComponent(maptiler)}` }] : []),
  { name: 'OpenStreetMap', url: `https://tile.openstreetmap.org/${tilePath}` },
];
const checks = [];
// One ordinary tile per provider, sequentially. Never log keys, request URLs or response bodies.
for (const provider of providers) {
  const start = performance.now();
  try {
    const response = await fetch(provider.url, {
      headers: { 'User-Agent': `CebSpot/${version} (map diagnostics)` },
      signal: AbortSignal.timeout(15000),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const png = bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    checks.push({
      provider: provider.name, active: provider.name === selectedProvider,
      ok: response.ok && png && !response.headers.get('x-blocked'),
      status: response.status, latencyMs: Math.round(performance.now() - start),
      bytes: bytes.length, cacheControl: response.headers.get('cache-control'),
      blocked: Boolean(response.headers.get('x-blocked')),
    });
  } catch (error) {
    checks.push({ provider: provider.name, active: provider.name === selectedProvider, ok: false,
      latencyMs: Math.round(performance.now() - start), error: error.cause?.code ?? error.name });
  }
}
console.log(JSON.stringify({
  selectedProvider, engine: `Leaflet ${require('leaflet/package.json').version}`,
  dependencies, checks,
}, null, 2));
const requiredChecks = checks.filter(
  (item) => item.active || item.provider === 'OpenStreetMap',
);
if (
  dependencies.some((item) => !item.compatible) ||
  requiredChecks.some((item) => !item.ok)
) process.exitCode = 1;
