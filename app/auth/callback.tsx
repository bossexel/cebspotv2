import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useRootNavigationState, useRouter } from 'expo-router';
import { colors } from '../../src/constants/colors';
import { fontSize, spacing } from '../../src/constants/design';
import { getPrototypeRoleForEmail } from '../../src/constants/authRoles';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';

const cebspotLogo = require('../../assets/cebspot-logo.png');

export default function AuthCallbackScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const hasRedirected = useRef(false);
  const { appColors } = useTheme();
  const { isSignedIn, loading, profile, user } = useAuth();

  useEffect(() => {
    if (loading || !rootNavigationState?.key || hasRedirected.current) return;

    hasRedirected.current = true;

    if (!isSignedIn) {
      router.replace('/login');
      return;
    }

    const role = profile?.role ?? getPrototypeRoleForEmail(profile?.email ?? user?.email);
    router.replace(role === 'admin' ? '/admin' : role === 'owner' ? '/owner-dashboard' : '/');
  }, [isSignedIn, loading, profile?.email, profile?.role, rootNavigationState?.key, router, user?.email]);

  return (
    <View style={[styles.container, { backgroundColor: appColors.surface }]}>
      <Image source={cebspotLogo} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator color={appColors.primary} />
      <Text style={[styles.text, { color: appColors.onSurfaceVariant }]}>Finishing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  logo: {
    width: 132,
    height: 156,
  },
  text: {
    color: colors.onSurfaceVariant,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
