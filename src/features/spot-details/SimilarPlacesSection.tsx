import React from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SpotCategoryIcon } from '../../components/SpotCategoryIcon';
import { colors } from '../../constants/colors';
import { fontSize, radius, shadow, spacing } from '../../constants/design';
import { useTheme } from '../../hooks/useTheme';
import type { rankSimilarSpots } from '../../utils/similarSpots';
import { getSpotCategoryColor } from '../../utils/spotCategory';

const fallbackImage = 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=900';

export function SimilarPlacesSection({ places, onOpenSpot }: {
  places: ReturnType<typeof rankSimilarSpots>;
  onOpenSpot: (spotId: string) => void;
}) {
  const { appColors } = useTheme();
  if (!places.length) return null;
  return <View style={styles.section} testID="similar-places-section">
    <Text style={[styles.title, { color: appColors.onSurface }]}>Similar Places</Text>
    <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>Other nearby or related places to explore.</Text>
    <FlatList data={places} horizontal showsHorizontalScrollIndicator={false}
      keyExtractor={({ spot }) => spot.id} contentContainerStyle={styles.list}
      renderItem={({ item: { spot, distanceKm } }) => {
        const categoryColor = getSpotCategoryColor(spot.category, spot.categories);
        return <Pressable accessibilityRole="button" accessibilityLabel={`Open similar place ${spot.name}`}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => onOpenSpot(spot.id)}>
          <View style={styles.imageWrap}>
            <Image source={{ uri: spot.images?.[0] ?? fallbackImage }} style={styles.image} />
            <View testID={`similar-place-category-badge-${spot.id}`} style={[styles.badge,
              { backgroundColor: categoryColor + '18', borderColor: categoryColor + '66' }]}>
              <SpotCategoryIcon category={spot.category} categories={spot.categories} color={categoryColor} size={18} />
            </View>
          </View>
          <Text style={[styles.name, { color: appColors.onSurface }]} numberOfLines={2}>{spot.name}</Text>
          <Text style={[styles.meta, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
            {spot.category} · {distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km
          </Text>
        </Pressable>;
      }} />
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '900' },
  subtitle: { fontSize: fontSize.sm, lineHeight: 20 },
  list: { gap: spacing.md, paddingRight: spacing.lg },
  card: { width: 174, gap: spacing.sm },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  imageWrap: { width: 174, height: 174, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surfaceContainer },
  image: { width: '100%', height: '100%' },
  badge: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, width: 38, height: 38,
    borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, ...shadow.card },
  name: { minHeight: 40, fontSize: fontSize.md, lineHeight: 20, fontWeight: '900' },
  meta: { fontSize: fontSize.xs, fontWeight: '700' },
});
