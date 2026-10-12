const { Platform } = require('react-native');

if (Platform.OS !== 'android') {
  throw new Error('CebSpot is available on Android only.');
}

require('react-native-gesture-handler');

const notifyKit = require('react-native-notify-kit').default;

notifyKit.onBackgroundEvent(async () => undefined);

require('expo-router/entry');
