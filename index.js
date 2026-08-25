require('react-native-gesture-handler');

const notifyKit = require('react-native-notify-kit').default;

notifyKit.onBackgroundEvent(async () => undefined);

require('expo-router/entry');
