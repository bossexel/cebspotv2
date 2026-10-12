const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Preserve Render's `npm ci && npm run build` command and its dist output.
// A separate route root prevents publishing customer and owner screens.
const result = spawnSync(process.execPath, [
  path.resolve(__dirname, '../node_modules/expo/bin/cli'), ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PUBLIC_CEBSPOT_TARGET: 'admin-web',
    // SDK 52's prerequisite reads static app.json rather than dynamic platforms.
    // Web dependencies are declared explicitly; the resolved config is admin-only.
    EXPO_NO_WEB_SETUP: '1',
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
