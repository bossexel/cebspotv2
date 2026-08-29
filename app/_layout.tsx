import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  Montserrat_400Regular,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
  useFonts,
} from '@expo-google-fonts/montserrat';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppUpdatePrompt } from '../src/components/AppUpdatePrompt';
import { ConfirmationModal } from '../src/components/ConfirmationModal';
import { getPrototypeRoleForEmail } from '../src/constants/authRoles';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { ThemeProvider, useTheme } from '../src/hooks/useTheme';
import { initializeSpotSubmissionNotifications } from '../src/services/spotSubmissionNotificationService';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
initializeSpotSubmissionNotifications();

const cebspotLogo = require('../assets/cebspot-logo.png');

function AppNavigator() {
  const { isSignedIn, loading: authLoading, profile } = useAuth();
  const { isDarkMode, loading: themeLoading, appColors } = useTheme();
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Montserrat_900Black,
  });
  const router = useRouter();
  const segments = useSegments();
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !themeLoading && fontsLoaded) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [authLoading, fontsLoaded, themeLoading]);

  useEffect(() => {
    if (authLoading || themeLoading || !fontsLoaded) return;

    const publicRoutes = ['login', 'reset-password', 'auth', 'admin', 'owner-dashboard'];
    const isPublicRoute = publicRoutes.includes(segments[0] ?? '');
    const onLogin = segments[0] === 'login';
    if (!isSignedIn && !isPublicRoute) {
      router.replace('/login');
    }
    if (isSignedIn && onLogin && profile) {
      const role = profile.role ?? getPrototypeRoleForEmail(profile.email);
      router.replace(role === 'admin' ? '/admin' : role === 'owner' ? '/owner-dashboard' : '/');
    }
  }, [authLoading, fontsLoaded, isSignedIn, profile, router, segments, themeLoading]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const currentRoute = segments[0] ?? 'index';
    const isRootRoute = ['index', 'circle', 'activity', 'profile', 'login'].includes(currentRoute) && segments.length <= 1;
    if (!isRootRoute) return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setExitConfirmationOpen(true);
      return true;
    });
    return () => subscription.remove();
  }, [segments]);

  const startupPending = authLoading || themeLoading || !fontsLoaded;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: appColors.surface },
        }}
      >
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth/callback" options={{ gestureEnabled: false }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="circle" />
        <Stack.Screen name="circle/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="activity" />
        <Stack.Screen name="reservations" />
        <Stack.Screen name="saved" />
        <Stack.Screen name="gamification" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="owner-dashboard" />
        <Stack.Screen name="owner-access" options={{ presentation: 'modal' }} />
        <Stack.Screen name="submit-spot" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="spot/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="reservation/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="checkout/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="confirmed/[id]" options={{ gestureEnabled: false }} />
      </Stack>
      <ConfirmationModal
        visible={exitConfirmationOpen}
        title="Exit CebSpot?"
        message="Are you sure you want to exit CebSpot?"
        onRequestClose={() => setExitConfirmationOpen(false)}
        actions={[
          {
            label: 'Cancel',
            onPress: () => setExitConfirmationOpen(false),
          },
          {
            label: 'Exit',
            variant: 'destructive',
            onPress: () => {
              setExitConfirmationOpen(false);
              BackHandler.exitApp();
            },
          },
        ]}
      />
      <AppUpdatePrompt />
      <StatusBar style={isDarkMode ? 'light' : 'dark'} backgroundColor={appColors.surface} />
      {startupPending ? <StartupFallback appColors={appColors} /> : null}
    </>
  );
}

function StartupFallback({ appColors }: { appColors: ReturnType<typeof useTheme>['appColors'] }) {
  return (
    <View style={[styles.startupScreen, { backgroundColor: appColors.surface }]}>
      <Image source={cebspotLogo} style={styles.startupLogo} resizeMode="contain" />
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 1000,
    elevation: 1000,
  },
  startupLogo: {
    width: 138,
    height: 162,
    marginBottom: 6,
  },
  startupText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
