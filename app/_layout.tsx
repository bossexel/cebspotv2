import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { ThemeProvider, useTheme } from '../src/hooks/useTheme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppNavigator() {
  const { isSignedIn, loading: authLoading } = useAuth();
  const { isDarkMode, loading: themeLoading, appColors } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!authLoading && !themeLoading) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [authLoading, themeLoading]);

  useEffect(() => {
    if (authLoading || themeLoading) return;

    const onLogin = segments[0] === 'login';
    if (!isSignedIn && !onLogin) {
      router.replace('/login');
    }
    if (isSignedIn && onLogin) {
      router.replace('/');
    }
  }, [authLoading, isSignedIn, router, segments, themeLoading]);

  if (authLoading || themeLoading) return null;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: appColors.surface },
        }}
      >
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="circle" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="submit-spot" options={{ presentation: 'modal' }} />
        <Stack.Screen name="spot/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="reservation/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="checkout/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="confirmed/[id]" options={{ gestureEnabled: false }} />
      </Stack>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} backgroundColor={appColors.surface} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
