import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, ChevronRight, LockKeyhole, UserRound } from 'lucide-react-native';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { AppButton } from '../src/components/AppButton';
import { EmailChangeCard } from '../src/components/EmailChangeCard';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { colors } from '../src/constants/colors';
import { fontSize, radius, spacing } from '../src/constants/design';
import { accountDetailsService } from '../src/services/accountDetailsService';
import { profilePhotoService } from '../src/services/profilePhotoService';
import { profileService } from '../src/services/profileService';
import { userErrorMessage } from '../src/utils/userError';

export default function AccountDetailsScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const { appColors } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [nameSaveFailed, setNameSaveFailed] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const busy = useRef(false);
  const dirty = useRef(false);
  const owner = useRef<string | null>(null);
  const activeUser = useRef(user?.id);
  activeUser.current = user?.id;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const storedFirst = profile?.first_name ?? user?.user_metadata?.first_name ?? '';
  const storedLast = profile?.last_name ?? user?.user_metadata?.last_name ?? '';
  useEffect(() => {
    if (owner.current !== user?.id) {
      owner.current = user?.id ?? null;
      dirty.current = false;
      setError(null); setSaved(false); setNameSaveFailed(false);
    }
    if (!dirty.current) { setFirstName(storedFirst); setLastName(storedLast); }
  }, [user?.id, storedFirst, storedLast]);

  const email = user?.email ?? profile?.email ?? '';
  const nameChanged = firstName.trim() !== storedFirst || lastName.trim() !== storedLast;
  const canEdit = Boolean(user?.id && profile?.id === user.id);

  async function saveName() {
    if (!user?.id || !canEdit || busy.current || emailBusy) return;
    const userId = user.id;
    busy.current = true; setSaving(true); setError(null); setSaved(false);
    try {
      await accountDetailsService.updateNames(userId, firstName, lastName);
      if (!mounted.current || activeUser.current !== userId) return;
      await refreshProfile();
      if (!mounted.current || activeUser.current !== userId) return;
      dirty.current = false;
      setNameSaveFailed(false);
      setFirstName(firstName.trim()); setLastName(lastName.trim()); setSaved(true);
    } catch (failure) {
      if (mounted.current && activeUser.current === userId) {
        setNameSaveFailed(true);
        setError(userErrorMessage(failure, 'Your name could not be refreshed. Please retry saving your name.'));
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  async function changePhoto() {
    if (!user?.id || !canEdit || busy.current || emailBusy) return;
    const userId = user.id;
    busy.current = true; setUploading(true); setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo access to choose your profile picture.'); return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      if (result.canceled || !result.assets[0] || activeUser.current !== userId || !mounted.current) return;
      const asset = result.assets[0];
      const url = await profilePhotoService.upload(userId, { uri: asset.uri, width: asset.width, fileSize: asset.fileSize });
      if (activeUser.current !== userId || !mounted.current) return;
      await profileService.updateProfile(userId, { photo_url: url });
      if (activeUser.current === userId && mounted.current) await refreshProfile();
    } catch (failure) {
      if (mounted.current && activeUser.current === userId) setError(userErrorMessage(failure, 'Your profile picture could not be saved. Choose a photo under 10 MB and try again.'));
    } finally {
      busy.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  function editName(setter: (value: string) => void, value: string) {
    dirty.current = true; setter(value); setSaved(false); setError(null); setNameSaveFailed(false);
  }

  return <ScreenContainer appColors={appColors} scroll keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile" style={styles.iconButton}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')}>
        <ArrowLeft size={24} color={appColors.onSurface} />
      </Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: appColors.onSurface }]}>Account Details</Text>
    </View>
    <View style={[styles.card, { backgroundColor: appColors.surfaceLow }]}>
      <View style={styles.photoRow}>
        {profile?.photo_url ? <Image accessibilityLabel="Your profile picture" source={{ uri: profile.photo_url }} style={styles.photo} />
          : <View style={[styles.photo, styles.center, { backgroundColor: appColors.surfaceHighest }]}><UserRound size={32} color={appColors.onSurfaceVariant} /></View>}
        <View style={styles.flex}>
          <Text style={[styles.heading, { color: appColors.onSurface }]}>Profile picture</Text>
          <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>Choose a photo that feels like you.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Change profile picture" disabled={!canEdit || saving || uploading || emailBusy}
            onPress={() => void changePhoto()} style={styles.photoButton}>
            {uploading ? <ActivityIndicator color={colors.primary} /> : <Camera size={19} color={colors.primary} />}
            <Text style={styles.actionText}>{uploading ? 'Saving photo…' : 'Change photo'}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>Your photo saves when you choose it.</Text>
    </View>

    <View style={[styles.card, { backgroundColor: appColors.surfaceLow }]}>
      <Text style={[styles.heading, { color: appColors.onSurface }]}>Your name</Text>
      <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>Update the name shown on your profile.</Text>
      <Text style={[styles.label, { color: appColors.onSurface }]}>First name</Text>
      <TextInput accessibilityLabel="First name" value={firstName} onChangeText={value => editName(setFirstName, value)}
        editable={canEdit && !saving && !uploading && !emailBusy} maxLength={100} autoComplete="given-name" textContentType="givenName" autoCapitalize="words"
        style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.inputSurface, borderColor: appColors.inputBorder }]} />
      <Text style={[styles.label, { color: appColors.onSurface }]}>Last name</Text>
      <TextInput accessibilityLabel="Last name" value={lastName} onChangeText={value => editName(setLastName, value)}
        editable={canEdit && !saving && !uploading && !emailBusy} maxLength={100} autoComplete="family-name" textContentType="familyName" autoCapitalize="words"
        style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.inputSurface, borderColor: appColors.inputBorder }]} />
      <AppButton label="Save name" onPress={() => void saveName()} loading={saving}
        disabled={!canEdit || uploading || emailBusy || (!nameChanged && !nameSaveFailed) || !firstName.trim() || !lastName.trim()} />
      {saved && <Text accessibilityLiveRegion="polite" style={{ color: appColors.success }}>Your name was saved.</Text>}
    </View>
    {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: appColors.danger }]}>{error}</Text>}

    <EmailChangeCard disabled={saving || uploading} onBusyChange={setEmailBusy} />
    <Pressable accessibilityRole="button" accessibilityLabel="Change password" disabled={!canEdit || saving || uploading || emailBusy || !email}
      onPress={() => router.push({ pathname: '/reset-password', params: { email, from: 'account' } })}
      style={({ pressed }) => [styles.card, styles.row, { backgroundColor: appColors.surfaceLow }, pressed && styles.pressed]}>
      <LockKeyhole size={22} color={colors.primary} />
      <View style={styles.flex}>
        <Text style={[styles.heading, { color: appColors.onSurface }]}>Change password</Text>
        <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>Verify your email, then choose a new password.</Text>
      </View>
      <ChevronRight size={20} color={appColors.onSurfaceVariant} />
    </Pressable>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  iconButton: { minWidth: 44, minHeight: 44, padding: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '900', flex: 1 },
  card: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  photo: { width: 80, height: 80, borderRadius: radius.xl },
  center: { alignItems: 'center', justifyContent: 'center' },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  heading: { fontSize: fontSize.lg, fontWeight: '800' },
  copy: { fontSize: fontSize.sm, lineHeight: 19 },
  label: { fontSize: fontSize.sm, fontWeight: '700', marginTop: spacing.xs },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: fontSize.md },
  actionText: { color: colors.primary, fontWeight: '800' },
  error: { padding: spacing.sm, marginBottom: spacing.md },
  pressed: { opacity: 0.75 },
});
