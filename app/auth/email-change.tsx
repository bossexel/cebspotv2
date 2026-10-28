import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { EmailChangeCard } from '../../src/components/EmailChangeCard';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { fontSize, spacing } from '../../src/constants/design';

export default function EmailChangeReturnScreen() {
  const { appColors } = useTheme();
  const { isSignedIn, loading, profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ error?: string; error_code?: string; error_description?: string }>();
  return <ScreenContainer appColors={appColors} scroll>
    <View style={styles.content}>
      <Text accessibilityRole="header" style={[styles.title, { color: appColors.onSurface }]}>Check email change</Text>
      {(params.error || params.error_code || params.error_description) && <Text accessibilityRole="alert" style={{ color: appColors.danger }}>This confirmation link could not be used. Check the pending status or request new confirmation emails.</Text>}
      {loading ? <Text style={{ color: appColors.onSurfaceVariant }}>Loading your account…</Text>
        : isSignedIn ? <EmailChangeCard confirmationReturn />
          : <Text style={{ color: appColors.onSurfaceVariant }}>Sign in to check your account email. If you completed confirmation, use your new email address.</Text>}
      <Pressable accessibilityRole="button" style={styles.button}
        onPress={() => router.replace(!isSignedIn ? '/login' : profile?.role === 'owner' ? '/owner-dashboard' : profile?.role === 'admin' ? '/admin' : '/account-details')}>
        <Text style={{ color: appColors.primary, fontWeight: '800' }}>{isSignedIn ? 'Back to account' : 'Sign in'}</Text>
      </Pressable>
    </View>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md }, title: { fontSize: fontSize.xxl, fontWeight: '900' },
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
