import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { spacing, radius, fontSize } from '../constants/design';
import { spotService } from '../services/spotService';
import { venueTableStateLabels, type VenueTableAvailability } from '../services/venueTableService';
import type { TableBookingPolicy } from '../utils/tableInventory';
import type { Spot } from '../types';

export function OwnerTableBookingPolicy({ spotId, tableId, policy, liveTable, unavailable, onSaved, onSavingChange, onReady }: {
  spotId: string; tableId: string; policy: TableBookingPolicy;
  liveTable?: VenueTableAvailability; unavailable: boolean; onSaved: (spot: Spot) => void;
  onSavingChange: (saving: boolean) => void;
  onReady: () => Promise<void>;
}) {
  const { appColors } = useTheme();
  const [saving, setSaving] = useState(false);
  const savingRequest = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [confirmReady, setConfirmReady] = useState(false);
  const cannotChange = unavailable || !liveTable || liveTable.policyLocked;
  const allowsReservations = policy !== 'walk_in_only';
  const nextPolicy: TableBookingPolicy = allowsReservations ? 'walk_in_only' : 'online_and_walk_ins';
  async function save() {
    if (savingRequest.current || cannotChange) return;
    savingRequest.current = true;
    setSaving(true);
    onSavingChange(true);
    setMessage('');
    setError(false);
    try {
      const saved = await spotService.setTableBookingPolicy(spotId, tableId, nextPolicy);
      onSaved(saved);
      setMessage(nextPolicy === 'walk_in_only' ? 'Table locked for walk-ins.' : 'Table released for reservations.');
    } catch (cause: any) {
      setError(true);
      setMessage(cause.message || 'Table setting was not saved. Refresh live tables and try again.');
    } finally { savingRequest.current = false; setSaving(false); onSavingChange(false); }
  }
  async function markReady() {
    if (savingRequest.current || unavailable || liveTable?.state !== 'cleaning') return;
    savingRequest.current = true;
    setSaving(true);
    onSavingChange(true);
    setMessage('');
    setError(false);
    try {
      await onReady();
      setConfirmReady(false);
      setMessage(`${tableId} is ready. Its booking policy still applies.`);
    } catch (cause: any) {
      setError(true);
      setMessage(cause.message || 'Table readiness was not saved. Refresh live tables and try again.');
    } finally { savingRequest.current = false; setSaving(false); onSavingChange(false); }
  }
  return (
    <View style={[styles.panel, { backgroundColor: appColors.surfaceRaised }]}>
      <Pressable accessibilityRole="switch" accessibilityLabel={`Allow online reservations for ${tableId}`}
        aria-checked={allowsReservations} aria-disabled={cannotChange || saving} aria-busy={saving}
        accessibilityHint="Switch off to lock this table for walk-ins. Switch on to release it for online reservations."
        accessibilityState={{ checked: allowsReservations, disabled: cannotChange || saving, busy: saving }} disabled={cannotChange || saving}
        onPress={() => void save()}
        style={[styles.toggle, { opacity: cannotChange || saving ? 0.6 : 1 }]}>
        <View style={styles.toggleCopy}>
          <Text style={[styles.label, { color: appColors.onSurface }]}>Online reservations</Text>
          <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>
            {allowsReservations ? 'Released · Reservations allowed' : 'Locked · Walk-ins only'}
          </Text>
        </View>
        {saving ? <ActivityIndicator color={appColors.primary} accessibilityLabel="Saving table setting" /> :
          <View style={[styles.track, { backgroundColor: allowsReservations ? appColors.primary : appColors.outline }]}>
            <View style={[styles.thumb, { backgroundColor: appColors.white, alignSelf: allowsReservations ? 'flex-end' : 'flex-start' }]} />
          </View>}
      </Pressable>
      <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>
        Table state: {liveTable ? venueTableStateLabels[liveTable.state] : 'Awaiting live availability'}
      </Text>
      {cannotChange && !saving && <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>
        {unavailable || !liveTable ? 'Refresh live tables before changing this setting.'
          : 'Finish existing bookings and visits, then mark the table ready before changing this setting.'}
      </Text>}
      {liveTable?.state === 'cleaning' && <View style={{ gap: spacing.sm }}>
        {confirmReady ? <>
          <Text style={[styles.copy, { color: appColors.onSurface }]}>Has {tableId} been cleaned and made ready for guests?</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Confirm ${tableId} is ready`}
            disabled={unavailable || saving} accessibilityState={{ disabled: unavailable || saving, busy: saving }}
            onPress={() => void markReady()} style={[styles.readyButton, { backgroundColor: appColors.primary, opacity: unavailable || saving ? 0.6 : 1 }]}>
            <Text style={[styles.label, { color: appColors.white }]}>{saving ? 'Saving...' : 'Confirm ready'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Cancel marking ${tableId} ready`} disabled={saving}
            onPress={() => setConfirmReady(false)} style={styles.readyButton}>
            <Text style={[styles.label, { color: appColors.onSurface }]}>Cancel</Text>
          </Pressable>
        </> : <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${tableId} ready after cleaning`}
          disabled={unavailable || saving} accessibilityState={{ disabled: unavailable || saving }}
          onPress={() => setConfirmReady(true)} style={[styles.readyButton, { backgroundColor: appColors.primary, opacity: unavailable || saving ? 0.6 : 1 }]}>
          <Text style={[styles.label, { color: appColors.white }]}>Mark ready after cleaning</Text>
        </Pressable>}
      </View>}
      {!!message && <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"
        style={[styles.copy, { color: error ? appColors.danger : appColors.onSurface }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { width: '100%', padding: spacing.md, gap: spacing.sm, borderRadius: radius.md },
  label: { fontSize: fontSize.sm, fontWeight: '700', flexShrink: 1 },
  copy: { fontSize: fontSize.sm, lineHeight: 18 },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggleCopy: { flex: 1, gap: spacing.xs },
  readyButton: { minHeight: 48, padding: spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  track: { width: 48, height: 28, padding: 4, borderRadius: radius.pill, flexShrink: 0, justifyContent: 'center' },
  thumb: { width: 20, height: 20, borderRadius: radius.pill },
});
