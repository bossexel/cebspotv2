const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const isAdminWeb = process.env.EXPO_PUBLIC_CEBSPOT_TARGET === 'admin-web';
const supportedPlatform = isAdminWeb ? 'web' : 'android';
config.resolver.platforms = [supportedPlatform];
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform && platform !== supportedPlatform) {
    throw new Error('CebSpot customers and owners use Android only. Web builds require the admin target.');
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
