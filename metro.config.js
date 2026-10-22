const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const isAdminWeb = process.env.EXPO_PUBLIC_CEBSPOT_TARGET === 'admin-web';

// Keep Metro's file map focused on the mobile app. These top-level folders
// contain large, unrelated projects or generated data that slow file watching.
const projectRootPattern = __dirname
  .split(/[\\/]/)
  .filter(Boolean)
  .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('[\\\\/]');
const ignoredProjectDirectories = new RegExp(
  `^${projectRootPattern}[\\\\/](?:\\.venv|\\.chrome-debug-profile|\\.chrome-video-review|face-blur-service|${isAdminWeb ? '' : 'admin-app|'}dist)(?:[\\\\/]|$)`,
);
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]),
  ignoredProjectDirectories,
].filter(Boolean);

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
