import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/colors';
import { fontSize, radius, shadow, spacing } from '../constants/design';
import { useTheme } from '../hooks/useTheme';

export type ConfirmationAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
};

type ConfirmationModalProps = {
  visible: boolean;
  title: string;
  message: string;
  actions: ConfirmationAction[];
  onRequestClose: () => void;
};

export function ConfirmationModal({
  visible,
  title,
  message,
  actions,
  onRequestClose,
}: ConfirmationModalProps) {
  const { appColors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close confirmation"
          style={styles.scrim}
          onPress={onRequestClose}
        />
        <View
          accessibilityRole="alert"
          style={[styles.dialog, { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant }]}
        >
          <Text style={[styles.title, { color: appColors.onSurface }]}>{title}</Text>
          <Text style={[styles.message, { color: appColors.onSurfaceVariant }]}>{message}</Text>
          <View style={styles.actions}>
            {actions.map((action) => {
              const variant = action.variant ?? 'secondary';
              const isPrimary = variant === 'primary';
              const isDestructive = variant === 'destructive';
              return (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  disabled={action.disabled}
                  onPress={action.onPress}
                  style={({ pressed }) => [
                    styles.action,
                    {
                      backgroundColor: isPrimary ? colors.primary : 'transparent',
                      borderColor: isDestructive ? appColors.danger : appColors.outlineVariant,
                    },
                    action.disabled && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionText,
                      { color: isPrimary ? colors.white : isDestructive ? appColors.danger : appColors.onSurface },
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
    ...shadow.card,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  message: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 21,
    fontWeight: '700',
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  action: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  actionText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
