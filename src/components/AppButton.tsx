import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';
import { fontSize, radius, shadow, spacing } from '../constants/design';
import { useTheme } from '../hooks/useTheme';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: ViewStyle;
  icon?: React.ReactNode;
}

export function AppButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
  icon,
}: AppButtonProps) {
  const { appColors } = useTheme();
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.primary,
        isSecondary && [styles.secondary, { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant }],
        variant === 'ghost' && [styles.ghost, { backgroundColor: appColors.primary + '12' }],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={isPrimary ? colors.white : colors.primary} /> : icon}
      <Text style={[styles.label, !isPrimary && styles.nonPrimaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  secondary: {
    borderWidth: 1,
  },
  ghost: {
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  nonPrimaryLabel: {
    color: colors.primary,
  },
});
