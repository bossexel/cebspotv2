import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { AlertCircle, ArrowLeft, Check, Circle, KeyRound, MailCheck, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { AppButton } from '../src/components/AppButton';
import { PasswordInput } from '../src/components/PasswordInput';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import {
  getAuthErrorMessage,
  getPasswordRequirements,
  isPasswordReady,
  isValidEmail,
  normalizeEmail,
} from '../src/utils/auth';

const cebspotLogo = require('../assets/cebspot-logo.png');
const RESET_COOLDOWN_SECONDS = 60;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const {
    completePasswordRecovery,
    isSignedIn,
    logOut,
    passwordRecoveryError,
    passwordRecoveryStatus,
    resetPassword,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [requestAttempted, setRequestAttempted] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordAttempted, setPasswordAttempted] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [loading, setLoading] = useState(false);

  const normalizedEmail = normalizeEmail(email);
  const emailIsValid = isValidEmail(normalizedEmail);
  const resetRequestCoolingDown = cooldownSeconds > 0 && normalizedEmail === submittedEmail;
  const passwordRequirements = useMemo(() => getPasswordRequirements(password), [password]);
  const passwordMeetsRequirements = isPasswordReady(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canUpdatePassword = passwordMeetsRequirements && passwordsMatch;

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function requestResetEmail() {
    if (loading || resetRequestCoolingDown) return;

    setRequestAttempted(true);
    setRequestError(null);
    if (!normalizedEmail || !emailIsValid) return;

    try {
      setLoading(true);
      await resetPassword(normalizedEmail);
      setSubmittedEmail(normalizedEmail);
      setEmailSent(true);
      setRequestAttempted(false);
      setCooldownSeconds(RESET_COOLDOWN_SECONDS);
    } catch (error) {
      setRequestError(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function updateAccountPassword() {
    if (loading) return;

    setPasswordAttempted(true);
    setUpdateError(null);
    if (!canUpdatePassword) return;

    try {
      setLoading(true);
      await completePasswordRecovery(password);
      setPassword('');
      setConfirmPassword('');
      setPasswordUpdated(true);
    } catch (error) {
      setUpdateError(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function returnToLogin() {
    if (isSignedIn) await logOut();
    router.replace('/login');
  }

  function useDifferentEmail() {
    setEmailSent(false);
    setRequestError(null);
    setRequestAttempted(false);
  }

  const isCheckingLink = passwordRecoveryStatus === 'processing';
  const isRecoveryReady = passwordRecoveryStatus === 'ready';

  const heading = passwordUpdated
    ? 'Password changed'
    : isCheckingLink
      ? 'Checking your link'
      : isRecoveryReady
        ? 'Choose your account password'
        : emailSent
          ? 'Check your inbox'
          : 'Forgot password?';

  const supportingCopy = passwordUpdated
    ? 'Your new password is ready to use.'
    : isCheckingLink
      ? 'One moment while CebSpot validates your reset link.'
      : isRecoveryReady
        ? 'Create a secure password for this CebSpot account.'
        : emailSent
          ? 'Use the secure link in your email to continue.'
          : 'Enter your account email to receive a secure reset link.';

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
          <Text style={[styles.brand, { color: appColors.primary }]}>{heading}</Text>
          <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>{supportingCopy}</Text>
        </View>

        <View
          style={[
            styles.panel,
            { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant },
          ]}
        >
          {passwordUpdated ? (
            <View style={styles.centeredState}>
              <View style={[styles.statusIcon, { backgroundColor: appColors.successContainer }]}>
                <ShieldCheck size={30} color={appColors.success} />
              </View>
              <Text style={[styles.stateTitle, { color: appColors.onSurface }]}>Reset complete</Text>
              <Text style={[styles.stateCopy, { color: appColors.onSurfaceVariant }]}>
                For your security, active sessions were signed out. Sign in again with your new password.
              </Text>
              <AppButton
                label="Return to login"
                icon={<ArrowLeft size={18} color={colors.white} />}
                onPress={() => router.replace('/login')}
                style={styles.fullWidthButton}
              />
            </View>
          ) : isCheckingLink ? (
            <View style={styles.centeredState}>
              <ActivityIndicator color={appColors.primary} size="large" />
              <Text style={[styles.stateTitle, { color: appColors.onSurface }]}>Validating reset link</Text>
              <Text style={[styles.stateCopy, { color: appColors.onSurfaceVariant }]}>This should only take a moment.</Text>
            </View>
          ) : isRecoveryReady ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: appColors.onSurface }]}>New password</Text>
                <PasswordInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setUpdateError(null);
                  }}
                  placeholder="Enter new password"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!loading}
                />
              </View>

              <View style={styles.requirementList}>
                {passwordRequirements.map((requirement) => (
                  <View key={requirement.key} style={styles.requirementRow}>
                    {requirement.met ? (
                      <Check size={17} color={appColors.success} strokeWidth={3} />
                    ) : (
                      <Circle size={17} color={appColors.outline} />
                    )}
                    <Text
                      style={[
                        styles.requirementText,
                        { color: requirement.met ? appColors.success : appColors.onSurfaceVariant },
                      ]}
                    >
                      {requirement.label}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: appColors.onSurface }]}>Confirm new password</Text>
                <PasswordInput
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    setUpdateError(null);
                  }}
                  placeholder="Enter it again"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!loading}
                  onSubmitEditing={updateAccountPassword}
                />
                {confirmPassword.length > 0 && !passwordsMatch ? (
                  <Text style={[styles.fieldError, { color: appColors.danger }]}>Passwords do not match.</Text>
                ) : null}
              </View>

              {passwordAttempted && !passwordMeetsRequirements ? (
                <StatusMessage
                  icon={<AlertCircle size={18} color={appColors.danger} />}
                  message="Complete all password requirements before continuing."
                />
              ) : null}
              {updateError ? (
                <StatusMessage icon={<AlertCircle size={18} color={appColors.danger} />} message={updateError} />
              ) : null}

              <AppButton
                label="Update password"
                icon={<KeyRound size={18} color={colors.white} />}
                disabled={!canUpdatePassword}
                loading={loading}
                onPress={updateAccountPassword}
              />
            </>
          ) : emailSent ? (
            <View style={styles.centeredState}>
              <View style={[styles.statusIcon, { backgroundColor: appColors.primary + '14' }]}>
                <MailCheck size={30} color={appColors.primary} />
              </View>
              <Text style={[styles.stateTitle, { color: appColors.onSurface }]}>Email requested</Text>
              <Text style={[styles.stateCopy, { color: appColors.onSurfaceVariant }]}>
                If an account exists for {submittedEmail}, a password reset link is on its way.
              </Text>
              <Text style={[styles.privateNotice, { color: appColors.onSurfaceVariant }]}>
                Check your spam folder if it does not appear after a few minutes.
              </Text>
              {requestError ? (
                <StatusMessage icon={<AlertCircle size={18} color={appColors.danger} />} message={requestError} />
              ) : null}
              <AppButton
                label={cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : 'Resend reset link'}
                icon={<RotateCcw size={18} color={appColors.primary} />}
                variant="secondary"
                disabled={cooldownSeconds > 0}
                loading={loading}
                onPress={requestResetEmail}
                style={styles.fullWidthButton}
              />
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={useDifferentEmail}
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
              >
                <Text style={[styles.textButtonLabel, { color: appColors.primary }]}>Use a different email</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {passwordRecoveryStatus === 'invalid' && passwordRecoveryError ? (
                <StatusMessage
                  icon={<AlertCircle size={18} color={appColors.danger} />}
                  message={passwordRecoveryError}
                />
              ) : null}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: appColors.onSurface }]}>Email address</Text>
                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setRequestError(null);
                  }}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={appColors.onSurfaceVariant}
                  selectionColor={appColors.primary}
                  editable={!loading}
                  returnKeyType="send"
                  onSubmitEditing={requestResetEmail}
                  style={[
                    styles.input,
                    {
                      color: appColors.onSurface,
                      backgroundColor: appColors.inputSurface,
                      borderColor: requestAttempted && !emailIsValid ? appColors.danger : appColors.inputBorder,
                    },
                  ]}
                />
                {requestAttempted && !normalizedEmail ? (
                  <Text style={[styles.fieldError, { color: appColors.danger }]}>Enter your account email.</Text>
                ) : requestAttempted && !emailIsValid ? (
                  <Text style={[styles.fieldError, { color: appColors.danger }]}>Enter a valid email address.</Text>
                ) : null}
              </View>
              {requestError ? (
                <StatusMessage icon={<AlertCircle size={18} color={appColors.danger} />} message={requestError} />
              ) : null}
              <AppButton
                label={resetRequestCoolingDown ? `Try again in ${cooldownSeconds}s` : 'Send reset link'}
                icon={<MailCheck size={18} color={colors.white} />}
                disabled={resetRequestCoolingDown}
                loading={loading}
                onPress={requestResetEmail}
              />
            </>
          )}

          {!passwordUpdated ? (
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={() => void returnToLogin()}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <ArrowLeft size={17} color={appColors.primary} />
              <Text style={[styles.backToLogin, { color: appColors.primary }]}>Back to login</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StatusMessage({ icon, message }: { icon: React.ReactNode; message: string }) {
  const { appColors } = useTheme();

  return (
    <View style={[styles.statusMessage, { backgroundColor: appColors.dangerContainer }]} accessibilityRole="alert">
      {icon}
      <Text style={[styles.statusMessageText, { color: appColors.onSurface }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  hero: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 96,
    height: 112,
    marginBottom: spacing.md,
  },
  brand: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    textAlign: 'center',
  },
  copy: {
    marginTop: spacing.sm,
    maxWidth: 390,
    textAlign: 'center',
    fontSize: fontSize.md,
    lineHeight: 21,
    fontWeight: '600',
  },
  panel: {
    width: '100%',
    maxWidth: 480,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.card,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  input: {
    minHeight: 54,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    fontWeight: '700',
    borderWidth: 1,
  },
  fieldError: {
    fontSize: fontSize.sm,
    lineHeight: 18,
    fontWeight: '700',
  },
  requirementList: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  requirementRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requirementText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 18,
    fontWeight: '700',
  },
  centeredState: {
    alignItems: 'center',
    gap: spacing.md,
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    textAlign: 'center',
  },
  stateCopy: {
    maxWidth: 380,
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  privateNotice: {
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusMessage: {
    width: '100%',
    minHeight: 48,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusMessageText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '700',
  },
  fullWidthButton: {
    width: '100%',
  },
  textButton: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  backButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  backToLogin: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.65,
  },
});
