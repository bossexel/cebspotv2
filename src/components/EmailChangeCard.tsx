import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CheckCircle2, Mail } from 'lucide-react-native';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { AppButton } from './AppButton';
import { fontSize, radius, spacing } from '../constants/design';
import { emailChangeService, type EmailChangeState } from '../services/emailChangeService';
import { validateNewAccountEmail } from '../utils/emailChange';
import { userErrorMessage } from '../utils/userError';

export function EmailChangeCard({ disabled = false, onBusyChange, confirmationReturn = false }: {
  disabled?: boolean; onBusyChange?: (busy: boolean) => void; confirmationReturn?: boolean;
}) {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const { appColors } = useTheme();
  const [state, setState] = useState<EmailChangeState | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const requestLock = useRef(false);
  const generation = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const current = useRef({ userId: user?.id, email: user?.email, profileEmail: profile?.email, disabled, refreshProfile, onBusyChange });
  current.current = { userId: user?.id, email: user?.email, profileEmail: profile?.email, disabled, refreshProfile, onBusyChange };
  const localCustomer = Boolean(user?.id && profile?.id === user.id && profile.role === 'user');

  const deadline = useMemo(() => {
    const sent = state?.pendingEmail && state.sentAt ? Date.parse(state.sentAt) : NaN;
    return Number.isFinite(sent) ? Math.min(sent + 60_000, Date.now() + 60_000) : 0;
  }, [state?.pendingEmail, state?.sentAt]);
  const cooldown = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const applyState = useCallback((next: EmailChangeState) => {
    const previous = stateRef.current;
    if (previous?.pendingEmail === next.currentEmail && !next.pendingEmail && next.profileSynced) {
      setNotice('Your new email is confirmed. Use it the next time you sign in.');
    }
    setNow(Date.now()); setState(next); stateRef.current = next;
  }, []);

  const checkStatus = useCallback(async () => {
    const { userId } = current.current;
    if (!userId || current.current.disabled || requestLock.current) return;
    const version = generation.current;
    requestLock.current = true; setBusy(true); setError(null); setNotice(null); current.current.onBusyChange?.(true);
    try {
      let next = await emailChangeService.getState(userId);
      if (version !== generation.current || current.current.userId !== userId) return;
      // getUser is authoritative even when this phone still caches the old
      // session email after confirmation in a different browser or device.
      const refreshUser = next.currentEmail !== current.current.email;
      if (refreshUser) {
        next = await emailChangeService.refreshIdentity(userId);
        if (version !== generation.current || current.current.userId !== userId) return;
      }
      if (refreshUser || (next.profileSynced && next.currentEmail !== current.current.profileEmail)) {
        await current.current.refreshProfile();
      }
      if (version === generation.current && current.current.userId === userId) applyState(next);
    } catch (failure) {
      if (version === generation.current && current.current.userId === userId) {
        setState(null); stateRef.current = null;
        setError(userErrorMessage(failure, 'Email status is unavailable. Check your connection and try again.'));
      }
    } finally {
      if (version === generation.current) {
        requestLock.current = false; setBusy(false); current.current.onBusyChange?.(false);
      }
    }
  }, [applyState]);

  useFocusEffect(useCallback(() => {
    generation.current += 1;
    requestLock.current = false; setBusy(false); setState(null); stateRef.current = null;
    setEditing(false); setDraft(''); setError(null); setNotice(null);
    if (!authLoading && localCustomer) void checkStatus();
    const subscription = AppState.addEventListener('change', value => {
      if (value === 'active' && !authLoading && localCustomer) void checkStatus();
    });
    return () => {
      generation.current += 1; requestLock.current = false;
      current.current.onBusyChange?.(false); subscription.remove();
    };
  }, [user?.id, authLoading, localCustomer, checkStatus]));

  async function sendChange(target: string) {
    const { userId } = current.current;
    if (!userId || !state?.profileSynced || requestLock.current || disabled || cooldown) return;
    const version = generation.current;
    requestLock.current = true; setBusy(true); setError(null); setNotice(null); current.current.onBusyChange?.(true);
    try {
      let next = await emailChangeService.requestChange(userId, target);
      if (version !== generation.current || current.current.userId !== userId) return;
      const refreshUser = next.currentEmail !== current.current.email;
      if (refreshUser) {
        next = await emailChangeService.refreshIdentity(userId);
        if (version !== generation.current || current.current.userId !== userId) return;
      }
      if (refreshUser || (next.profileSynced && next.currentEmail !== current.current.profileEmail)) {
        await current.current.refreshProfile();
      }
      if (version !== generation.current || current.current.userId !== userId) return;
      applyState(next); setEditing(false); setDraft('');
      if (next.pendingEmail) setNotice('Confirmation instructions were requested. Check the new address and your current inbox.');
      else if (next.currentEmail === target.trim().toLowerCase() && next.profileSynced) setNotice('Your new email is confirmed. Use it the next time you sign in.');
      else setNotice('Check your current email and pending status before requesting again.');
    } catch (failure) {
      if (version === generation.current && current.current.userId === userId) {
        // A network failure might follow a committed request. Require a status
        // check instead of treating it as unsent and sending duplicate emails.
        setState(null); stateRef.current = null;
        setError(userErrorMessage(failure, 'The request could not be confirmed. Use Check status before sending again.'));
      }
    } finally {
      if (version === generation.current) {
        requestLock.current = false; setBusy(false); current.current.onBusyChange?.(false);
      }
    }
  }

  let validation: string | null = null;
  if (draft && state) {
    try { validateNewAccountEmail(draft, state.currentEmail); }
    catch (failure) { validation = userErrorMessage(failure); }
  }
  const confirmed = state?.currentEmail ?? user?.email ?? profile?.email ?? '';
  const pending = state?.pendingEmail;

  return <View style={[styles.card, { backgroundColor: appColors.surfaceLow }]}>
    <View style={styles.row}><Mail size={20} color={appColors.onSurfaceVariant} /><Text style={[styles.heading, { color: appColors.onSurface }]}>Email address</Text></View>
    <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Current email</Text>
    <Text selectable testID="account-current-email" style={[styles.copy, { color: appColors.onSurface }]}>{confirmed || 'Sign in to view your account email.'}</Text>
    {pending && <View style={[styles.pending, { backgroundColor: appColors.surfaceHighest }]}>
      <Text style={[styles.label, { color: appColors.onSurface }]}>Awaiting confirmation</Text>
      <Text selectable testID="account-pending-email" style={[styles.copy, { color: appColors.onSurface }]}>{pending}</Text>
      <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>Open every confirmation email sent to the current and new addresses. Then return here and check status. Your current email stays active until confirmation is complete.</Text>
    </View>}
    {state && !state.profileSynced && <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>Your email is confirmed in the sign-in service. Account details are still updating. Check status again before making another change.</Text>}
    {confirmationReturn && state && !pending && state.profileSynced && <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>This is the email currently confirmed for your signed-in account.</Text>}
    {!!notice && <View style={styles.row}><CheckCircle2 size={18} color={appColors.success} /><Text accessibilityLiveRegion="polite" style={[styles.copy, styles.flex, { color: appColors.onSurface }]}>{notice}</Text></View>}
    {!!error && <Text accessibilityRole="alert" style={[styles.copy, { color: appColors.danger }]}>{error}</Text>}
    {!localCustomer && !authLoading && <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>Self-service email changes are available for regular user accounts.</Text>}
    {localCustomer && <>
      {editing && <View style={styles.form}>
        <Text style={[styles.label, { color: appColors.onSurface }]}>New email address</Text>
        <TextInput accessibilityLabel="New email address" value={draft} onChangeText={value => { setDraft(value); setError(null); }}
          editable={!busy && !disabled} autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254}
          placeholder="you@example.com" placeholderTextColor={appColors.onSurfaceVariant}
          style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.inputSurface, borderColor: validation ? appColors.danger : appColors.inputBorder }]} />
        {!!validation && <Text accessibilityRole="alert" style={[styles.copy, { color: appColors.danger }]}>{validation}</Text>}
        {pending && <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>Sending another request replaces the pending address.</Text>}
        <AppButton label="Send confirmation emails" onPress={() => void sendChange(draft)} loading={busy}
          disabled={disabled || !state?.profileSynced || !draft.trim() || Boolean(validation) || cooldown > 0} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close email form" disabled={busy} onPress={() => { setEditing(false); setDraft(''); }} style={styles.action}>
          <Text style={{ color: appColors.onSurfaceVariant }}>Close</Text>
        </Pressable>
      </View>}
      {busy && !editing && <ActivityIndicator accessibilityLabel="Checking email change" color={appColors.primary} />}
      <View style={styles.actions}>
        {!editing && <Pressable accessibilityRole="button" accessibilityLabel={pending ? 'Change pending email address' : 'Change email'}
          disabled={disabled || busy || !state?.profileSynced} onPress={() => { setEditing(true); setDraft(''); setError(null); }} style={styles.action}>
          <Text style={{ color: state?.profileSynced ? appColors.primary : appColors.onSurfaceVariant, fontWeight: '800' }}>{pending ? 'Use another address' : 'Change email'}</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Check email change status" disabled={disabled || busy} onPress={() => void checkStatus()} style={styles.action}>
          <Text style={{ color: appColors.primary, fontWeight: '800' }}>Check status</Text>
        </Pressable>
      </View>
      {!!pending && <AppButton label={cooldown ? `Send again in ${cooldown}s` : 'Resend confirmation emails'} variant="secondary"
        disabled={disabled || busy || cooldown > 0 || !state?.profileSynced} onPress={() => void sendChange(pending)} />}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  heading: { fontSize: fontSize.lg, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: '700' },
  copy: { fontSize: fontSize.sm, lineHeight: 19 },
  pending: { padding: spacing.md, borderRadius: radius.md, gap: spacing.sm },
  form: { gap: spacing.sm },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: fontSize.md },
  actions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  action: { minHeight: 44, paddingVertical: spacing.sm, justifyContent: 'center' },
});
