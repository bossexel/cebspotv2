import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton } from '../src/components/AppButton';
import { getPrototypeRoleForEmail } from '../src/constants/authRoles';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { MIN_PASSWORD_LENGTH, getAuthErrorMessage, isValidEmail, normalizeEmail } from '../src/utils/auth';

const cebspotLogo = require('../assets/cebspot-logo.png');

export default function LoginScreen() {
  const { appColors } = useTheme();
  const router = useRouter();
  const { signIn, signInWithGoogle, signUp } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isBusy = loading || googleLoading;

  async function submit() {
    if (isBusy) return;

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password || (mode === 'sign-up' && (!trimmedFirstName || !trimmedLastName || !confirmPassword))) {
      Alert.alert('Missing details', 'Please complete the form to continue.');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    if (mode === 'sign-up' && password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Password too short', `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }

    if (mode === 'sign-up' && password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please type the same password twice.');
      return;
    }

    try {
      setLoading(true);
      if (mode === 'sign-in') {
        const role = getPrototypeRoleForEmail(normalizedEmail);
        if (role === 'admin' || role === 'owner') {
          router.replace(role === 'admin' ? '/admin' : '/owner-dashboard');
          return;
        }
        await signIn(normalizedEmail, password);
        router.replace('/');
      } else {
        await signUp(normalizedEmail, password, trimmedFirstName, trimmedLastName);
        Alert.alert('Verify your email', 'We sent a verification link to your email. Open it before signing in.');
        setMode('sign-in');
        setFirstName('');
        setLastName('');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      Alert.alert('Authentication failed', getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function continueWithGoogle() {
    if (isBusy) return;

    try {
      setGoogleLoading(true);
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert('Google sign-in failed', getAuthErrorMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: appColors.surface }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image source={cebspotLogo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brand}>CebSpot</Text>
          <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>
            Find your spot at the heart of Cebu.
          </Text>
        </View>

        <View style={[styles.panel, { backgroundColor: appColors.surfaceLow }]}>
          {mode === 'sign-up' && (
            <View style={styles.nameRow}>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                placeholder="First name"
                placeholderTextColor={appColors.onSurfaceVariant}
                style={[
                  styles.input,
                  styles.nameInput,
                  { color: appColors.onSurface, backgroundColor: appColors.white },
                ]}
              />
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                placeholder="Last name"
                placeholderTextColor={appColors.onSurfaceVariant}
                style={[
                  styles.input,
                  styles.nameInput,
                  { color: appColors.onSurface, backgroundColor: appColors.white },
                ]}
              />
            </View>
          )}
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={appColors.onSurfaceVariant}
            style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.white }]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={appColors.onSurfaceVariant}
            style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.white }]}
          />
          {mode === 'sign-up' && (
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Confirm password"
              placeholderTextColor={appColors.onSurfaceVariant}
              style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.white }]}
            />
          )}

          {mode === 'sign-in' && (
            <Pressable
              disabled={isBusy}
              onPress={() => router.push('/reset-password')}
              style={styles.forgotButton}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          )}

          <AppButton
            label={mode === 'sign-in' ? 'Login' : 'Create Account'}
            disabled={googleLoading}
            loading={loading}
            onPress={submit}
          />

          <Pressable
            disabled={isBusy}
            onPress={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setConfirmPassword('');
            }}
          >
            <Text style={styles.toggle}>
              {mode === 'sign-in' ? 'Create a CebSpot account' : 'I already have an account'}
            </Text>
          </Pressable>

          <View style={styles.separator}>
            <View style={[styles.separatorLine, { backgroundColor: appColors.outlineVariant }]} />
            <Text style={[styles.separatorText, { color: appColors.onSurfaceVariant }]}>OR</Text>
            <View style={[styles.separatorLine, { backgroundColor: appColors.outlineVariant }]} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            disabled={isBusy}
            onPress={continueWithGoogle}
            style={({ pressed }) => [
              styles.googleButton,
              { backgroundColor: appColors.surface, borderColor: appColors.outlineVariant },
              isBusy && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.googleIcon}>
              {googleLoading ? (
                <ActivityIndicator color={appColors.onSurface} size="small" />
              ) : (
                <Text style={styles.googleMark}>G</Text>
              )}
            </View>
            <Text style={[styles.googleLabel, { color: appColors.onSurface }]}>Continue with Google</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    width: 156,
    height: 184,
    marginBottom: spacing.lg,
  },
  brand: {
    color: colors.primary,
    fontSize: fontSize.display,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  copy: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: fontSize.lg,
    lineHeight: 24,
    fontWeight: '600',
  },
  panel: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
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
  nameRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  nameInput: {
    flex: 1,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  forgotText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  toggle: {
    color: colors.primary,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingVertical: spacing.sm,
  },
  separator: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  separatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  separatorText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  googleButton: {
    minHeight: 54,
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  googleMark: {
    color: '#4285F4',
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  googleIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
