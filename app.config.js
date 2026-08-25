const appJson = require('./app.json');
const releaseBuildProfiles = new Set(['preview', 'production']);
const isReleaseBuild = releaseBuildProfiles.has(process.env.EAS_BUILD_PROFILE ?? '');

module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      usesCleartextTraffic: !isReleaseBuild,
    },
  },
};
