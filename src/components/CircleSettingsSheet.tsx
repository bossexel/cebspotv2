import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ChevronRight, CircleHelp, LogOut, MapPin, RefreshCw, ShieldCheck, X } from 'lucide-react-native';
import { colors } from '../constants/colors';
import { fontSize, radius, spacing } from '../constants/design';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { circleService, type CircleSharingState } from '../services/circleService';

type Props = {
  circleId: string;
  circleName?: string;
  visible: boolean;
  onClose: () => void;
  onSharingChanged: (state: CircleSharingState) => void;
  onEnabled: () => void;
  onLeft: () => void;
};

export function CircleSettingsSheet({ circleId, circleName, visible, onClose, onSharingChanged, onEnabled, onLeft }: Props) {
  const { user } = useAuth();
  const { appColors } = useTheme();
  const [sharing, setSharing] = useState<CircleSharingState | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState<'sharing' | 'leaving' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const busyRef = useRef(false);
  const callbacks = useRef({ onSharingChanged, onEnabled, onLeft });
  callbacks.current = { onSharingChanged, onEnabled, onLeft };

  const restoreSharing = useCallback(async () => {
    const version = ++requestVersion.current;
    setRestoring(true);
    setLoadError(null);
    try {
      if (!user?.id || !circleId) return;
      const state = await circleService.getLocationSharing(user.id);
      if (requestVersion.current !== version) return;
      setSharing(state);
      callbacks.current.onSharingChanged(state);
    } catch {
      if (requestVersion.current !== version) return;
      setSharing(null);
      setLoadError("We couldn't check your sharing setting. Check your connection and try again.");
      callbacks.current.onSharingChanged({ enabled: false, generation: null });
    } finally {
      if (requestVersion.current === version) setRestoring(false);
    }
  }, [circleId, user?.id]);

  useEffect(() => {
    setSharing(null);
    setBusy(null);
    setLeaveError(null);
    busyRef.current = false;
    callbacks.current.onSharingChanged({ enabled: false, generation: null });
    void restoreSharing();
    return () => {
      requestVersion.current += 1;
      callbacks.current.onSharingChanged({ enabled: false, generation: null });
    };
  }, [restoreSharing]);

  async function changeSharing(enabled: boolean) {
    if (busyRef.current || restoring || !sharing) return;
    const version = requestVersion.current;
    busyRef.current = true;
    setBusy('sharing');
    setLoadError(null);
    try {
      const state = await circleService.setLocationSharing(enabled);
      if (requestVersion.current !== version) return;
      setSharing(state);
      callbacks.current.onSharingChanged(state);
      if (state.enabled) callbacks.current.onEnabled();
    } catch {
      if (requestVersion.current !== version) return;
      // A lost response may follow a successful write. Recheck the setting
      // instead of claiming the old value is still confirmed.
      setSharing(null);
      setLoadError("We couldn't confirm that change. Check your sharing setting before trying again.");
      callbacks.current.onSharingChanged({ enabled: false, generation: null });
    } finally {
      if (requestVersion.current === version) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  function confirmLeave() {
    Alert.alert('Leave this circle?',
      'Location sharing will stop in all your circles. If you own this circle, another member takes over when possible. The current invite code will expire.', [
        { text: 'Stay in circle', style: 'cancel' },
        { text: 'Leave circle', style: 'destructive', onPress: async () => {
          if (busyRef.current || restoring) return;
          const version = requestVersion.current;
          busyRef.current = true;
          setBusy('leaving');
          setLeaveError(null);
          try {
            await circleService.leaveCircle(circleId);
            if (requestVersion.current !== version) return;
            callbacks.current.onSharingChanged({ enabled: false, generation: null });
            callbacks.current.onLeft();
          } catch {
            if (requestVersion.current === version) setLeaveError("We couldn't leave the circle. Please try again.");
          } finally {
            if (requestVersion.current === version) {
              busyRef.current = false;
              setBusy(null);
            }
          }
        } },
      ]);
  }

  const checking = restoring || busy === 'sharing';
  const statusLabel = checking ? (restoring ? 'Checking status…' : 'Saving your choice…')
    : !sharing ? 'Status unavailable' : sharing.enabled ? 'Sharing on' : 'Sharing off';
  const statusColor = sharing?.enabled ? colors.primary : appColors.onSurfaceVariant;

  // Keep the controller mounted while closing the sheet. Closing settings
  // must not discard the consent generation used for location publishing.
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable accessibilityViewIsModal onPress={event => event.stopPropagation()}
        style={[styles.sheet, { backgroundColor: appColors.surface }]}>
        <View style={[styles.handle, { backgroundColor: appColors.outlineVariant }]} />
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={[styles.heading, { color: appColors.onSurface }]}>Circle settings</Text>
            {!!circleName && <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>{circleName}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close Circle settings" onPress={onClose}
            style={[styles.closeButton, { backgroundColor: appColors.surfaceContainer }]}>
            <X size={21} color={appColors.onSurface} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {!!circleId ? <>
            <Text style={[styles.groupTitle, { color: appColors.onSurfaceVariant }]}>Privacy</Text>
            <View style={[styles.card, { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant }]}>
              <View style={styles.settingRow}>
                <View style={[styles.icon, { backgroundColor: colors.primary + '12' }]}><MapPin size={21} color={colors.primary} /></View>
                <View style={styles.settingCopy}>
                  <Text style={[styles.settingTitle, { color: appColors.onSurface }]}>Share my location</Text>
                  <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>Let people in your circles see where you are.</Text>
                </View>
                <Switch accessibilityLabel="Share location with my circles" accessibilityHint="Applies to all of your circles."
                  value={sharing?.enabled ?? false} disabled={Boolean(busy) || restoring || !sharing}
                  onValueChange={enabled => void changeSharing(enabled)}
                  trackColor={{ false: appColors.outlineVariant, true: colors.primary }} thumbColor={colors.white}
                  ios_backgroundColor={appColors.outlineVariant} />
              </View>
              <View style={[styles.statusRow, { borderTopColor: appColors.outlineVariant }]} accessibilityLiveRegion="polite">
                {checking ? <ActivityIndicator size="small" color={colors.primary} />
                  : !sharing ? <CircleHelp size={17} color={appColors.onSurfaceVariant} />
                    : <ShieldCheck size={17} color={statusColor} />}
                <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
              {!checking && sharing && <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
                {sharing.enabled ? 'Your location is visible to members of your circles.' : 'You can still see your own position on the map.'}
              </Text>}
              {!!loadError && <View style={[styles.notice, { backgroundColor: appColors.surfaceLow }]}>
                <Text accessibilityRole="alert" style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>{loadError}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Check location sharing status again" disabled={Boolean(busy) || restoring}
                  onPress={() => void restoreSharing()} style={styles.checkButton}>
                  <RefreshCw size={16} color={colors.primary} /><Text style={[styles.actionText, { color: colors.primary }]}>Check again</Text>
                </Pressable>
              </View>}
            </View>
            <Text style={[styles.groupTitle, { color: appColors.onSurfaceVariant }]}>Membership</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Leave this circle" disabled={Boolean(busy) || restoring}
              onPress={confirmLeave} style={({ pressed }) => [styles.card, styles.settingRow,
                { backgroundColor: appColors.surfaceRaised, borderColor: appColors.danger + '35' }, pressed && styles.pressed]}>
              <View style={[styles.icon, { backgroundColor: appColors.dangerContainer }]}><LogOut size={21} color={appColors.danger} /></View>
              <View style={styles.settingCopy}>
                <Text style={[styles.settingTitle, { color: appColors.danger }]}>{busy === 'leaving' ? 'Leaving circle…' : 'Leave this circle'}</Text>
                <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>You will no longer be part of this group.</Text>
              </View>
              {busy === 'leaving' ? <ActivityIndicator color={appColors.danger} /> : <ChevronRight size={19} color={appColors.danger} />}
            </Pressable>
            {!!leaveError && <Text accessibilityRole="alert" style={[styles.subtitle, { color: appColors.danger }]}>{leaveError}</Text>}
          </> : <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>Join or create a circle to manage your sharing settings.</Text>}
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: '#0008', padding: spacing.lg },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '85%', borderRadius: radius.xl, padding: spacing.lg },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  headerCopy: { flex: 1, gap: spacing.xs },
  heading: { fontSize: fontSize.xxl, fontWeight: '800' },
  closeButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  content: { gap: spacing.md, paddingBottom: spacing.sm },
  groupTitle: { fontSize: fontSize.md, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60 },
  icon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  settingCopy: { flex: 1, gap: spacing.xs },
  settingTitle: { fontSize: fontSize.lg, fontWeight: '700' },
  subtitle: { fontSize: fontSize.md, lineHeight: 21 },
  statusRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { fontSize: fontSize.md, fontWeight: '600' },
  notice: { padding: spacing.md, borderRadius: radius.md, gap: spacing.sm },
  checkButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm },
  actionText: { fontSize: fontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
