if (process.env.EXPO_PUBLIC_CEBSPOT_TARGET !== 'admin-web') {
  throw new Error('CebSpot customers and owners use Android only. This web entry is for admins.');
}

require('react-native-gesture-handler');
require('expo-router/entry');
