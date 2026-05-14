import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

    const publicRoutes = ['login', 'admin', 'owner-dashboard'];
    const isPublicRoute = publicRoutes.includes(segments[0] ?? '');
    const onLogin = segments[0] === 'login';
    if (!isSignedIn && !isPublicRoute) {
      router.replace('/login');
    }
    if (isSignedIn && onLogin) {
      router.replace('/');
    }
  }, [authLoading, isSignedIn, router, segments, themeLoading]);

  if (authLoading || themeLoading) {
    return <StartupFallback appColors={appColors} />;
  }

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
        <Stack.Screen name="reservations" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="owner-dashboard" />
        <Stack.Screen name="owner-access" options={{ presentation: 'modal' }} />
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

function StartupFallback({ appColors }: { appColors: ReturnType<typeof useTheme>['appColors'] }) {
  return (
    <View style={[styles.startupScreen, { backgroundColor: appColors.surface }]}>
      <ActivityIndicator color={appColors.primary} />
      <Text style={[styles.startupText, { color: appColors.onSurfaceVariant }]}>Starting CebSpot...</Text>
    </View>
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

const styles = StyleSheet.create({
  startupScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  startupText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
