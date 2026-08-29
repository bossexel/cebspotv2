import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { colors } from '../constants/colors';
import { fontSize, radius, shadow, spacing } from '../constants/design';
import { useTheme } from '../hooks/useTheme';

type UpdateState = 'idle' | 'available' | 'updating' | 'failed';

const checkCooldownMs = 5 * 60 * 1000;

export function AppUpdatePrompt() {
  const { appColors } = useTheme();
  const [state, setState] = useState<UpdateState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastCheckRef = useRef(0);

  const checkForUpdate = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled || state === 'updating') return;

    const now = Date.now();
    if (now - lastCheckRef.current < checkCooldownMs) return;
    lastCheckRef.current = now;

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setErrorMessage(null);
        setState('available');
      }
    } catch (error) {
      console.warn('Unable to check for app updates:', error);
    }
  }, [state]);

  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void checkForUpdate();
      }
    });

    return () => subscription.remove();
  }, [checkForUpdate]);

  async function applyUpdate() {
    if (state === 'updating') return;

    try {
      setErrorMessage(null);
      setState('updating');
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew || fetched.isRollBackToEmbedded) {
        await Updates.reloadAsync();
        return;
      }
      setState('idle');
    } catch (error) {
      console.warn('Unable to apply app update:', error);
      setErrorMessage('Update failed. Please check your connection and try again.');
      setState('failed');
    }
  }

  const visible = state === 'available' || state === 'updating' || state === 'failed';
  const updating = state === 'updating';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.root}>
        <View style={styles.scrim} />
        <View style={[styles.dialog, { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant }]}>
          <View style={styles.badge}>
            {updating ? <ActivityIndicator color={colors.white} /> : <Text style={styles.badgeText}>UP</Text>}
          </View>
          <Text style={[styles.title, { color: appColors.onSurface }]}>New update is available</Text>
          <Text style={[styles.message, { color: appColors.onSurfaceVariant }]}>
            Press update to use CebSpot.
          </Text>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Update CebSpot"
            disabled={updating}
            onPress={() => void applyUpdate()}
            style={({ pressed }) => [styles.updateButton, updating && styles.disabled, pressed && styles.pressed]}
          >
            {updating ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.updateText}>Update</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black + '99',
  },
  dialog: {
    width: '100%',
    maxWidth: 430,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.lifted,
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginBottom: spacing.lg,
  },
  badgeText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    marginTop: spacing.sm,
    fontSize: fontSize.md,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  error: {
    marginTop: spacing.md,
    color: colors.danger,
    fontSize: fontSize.sm,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  updateButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginTop: spacing.xl,
  },
  updateText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  disabled: {
    opacity: 0.72,
  },
  pressed: {
    opacity: 0.78,
  },
});
