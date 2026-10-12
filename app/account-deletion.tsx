import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { accountDeletionService } from '../src/services/accountDeletionService';

export default function AccountDeletionScreen() {
  const { appColors } = useTheme();
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    let current = true;
    accountDeletionService.pending().then(value => { if (current) { setPending(value); setChecking(false); } })
      .catch(error => { if (current) { setMessage(error.message); setChecking(false); } });
    return () => { current = false; };
  }, []);
  async function remove() {
    if (lock.current || !user) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      if (!pending && password) await accountDeletionService.reauthenticate(user.email ?? '', password);
      setPassword('');
      const status = await accountDeletionService.request();
      if (status === 'pending') {
        setPending(true);
        setMessage('Deletion has started and account access is stopped. Wait at least 30 seconds, then tap Resume deletion. Closing the app does not cancel cleanup.');
      } else {
        try { await accountDeletionService.clearLocalData(user.id); }
        finally { await logOut(); router.replace('/login'); }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to finish deletion. Retry.');
      // A response may have been lost after the server committed its job.
      try { setPending(await accountDeletionService.pending()); } catch { /* Retain the last confirmed state. */ }
    } finally { lock.current = false; setBusy(false); }
  }
  return <ScreenContainer appColors={appColors} scroll>
    <View style={{ gap: 20, paddingVertical: 24 }}>
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={{ color: appColors.primary }}>Back</Text></Pressable>
      <Text style={{ fontSize: 28, fontWeight: '800', color: appColors.onSurface }}>Delete account</Text>
      <Text style={{ color: appColors.onSurface }}>This permanently removes your profile, posts, reviews, private files and circle membership. Reservation and payment ledger records retain amounts, dates and provider references with personal details removed.</Text>
      <Text style={{ color: appColors.onSurface }}>Close active bookings and resolve pending payments or refunds first. Assigned venue owners and administrators must transfer their responsibilities. Deletion cannot be cancelled once started.</Text>
      {!pending && <>
        <Text style={{ color: appColors.onSurfaceVariant }}>Confirm with your password. If you use another sign-in method, sign in again with that method before returning here.</Text>
        <TextInput accessibilityLabel="Password for account deletion" secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!busy}
          style={{ borderWidth: 1, borderColor: appColors.outlineVariant, borderRadius: 12, padding: 16, color: appColors.onSurface }} />
      </>}
      {!!message && <Text accessibilityLiveRegion="polite" style={{ color: appColors.onSurface }}>{message}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || checking} style={{ backgroundColor: appColors.primary, padding: 18, borderRadius: 12, opacity: busy || checking ? .5 : 1 }}
        onPress={() => pending ? void remove() : Alert.alert('Permanently delete account?', 'Your personal data will be removed. Financial records are retained without your contact details.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: () => { void remove(); } },
        ])}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Finishing deletion…' : pending ? 'Resume deletion' : 'Delete account permanently'}</Text>
      </Pressable>
    </View>
  </ScreenContainer>;
}
