import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/hooks/useAuth';
import { ThemeProvider } from '../src/hooks/useTheme';

export default function AdminWebLayout() {
  return <SafeAreaProvider><ThemeProvider><AuthProvider>
    <Stack screenOptions={{ headerShown: false }} />
  </AuthProvider></ThemeProvider></SafeAreaProvider>;
}
