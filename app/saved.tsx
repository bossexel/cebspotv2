import { useFocusEffect, useRouter } from 'expo-router';
import { Bookmark, MapPin, Star, Trash2 } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useTheme } from '../src/hooks/useTheme';
import { savedSpotService } from '../src/services/savedSpotService';
import { spotService } from '../src/services/spotService';
import type { Spot } from '../src/types';

const fallbackImage =
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=600';

export default function SavedSpotsScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const [savedSpots, setSavedSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSavedSpots() {
    try {
      setLoading(true);
      const savedIds = await savedSpotService.getSavedSpotIds();
      const spots = await spotService.getSpots(150);
      const savedIdSet = new Set(savedIds);
      setSavedSpots(spots.filter((spot) => savedIdSet.has(spot.id)));
    } catch (error) {
      console.error('Unable to load saved spots:', error);
      setSavedSpots([]);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void loadSavedSpots();
    }, [])
  );

  async function removeSavedSpot(spotId: string) {
    const nextIds = await savedSpotService.removeSavedSpotId(spotId);
    setSavedSpots((current) => current.filter((spot) => nextIds.includes(spot.id)));
  }

  return (
    <ScreenContainer appColors={appColors} showBottomNav scroll>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Saved Spots</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
            Places you bookmarked from Explore
          </Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: appColors.surfaceLow }]}>
          <Bookmark size={22} color={colors.primary} fill={colors.primary} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
      ) : savedSpots.length ? (
        <View style={styles.list}>
          {savedSpots.map((spot) => (
            <Pressable
              key={spot.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${spot.name}`}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: appColors.surfaceLow, borderColor: appColors.outlineVariant + '55' },
                pressed && styles.pressed,
              ]}
              onPress={() => router.push(`/spot/${spot.id}`)}
            >
              <Image source={{ uri: spot.images?.[0] ?? fallbackImage }} style={styles.image} />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={[styles.spotName, { color: appColors.onSurface }]} numberOfLines={2}>
                    {spot.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${spot.name} from saved spots`}
                    hitSlop={8}
                    style={styles.removeButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      void removeSavedSpot(spot.id);
                    }}
                  >
                    <Trash2 size={17} color={colors.danger} />
                  </Pressable>
                </View>

                <View style={styles.metaRow}>
                  <MapPin size={13} color={appColors.onSurfaceVariant} />
                  <Text style={[styles.metaText, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
                    {spot.address}
                  </Text>
                </View>

                <View style={styles.footer}>
                  <Text style={styles.category} numberOfLines={1}>{spot.category}</Text>
                  {!!spot.rating && (
                    <View style={styles.ratingPill}>
                      <Star size={11} color="#EAB308" fill="#EAB308" />
                      <Text style={styles.ratingText}>{spot.rating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: appColors.surfaceLow }]}>
          <Bookmark size={28} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: appColors.onSurface }]}>No saved spots yet</Text>
          <Text style={[styles.emptyText, { color: appColors.onSurfaceVariant }]}>
            Tap the bookmark on a spot in Explore and it will appear here.
          </Text>
          <Pressable style={styles.exploreButton} onPress={() => router.push('/')}>
            <Text style={styles.exploreButtonText}>Explore Spots</Text>
          </Pressable>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    marginVertical: spacing.xxl,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.sm,
    flexDirection: 'row',
    gap: spacing.md,
    ...shadow.card,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  image: {
    width: 98,
    height: 98,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  spotName: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.lg,
    fontWeight: '900',
    lineHeight: 20,
  },
  removeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerContainer,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  category: {
    flex: 1,
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.primary + '12',
  },
  ratingText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  emptyCard: {
    borderRadius: radius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '700',
  },
  exploreButton: {
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
  },
  exploreButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
