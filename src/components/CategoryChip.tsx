import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AppColors, colors } from '../constants/colors';
import { fontSize, radius, spacing } from '../constants/design';

interface CategoryChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  appColors?: AppColors;
}

export function CategoryChip({ label, selected, onPress, appColors = colors }: CategoryChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : appColors.surfaceContainer,
          borderColor: selected ? colors.primary : appColors.outlineVariant,
        },
      ]}
    >
      <Text style={[styles.label, { color: selected ? colors.white : appColors.onSurfaceVariant }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
