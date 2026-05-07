import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MapPin, Star } from 'lucide-react-native';
import { AppColors, colors } from '../constants/colors';
import { fontSize, radius, shadow, spacing } from '../constants/design';
import type { Spot } from '../types';

const fallbackImage =
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=600';

interface SpotCardProps {
  spot: Spot;
  onPress: () => void;
  appColors: AppColors;
  compact?: boolean;
}

export function SpotCard({ spot, onPress, appColors, compact }: SpotCardProps) {
  const imageUrl = spot.images?.[0] ?? fallbackImage;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compactCard,
        { backgroundColor: appColors.white },
        pressed && styles.pressed,
      ]}
    >
      <Image source={{ uri: imageUrl }} style={styles.image} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: appColors.onSurface }]} numberOfLines={2}>
            {spot.name}
          </Text>
          {!!spot.rating && (
            <View style={styles.rating}>
              <Star size={12} color={colors.primary} fill={colors.primary} />
              <Text style={styles.ratingText}>{spot.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>

        <View style={styles.metaRow}>
          <MapPin size={13} color={appColors.onSurfaceVariant} />
          <Text style={[styles.address, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
            {spot.address}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.category, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
            {spot.category}
          </Text>
          <Text style={styles.fee}>{spot.is_reservable ? `PHP ${spot.reservation_fee}` : 'Walk-in'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.sm,
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    ...shadow.card,
  },
  compactCard: {
    width: 310,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  image: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
  },
  body: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  name: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    lineHeight: 19,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary + '12',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  ratingText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  address: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  category: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fee: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '900',
    fontStyle: 'italic',
  },
});
