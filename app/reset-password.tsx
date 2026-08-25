import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton } from '../src/components/AppButton';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { MIN_PASSWORD_LENGTH, getAuthErrorMessage, isValidEmail, normalizeEmail } from '../src/utils/auth';

const cebspotLogo = require('../assets/cebspot-logo.png');

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const { isSignedIn, logOut, resetPassword, updatePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestResetEmail() {
    if (loading) return;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      Alert.alert('Email required', 'Enter the email connected to your CebSpot account.');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      await resetPassword(normalizedEmail);
      Alert.alert('Reset email sent', 'Password reset instructions were sent to your email.');
    } catch (error: any) {
      Alert.alert('Reset failed', getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function updateAccountPassword() {
    if (loading) return;

    if (!password || !confirmPassword) {
      Alert.alert('Missing password', 'Enter and confirm your new password.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Password too short', `Use at least ${MIN_PASSWORD_LENGTH} characters for your new password.`);
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please type the same password twice.');
      return;
    }

    try {
      setLoading(true);
      await updatePassword(password);
      Alert.alert('Password updated', 'You can now sign in with your new password.', [
        {
          text: 'Continue',
          onPress: async () => {
            await logOut();
            router.replace('/login');
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert('Update failed', getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: appColors.surface }]}
    >
      <View style={styles.hero}>
        <Image source={cebspotLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>Reset Password</Text>
        <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>
          {isSignedIn
            ? 'Create a new password for your CebSpot account.'
            : 'Enter your account email and we will send a reset link.'}
        </Text>
      </View>

      <View style={[styles.panel, { backgroundColor: appColors.surfaceLow }]}>
        {isSignedIn ? (
          <>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="New password"
              placeholderTextColor={appColors.onSurfaceVariant}
              style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.white }]}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Confirm password"
              placeholderTextColor={appColors.onSurfaceVariant}
              style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.white }]}
            />

            <AppButton label="Update Password" loading={loading} onPress={updateAccountPassword} />
          </>
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Account email"
              placeholderTextColor={appColors.onSurfaceVariant}
              style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.white }]}
            />
            <Text style={[styles.notice, { color: appColors.onSurfaceVariant }]}>
              After opening the email link, this screen will let you set a new password.
            </Text>

            <AppButton label="Send Reset Link" loading={loading} onPress={requestResetEmail} />
          </>
        )}

        <Pressable onPress={() => router.replace('/login')}>
          <Text style={styles.backToLogin}>Back to login</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    width: 132,
    height: 156,
    marginBottom: spacing.lg,
  },
  brand: {
    color: colors.primary,
    fontSize: fontSize.xxl,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  copy: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: '700',
  },
  panel: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  notice: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  input: {
    minHeight: 54,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '66',
  },
  backToLogin: {
    color: colors.primary,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingVertical: spacing.sm,
  },
});
