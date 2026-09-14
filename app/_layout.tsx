import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { canAccessRootRoute, getAppRole, getRoleHome } from '../src/constants/authRoles';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { ThemeProvider, useTheme } from '../src/hooks/useTheme';
import { activityService } from '../src/services/activityService';
import { reservationReminderService } from '../src/services/reservationReminderService';
import { reservationService } from '../src/services/reservationService';
import { initializeSpotSubmissionNotifications } from '../src/services/spotSubmissionNotificationService';
import { userNotificationService, type UserNotificationRoute } from '../src/services/userNotificationService';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
initializeSpotSubmissionNotifications();

const cebspotLogo = require('../assets/cebspot-logo.png');
const spotNotificationTypes = [
  'spot_comment',
  'spot_liked',
  'submission_approved',
  'reservation_approved',
  'reservation_checked_in',
  'reservation_no_show',
];

function AppNavigator() {
  const { user, isSignedIn, loading: authLoading, profile } = useAuth();
  const { isDarkMode, loading: themeLoading, appColors } = useTheme();
  useFonts({
    Montserrat_400Regular,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Montserrat_900Black,
  });
  const router = useRouter();
  const segments = useSegments();
  const currentRoute = segments[0] ?? '';
  const accountRole = profile ? getAppRole(profile) : null;
  const isUserSession = isSignedIn && accountRole === 'user';
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !themeLoading) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [authLoading, themeLoading]);

  useEffect(() => {
    if (authLoading || themeLoading) return;

    const publicRoutes = ['login', 'reset-password', 'auth', 'admin', 'owner-dashboard', 'owner-access'];
    const isPublicRoute = publicRoutes.includes(currentRoute);
    if (!isSignedIn && !isPublicRoute) {
      router.replace('/login');
      return;
    }
    if (isSignedIn && accountRole && !canAccessRootRoute(accountRole, currentRoute)) {
      router.replace(getRoleHome(accountRole));
    }
  }, [accountRole, authLoading, currentRoute, isSignedIn, router, themeLoading]);

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

  const routeFromNotification = useCallback((route: UserNotificationRoute) => {
    if (route.routeType === 'activity_post') {
      router.push({
        pathname: '/activity',
        params: { openSubmissionId: route.submissionId },
      });
      return;
    }

    if (route.routeType === 'map_spot') {
      router.push({
        pathname: '/',
        params: {
          focusSpotId: route.spotId,
          openSpot: '1',
        },
      });
      return;
    }

    if (route.routeType === 'reservation') {
      router.push(`/confirmed/${route.reservationId}`);
      return;
    }

    router.push(`/spot/${route.spotId}`);
  }, [router]);

  useEffect(() => {
    if (!isUserSession) return undefined;

    let unsubscribe: (() => void) | undefined;
    let mounted = true;

    userNotificationService
      .registerNotificationPressHandler((route) => {
        if (mounted) routeFromNotification(route);
      })
      .then((cleanup) => {
        if (mounted) unsubscribe = cleanup;
        else cleanup();
      })
      .catch((error) => {
        console.warn('Unable to register notification press routing:', error);
      });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [isUserSession, routeFromNotification]);

  useEffect(() => {
    if (!user?.id || !isUserSession) return undefined;

    let mounted = true;
    let running = false;

    const syncReservationReminders = async () => {
      if (!mounted || running) return;
      running = true;
      try {
        const reservations = await reservationService.getUserReservations(user.id);
        if (!mounted) return;
        await reservationReminderService.sync(reservations);
        await reservationReminderService.processDueActivities(user.id, reservations);
      } catch (error) {
        console.warn('Unable to sync reservation reminders:', error);
      } finally {
        running = false;
      }
    };

    void syncReservationReminders();
    const interval = setInterval(() => void syncReservationReminders(), 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isUserSession, user?.id]);

  useEffect(() => {
    if (!user?.id || !isUserSession) {
      seenNotificationIdsRef.current = new Set();
      return undefined;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    activityService
      .getRecentActivities(20, user.id)
      .then((recentActivities) => {
        if (!mounted) return;
        seenNotificationIdsRef.current = new Set(recentActivities.map((activity) => activity.id));
        unsubscribe = activityService.subscribeToActivities((nextActivities) => {
          const seenIds = seenNotificationIdsRef.current;
          const unseenNotifications = nextActivities
            .filter((activity) => spotNotificationTypes.includes(activity.type))
            .filter((activity) => !seenIds.has(activity.id))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          nextActivities.forEach((activity) => seenIds.add(activity.id));
          unseenNotifications.forEach((activity) => {
            void userNotificationService.displayActivityNotification(activity);
          });
        }, user.id);
      })
      .catch((error) => {
        console.warn('Unable to subscribe to user notifications:', error);
      });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [isUserSession, user?.id]);

  const roleRedirectPending = Boolean(
    isSignedIn && accountRole && !canAccessRootRoute(accountRole, currentRoute),
  );
  const startupPending = authLoading || themeLoading || roleRedirectPending;

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
        <Stack.Screen name="owner-dashboard" options={{ gestureEnabled: false }} />
        <Stack.Screen name="owner-access" options={{ presentation: 'modal' }} />
        <Stack.Screen name="submit-spot" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="spot/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="reservation/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="checkout/[id]" options={{ presentation: 'card', gestureEnabled: false }} />
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
