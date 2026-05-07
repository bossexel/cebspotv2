import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MapView, { Marker, Region, UrlTile } from 'react-native-maps';
import {
  Bookmark,
  Coffee,
  Layers,
  Music2,
  Search,
  SlidersHorizontal,
  Star,
  Target,
  Trees,
  Utensils,
  Wine,
  X,
} from 'lucide-react-native';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing, tabBarHeight } from '../src/constants/design';
import { darkTileUrl, mapAttribution } from '../src/constants/mapTiles';
import { sampleSpots } from '../src/constants/sampleData';
import { useLocation } from '../src/hooks/useLocation';
import { useTheme } from '../src/hooks/useTheme';
import { spotService } from '../src/services/spotService';
import type { Spot } from '../src/types';

type EnhancedSpot = Spot & {
  distanceValue: number;
  pulseCount?: number;
  isLive?: boolean;
};

const cebuRegion: Region = {
  latitude: 10.3298,
  longitude: 123.9054,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

const fallbackImage =
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=600';

const categories = ['All', 'Outdoor', 'Specialty Coffee', 'Social Dining', 'Street Food', 'Chill Vibe', 'High Pulse'];
const ratingOptions = [0, 3, 3.5, 4, 4.5];
const distanceOptions = [1, 5, 10, 25, 50];

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function enhanceSpots(spots: Spot[]): EnhancedSpot[] {
  return spots.map((spot, index) => ({
    ...spot,
    rating: spot.rating ?? 4.2 + (index % 5) * 0.13,
    pulseCount: index === 0 ? 1250 : index === 1 ? 750 : index === 2 ? 350 : 150,
    isLive: index % 2 === 0,
    distanceValue: calculateDistance(10.3298, 123.9054, spot.latitude, spot.longitude),
  }));
}

function spotRegion(spot: EnhancedSpot): Region {
  return {
    latitude: spot.latitude,
    longitude: spot.longitude,
    latitudeDelta: 0.018,
    longitudeDelta: 0.018,
  };
}

function categoryColor(spot: EnhancedSpot) {
  const allCategories = [spot.category, ...(spot.categories ?? [])].join(' ').toLowerCase();
  if (allCategories.includes('coffee') || allCategories.includes('cafe')) return '#D4A373';
  if (allCategories.includes('pulse') || allCategories.includes('club')) return '#8B5CF6';
  if (allCategories.includes('bar') || allCategories.includes('night') || allCategories.includes('chill')) return '#3B82F6';
  if (allCategories.includes('outdoor') || allCategories.includes('park') || allCategories.includes('garden')) return '#22C55E';
  if (allCategories.includes('food') || allCategories.includes('dining') || allCategories.includes('hub')) return '#10B981';
  return '#10B981';
}

function CategoryMarker({ spot, selected }: { spot: EnhancedSpot; selected: boolean }) {
  const markerColor = categoryColor(spot);
  const allCategories = [spot.category, ...(spot.categories ?? [])].join(' ').toLowerCase();
  const Icon = allCategories.includes('coffee')
    ? Coffee
    : allCategories.includes('bar') || allCategories.includes('chill')
      ? Wine
      : allCategories.includes('club') || allCategories.includes('pulse')
        ? Music2
        : allCategories.includes('outdoor') || allCategories.includes('garden')
          ? Trees
          : Utensils;

  return (
    <View style={styles.markerWrap}>
      {selected && <View style={[styles.markerHalo, { borderColor: colors.white + '88' }]} />}
      <View
        style={[
          styles.marker,
          {
            width: selected ? 38 : 22,
            height: selected ? 38 : 22,
            borderRadius: selected ? 19 : 11,
            backgroundColor: markerColor,
          },
        ]}
      >
        <Icon size={selected ? 18 : 12} color={colors.white} strokeWidth={2.6} />
      </View>
      {selected && <View style={styles.markerShadow} />}
    </View>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { appColors } = useTheme();
  const { getCurrentLocation, location, loading: locating } = useLocation();
  const mapRef = useRef<MapView | null>(null);
  const listRef = useRef<FlatList<EnhancedSpot> | null>(null);
  const [spots, setSpots] = useState<EnhancedSpot[]>(enhanceSpots(sampleSpots));
  const [search, setSearch] = useState('');
  const [zoomedOnce, setZoomedOnce] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedSpot, setSelectedSpot] = useState<EnhancedSpot | null>(spots[0] ?? null);
  const [filters, setFilters] = useState({
    category: 'All',
    minRating: 0,
    maxDistance: 10,
  });

  const cardWidth = Math.min(width - spacing.md * 2, 390);
  const snapInterval = cardWidth + spacing.md;

  useEffect(() => {
    async function load() {
      try {
        const fetchedSpots = await spotService.getSpots();
        const nextSpots = enhanceSpots(fetchedSpots.length ? fetchedSpots : sampleSpots);
        setSpots(nextSpots);
        setSelectedSpot(nextSpots[0] ?? null);
        setActiveIndex(0);
      } catch (error) {
        console.error('Unable to load spots:', error);
        const nextSpots = enhanceSpots(sampleSpots);
        setSpots(nextSpots);
        setSelectedSpot(nextSpots[0] ?? null);
        setActiveIndex(0);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!location || !mapReady) return;
    mapRef.current?.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      },
      450,
    );
  }, [location, mapReady]);

  const filteredSpots = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();
    return spots.filter((spot) => {
      const spotCategories = Array.from(new Set([spot.category, ...(spot.categories ?? [])].filter(Boolean)));
      const matchesSearch =
        !lowerSearch ||
        spot.name.toLowerCase().includes(lowerSearch) ||
        spot.address.toLowerCase().includes(lowerSearch) ||
        spotCategories.some((category) => category.toLowerCase().includes(lowerSearch));
      const matchesCategory = filters.category === 'All' || spotCategories.includes(filters.category);
      const matchesRating = (spot.rating ?? 0) >= filters.minRating;
      const matchesDistance = spot.distanceValue <= filters.maxDistance;
      return matchesSearch && matchesCategory && matchesRating && matchesDistance;
    });
  }, [filters, search, spots]);

  useEffect(() => {
    const nextSpot = filteredSpots[activeIndex] ?? filteredSpots[0] ?? null;
    if (!nextSpot) {
      setSelectedSpot(null);
      return;
    }

    if (!filteredSpots.find((spot) => spot.id === selectedSpot?.id)) {
      setActiveIndex(0);
      setSelectedSpot(nextSpot);
      if (mapReady) mapRef.current?.animateToRegion(spotRegion(nextSpot), 600);
    }
  }, [activeIndex, filteredSpots, mapReady, selectedSpot?.id]);

  useEffect(() => {
    if (!selectedSpot || !mapReady || zoomedOnce) return;
    mapRef.current?.animateToRegion(spotRegion(selectedSpot), 700);
    setZoomedOnce(true);
  }, [mapReady, selectedSpot, zoomedOnce]);

  async function centerOnUser() {
    await getCurrentLocation();
  }

  function setActiveSpot(spot: EnhancedSpot, index: number, scroll = true) {
    setSelectedSpot(spot);
    setActiveIndex(index);
    mapRef.current?.animateToRegion(spotRegion(spot), 650);
    if (scroll) {
      listRef.current?.scrollToIndex({ index, animated: true });
    }
  }

  function handleCardSnap(offsetX: number) {
    const index = Math.round(offsetX / snapInterval);
    const spot = filteredSpots[index];
    if (!spot) return;
    setActiveSpot(spot, index, false);
  }

  function resetFilters() {
    setFilters({ category: 'All', minRating: 0, maxDistance: 10 });
  }

  return (
    <ScreenContainer appColors={appColors} showBottomNav padded={false}>
      <View style={[styles.screen, { backgroundColor: appColors.surface }]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          mapType={Platform.OS === 'android' ? 'none' : 'standard'}
          initialRegion={cebuRegion}
          showsUserLocation={Boolean(location)}
          showsMyLocationButton={false}
          onMapReady={() => setMapReady(true)}
        >
          <UrlTile urlTemplate={darkTileUrl} maximumZ={19} tileSize={256} />
          {filteredSpots.map((spot, index) => (
            <Marker
              key={spot.id}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => setActiveSpot(spot, index)}
            >
              <CategoryMarker spot={spot} selected={selectedSpot?.id === spot.id} />
            </Marker>
          ))}
          {location && (
            <Marker
              key="current-location"
              coordinate={{ latitude: location.latitude, longitude: location.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.userMarkerOuter}>
                <View style={styles.userMarkerInner} />
              </View>
            </Marker>
          )}
        </MapView>

        <Text style={styles.attribution}>{mapAttribution}</Text>

        {!mapReady && (
          <View style={[styles.mapLoading, { backgroundColor: appColors.surfaceContainer }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.mapLoadingText, { color: appColors.onSurfaceVariant }]}>Loading map</Text>
          </View>
        )}

        <View style={styles.searchWrap} pointerEvents="box-none">
          <View style={[styles.searchBar, { backgroundColor: appColors.surfaceHighest + 'F2' }]}>
            <Search size={17} color={appColors.onSurfaceVariant} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search vibes..."
              placeholderTextColor={appColors.onSurfaceVariant + '99'}
              style={[styles.searchInput, { color: appColors.onSurface }]}
            />
            <Pressable
              onPress={() => setFilterOpen(true)}
              style={[
                styles.filterButton,
                (filters.category !== 'All' || filters.minRating > 0 || filters.maxDistance !== 10) &&
                  styles.filterButtonActive,
              ]}
            >
              <SlidersHorizontal
                size={17}
                color={
                  filters.category !== 'All' || filters.minRating > 0 || filters.maxDistance !== 10
                    ? colors.white
                    : appColors.onSurfaceVariant
                }
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.mapActions}>
          <Pressable style={[styles.iconButton, { backgroundColor: appColors.surfaceContainer }]} onPress={centerOnUser}>
            {locating ? <ActivityIndicator color={colors.primary} /> : <Target size={18} color={colors.primary} />}
          </Pressable>
          <Pressable
            style={[styles.iconButton, { backgroundColor: appColors.surfaceContainer }]}
            onPress={() => setFilterOpen(true)}
          >
            <Layers size={18} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.explorePanel} pointerEvents="box-none">
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Nearby Spots</Text>
              <Text style={[styles.sectionSub, { color: appColors.onSurfaceVariant }]}>
                {filteredSpots.length} places matching your vibe
              </Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : filteredSpots.length ? (
            <FlatList
              ref={listRef}
              data={filteredSpots}
              keyExtractor={(spot) => spot.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={snapInterval}
              decelerationRate="fast"
              contentContainerStyle={styles.cardRail}
              getItemLayout={(_, index) => ({
                length: snapInterval,
                offset: snapInterval * index,
                index,
              })}
              onMomentumScrollEnd={(event) => handleCardSnap(event.nativeEvent.contentOffset.x)}
              onScrollToIndexFailed={({ index }) => {
                listRef.current?.scrollToOffset({ offset: index * snapInterval, animated: true });
              }}
              renderItem={({ item, index }) => (
                <PulseSpotCard
                  spot={item}
                  active={selectedSpot?.id === item.id}
                  width={cardWidth}
                  onFocus={() => setActiveSpot(item, index, false)}
                  onOpen={() => router.push(`/spot/${item.id}`)}
                />
              )}
            />
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: appColors.white }]}>
              <Text style={[styles.emptyTitle, { color: appColors.onSurface }]}>No matches found</Text>
              <Pressable onPress={resetFilters}>
                <Text style={styles.clearFilters}>Clear filters</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)}>
            <Pressable style={[styles.filterSheet, { backgroundColor: colors.white }]}>
              <View style={styles.filterHeader}>
                <Text style={[styles.filterTitle, { color: appColors.onSurface }]}>Filters</Text>
                <Pressable style={[styles.closeButton, { backgroundColor: appColors.surfaceContainer }]} onPress={() => setFilterOpen(false)}>
                  <X size={18} color={appColors.onSurfaceVariant} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.filterContent} showsVerticalScrollIndicator={false}>
                <View>
                  <Text style={[styles.filterLabel, { color: appColors.onSurfaceVariant }]}>Category</Text>
                  <View style={styles.filterGrid}>
                    {categories.map((category) => (
                      <Pressable
                        key={category}
                        onPress={() => setFilters((current) => ({ ...current, category }))}
                        style={[
                          styles.filterPill,
                          {
                            backgroundColor: filters.category === category ? colors.primary : appColors.surfaceLow,
                            borderColor: filters.category === category ? colors.primary : appColors.outlineVariant + '44',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterPillText,
                            { color: filters.category === category ? colors.white : appColors.onSurfaceVariant },
                          ]}
                        >
                          {category}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View>
                  <View style={styles.filterLabelRow}>
                    <Text style={[styles.filterLabel, { color: appColors.onSurfaceVariant }]}>Min Rating</Text>
                    <Text style={styles.filterValue}>
                      {filters.minRating === 0 ? 'Any' : `${filters.minRating}+ Stars`}
                    </Text>
                  </View>
                  <View style={styles.ratingRow}>
                    {ratingOptions.map((rating) => (
                      <Pressable
                        key={rating}
                        onPress={() => setFilters((current) => ({ ...current, minRating: rating }))}
                        style={[
                          styles.ratingOption,
                          {
                            backgroundColor: filters.minRating === rating ? colors.primary : appColors.surfaceLow,
                            borderColor: filters.minRating === rating ? colors.primary : appColors.outlineVariant + '44',
                          },
                        ]}
                      >
                        {rating === 0 ? (
                          <Text
                            style={[
                              styles.ratingText,
                              { color: filters.minRating === rating ? colors.white : appColors.onSurfaceVariant },
                            ]}
                          >
                            All
                          </Text>
                        ) : (
                          <>
                            <Text
                              style={[
                                styles.ratingText,
                                { color: filters.minRating === rating ? colors.white : appColors.onSurfaceVariant },
                              ]}
                            >
                              {rating}
                            </Text>
                            <Star
                              size={11}
                              color={filters.minRating === rating ? colors.white : '#EAB308'}
                              fill={filters.minRating === rating ? colors.white : '#EAB308'}
                            />
                          </>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View>
                  <View style={styles.filterLabelRow}>
                    <Text style={[styles.filterLabel, { color: appColors.onSurfaceVariant }]}>Max Distance</Text>
                    <Text style={styles.filterValue}>{filters.maxDistance} km</Text>
                  </View>
                  <View style={styles.distanceRow}>
                    {distanceOptions.map((distance) => (
                      <Pressable
                        key={distance}
                        onPress={() => setFilters((current) => ({ ...current, maxDistance: distance }))}
                        style={[
                          styles.distanceOption,
                          {
                            backgroundColor: filters.maxDistance === distance ? colors.primary : appColors.surfaceLow,
                            borderColor: filters.maxDistance === distance ? colors.primary : appColors.outlineVariant + '44',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.distanceText,
                            { color: filters.maxDistance === distance ? colors.white : appColors.onSurfaceVariant },
                          ]}
                        >
                          {distance}km
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.filterActions}>
                <Pressable style={[styles.resetButton, { backgroundColor: appColors.surfaceHigh }]} onPress={resetFilters}>
                  <Text style={[styles.resetText, { color: appColors.onSurfaceVariant }]}>Reset</Text>
                </Pressable>
                <Pressable style={styles.showButton} onPress={() => setFilterOpen(false)}>
                  <Text style={styles.showText}>Show {filteredSpots.length} Results</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </ScreenContainer>
  );
}

function PulseSpotCard({
  spot,
  active,
  width,
  onFocus,
  onOpen,
}: {
  spot: EnhancedSpot;
  active: boolean;
  width: number;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const imageUrl = spot.images?.[0] ?? fallbackImage;
  const spotCategories = Array.from(new Set([spot.category, ...(spot.categories ?? [])].filter(Boolean))).slice(0, 2);

  return (
    <Pressable
      onPress={onFocus}
      style={[
        styles.cardShell,
        {
          width,
          opacity: active ? 1 : 0.7,
          transform: [{ scale: active ? 1 : 0.94 }, { translateY: active ? 0 : 8 }],
        },
      ]}
    >
      <View style={[styles.pulseCard, active && styles.pulseCardActive]}>
        <View style={styles.imageWrap}>
          <Image source={{ uri: imageUrl }} style={styles.cardImage} />
          {spot.isLive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <View>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {spot.name}
              </Text>
              <Bookmark size={15} color={colors.onSurfaceVariant} />
            </View>

            <Text style={styles.cardMeta} numberOfLines={1}>
              {spot.address} - {spot.distanceValue.toFixed(1)}km
            </Text>

            <View style={styles.tagRow}>
              {spotCategories.map((category) => (
                <Text key={category} style={styles.tag} numberOfLines={1}>
                  {category}
                </Text>
              ))}
              {!!spot.rating && (
                <View style={styles.ratingTag}>
                  <Star size={10} color="#EAB308" fill="#EAB308" />
                  <Text style={styles.ratingTagText}>{spot.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>

          <Pressable style={styles.goButton} onPress={onOpen}>
            <Text style={styles.goButtonText}>Go to Spot</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mapLoadingText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  markerWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerHalo: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    opacity: 0.75,
  },
  marker: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white + '55',
    ...shadow.card,
  },
  markerShadow: {
    position: 'absolute',
    bottom: 7,
    width: 20,
    height: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  attribution: {
    position: 'absolute',
    left: spacing.md,
    bottom: tabBarHeight + 160,
    backgroundColor: 'rgba(255,255,255,0.84)',
    color: colors.onSurfaceVariant,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: 8,
    fontWeight: '800',
    overflow: 'hidden',
  },
  userMarkerOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563EB33',
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2563EB',
  },
  searchWrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
  },
  searchBar: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '24',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '800',
    paddingVertical: spacing.sm,
  },
  filterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  mapActions: {
    position: 'absolute',
    right: spacing.md,
    top: 84,
    gap: spacing.sm,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '24',
    ...shadow.card,
  },
  explorePanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: tabBarHeight - 54,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  sectionSub: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: 2,
  },
  loader: {
    marginBottom: spacing.xxl,
  },
  cardRail: {
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    paddingBottom: spacing.md,
  },
  cardShell: {
    marginRight: spacing.md,
  },
  pulseCard: {
    height: 148,
    borderRadius: radius.xxl,
    padding: spacing.md,
    backgroundColor: colors.surfaceLow + 'F2',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '2A',
    flexDirection: 'row',
    gap: spacing.md,
    ...shadow.lifted,
  },
  pulseCardActive: {
    borderColor: colors.primary + '44',
  },
  imageWrap: {
    width: 112,
    height: 112,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  liveBadge: {
    position: 'absolute',
    left: 6,
    top: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: colors.primary,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.white,
  },
  liveText: {
    color: colors.white,
    fontSize: 7,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardTitle: {
    flex: 1,
    color: colors.onSurface,
    fontSize: fontSize.lg,
    fontWeight: '900',
    fontStyle: 'italic',
    lineHeight: 19,
  },
  cardMeta: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
    marginTop: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    maxHeight: 24,
    marginTop: 6,
    overflow: 'hidden',
  },
  tag: {
    maxWidth: 84,
    color: colors.primary,
    backgroundColor: colors.primary + '14',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  ratingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#EAB3081A',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  ratingTagText: {
    color: '#CA8A04',
    fontSize: 8,
    fontWeight: '900',
  },
  goButton: {
    minHeight: 32,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  goButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyCard: {
    marginHorizontal: spacing.xl,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    ...shadow.card,
  },
  emptyTitle: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  clearFilters: {
    marginTop: spacing.md,
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    textDecorationLine: 'underline',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    maxHeight: '85%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    ...shadow.lifted,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  filterTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterContent: {
    gap: spacing.xxl,
  },
  filterLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  filterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterValue: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterPillText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ratingOption: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  ratingText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  distanceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  distanceOption: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  distanceText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  filterActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  resetButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  showButton: {
    flex: 2,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  showText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
