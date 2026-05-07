import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { AppButton } from '../src/components/AppButton';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';

export default function LoginScreen() {
  const { appColors } = useTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [displayName, setDisplayName] = useState('CebSpot Explorer');
  const [email, setEmail] = useState('test@example.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email || !password || (mode === 'sign-up' && !displayName)) {
      Alert.alert('Missing details', 'Please complete the form to continue.');
      return;
    }

    try {
      setLoading(true);
      if (mode === 'sign-in') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim());
        Alert.alert('Account created', 'Check your email if confirmation is enabled, then sign in.');
        setMode('sign-in');
      }
    } catch (error: any) {
      Alert.alert('Authentication failed', error.message ?? 'Please check your credentials.');
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
        <View style={styles.mark}>
          <Sparkles size={34} color={colors.white} />
        </View>
        <Text style={styles.brand}>CebSpot</Text>
        <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>
          The heartbeat of the city is waiting. Sign in to explore, reserve, and share your next spot.
        </Text>
      </View>

      <View style={[styles.panel, { backgroundColor: appColors.surfaceLow }]}>
        {mode === 'sign-up' && (
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            placeholderTextColor={appColors.onSurfaceVariant}
            style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.white }]}
          />
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

        <AppButton
          label={mode === 'sign-in' ? 'Enter the Pulse' : 'Create Account'}
          loading={loading}
          onPress={submit}
        />

        <Pressable onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
          <Text style={styles.toggle}>
            {mode === 'sign-in' ? 'Create a CebSpot account' : 'I already have an account'}
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.todo, { color: appColors.onSurfaceVariant }]}>
        TODO: Add Google Sign-In with Supabase OAuth after native client IDs are configured.
      </Text>
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
  mark: {
    width: 84,
    height: 84,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginBottom: spacing.lg,
    ...shadow.lifted,
  },
  brand: {
    color: colors.primary,
    fontSize: fontSize.display,
    fontWeight: '900',
    fontStyle: 'italic',
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
  toggle: {
    color: colors.primary,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingVertical: spacing.sm,
  },
  todo: {
    marginTop: spacing.xl,
    textAlign: 'center',
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
});
