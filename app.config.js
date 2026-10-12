const appJson = require('./app.json');
const releaseBuildProfiles = new Set(['preview', 'production']);
const isReleaseBuild = releaseBuildProfiles.has(process.env.EAS_BUILD_PROFILE ?? '');
const isAdminWeb = process.env.EXPO_PUBLIC_CEBSPOT_TARGET === 'admin-web';

module.exports = {
  expo: {
    ...appJson.expo,
    platforms: isAdminWeb ? ['web'] : ['android'],
    ...(isAdminWeb ? {
      web: { bundler: 'metro', output: 'single', favicon: './assets/cebspot-logo.png' },
    } : {}),
    extra: {
      ...appJson.expo.extra,
      router: { ...appJson.expo.extra.router, root: isAdminWeb ? './admin-app' : './app' },
    },
    android: {
      ...appJson.expo.android,
      usesCleartextTraffic: !isReleaseBuild,
    },
  },
};
