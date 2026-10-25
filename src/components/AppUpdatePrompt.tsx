import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { colors } from '../constants/colors';
import { fontSize, radius, shadow, spacing } from '../constants/design';
import { useTheme } from '../hooks/useTheme';

type UpdateState = 'idle' | 'available' | 'updating' | 'failed';

const checkCooldownMs = 5 * 60 * 1000;
const cebspotLogo = require('../../assets/cebspot-logo.png');
const androidUpgradeUrl = 'https://expo.dev/artifacts/eas/4aKd8iEFWeuOc2YLGJDTmrpLmnoQajvRWgX96sP3bus.apk';

export function AppUpdatePrompt() {
  // An OTA cannot add the video encoder to the already-installed 1.0.3 binary.
  const requiresInstallation = Updates.runtimeVersion === '1.0.3';
  const { appColors } = useTheme();
  const [state, setState] = useState<UpdateState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastCheckRef = useRef(0);

  const checkForUpdate = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled || state === 'updating') return;

    const now = Date.now();
    if (now - lastCheckRef.current < checkCooldownMs) return;
    lastCheckRef.current = now;

    if (requiresInstallation) {
      setErrorMessage(null);
      setState('available');
      return;
    }

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setErrorMessage(null);
        setState('available');
      }
    } catch (error) {
      console.warn('Unable to check for app updates:', error);
    }
  }, [requiresInstallation, state]);

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
      if (requiresInstallation) {
        await Linking.openURL(androidUpgradeUrl);
        setState('idle');
        return;
      }
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew || fetched.isRollBackToEmbedded) {
        await Updates.reloadAsync();
        return;
      }
      setState('idle');
    } catch (error) {
      console.warn('Unable to apply app update:', error);
      setErrorMessage(requiresInstallation
        ? 'We could not open the download. Please check your connection and try again.'
        : 'Update failed. Please check your connection and try again.');
      setState('failed');
    }
  }

  const visible = state === 'available' || state === 'updating' || state === 'failed';
  const updating = state === 'updating';
  const dismissPrompt = () => {
    if (!updating) {
      setErrorMessage(null);
      setState('idle');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissPrompt}>
      <View style={styles.root}>
        <View style={styles.scrim} />
        <View
          style={[
            styles.dialog,
            { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant },
          ]}
        >
          <Image
            accessibilityLabel="CebSpot logo"
            resizeMode="contain"
            source={cebspotLogo}
            style={styles.logo}
          />
          <Text style={[styles.title, { color: appColors.onSurface }]}>
            {updating ? (requiresInstallation ? 'Opening your update' : 'Updating CebSpot') : 'New update is available'}
          </Text>
          <Text style={[styles.message, { color: appColors.onSurfaceVariant }]}>
            {requiresInstallation
              ? 'Get faster photo uploads and video compression. Tap Download update, then open the downloaded file and choose Install. Keep your current app installed.'
              : updating
                ? 'Downloading your update. CebSpot will restart when it is ready.'
                : 'Tap Update to get the latest improvements. CebSpot will restart to apply them.'}
          </Text>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={requiresInstallation ? 'Download CebSpot update' : 'Update CebSpot'}
            disabled={updating}
            onPress={() => void applyUpdate()}
            style={({ pressed }) => [styles.updateButton, updating && styles.disabled, pressed && styles.pressed]}
          >
            {updating ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.updateText}>{requiresInstallation ? 'Download update' : 'Update'}</Text>
            )}
          </Pressable>
          {!updating && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Later"
              onPress={dismissPrompt}
              style={({ pressed }) => [styles.laterButton, pressed && styles.pressed]}
            >
              <Text style={[styles.laterText, { color: appColors.onSurfaceVariant }]}>Later</Text>
            </Pressable>
          )}
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
  logo: {
    width: 68,
    height: 80,
    marginBottom: spacing.md,
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
  laterButton: {
    minHeight: 44,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  laterText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.72,
  },
  pressed: {
    opacity: 0.78,
  },
});
