import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import type { NativeScrollEvent, NativeSyntheticEvent, ViewToken } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Bookmark,
  Layers,
  Search,
  SlidersHorizontal,
  Star,
  Target,
  X,
} from 'lucide-react-native';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { TileMap } from '../src/components/TileMap';
import { AppColors, colors } from '../src/constants/colors';
import { bottomNavLayout, fontSize, radius, shadow, spacing } from '../src/constants/design';
import { sampleSpots } from '../src/constants/sampleData';
import { useLocation } from '../src/hooks/useLocation';
import { useTheme } from '../src/hooks/useTheme';
import { savedSpotService } from '../src/services/savedSpotService';
import { spotService } from '../src/services/spotService';
import type { Spot } from '../src/types';
import { calculateHaversineDistanceKm, type GeoCoordinate } from '../src/utils/distance';
import { getSpotCategoryColor } from '../src/utils/spotCategory';

type EnhancedSpot = Spot & {
  distanceValue: number;
};

const cebuRegion = {
  latitude: 10.3298,
  longitude: 123.9054,
};

const fallbackImage =
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=600';

const categories = ['All', 'Outdoor', 'Specialty Coffee', 'Social Dining', 'Street Food', 'Chill Vibe', 'High Pulse', 'Club'];
const ratingOptions = [0, 3, 3.5, 4, 4.5];
const distanceOptions = [1, 5, 10, 25, 50];

function enhanceSpots(spots: Spot[], origin: GeoCoordinate = cebuRegion): EnhancedSpot[] {
  return spots.map((spot, index) => ({
    ...spot,
    rating: spot.rating ?? 4.2 + (index % 5) * 0.13,
    distanceValue: calculateHaversineDistanceKm(origin, {
      latitude: spot.latitude,
      longitude: spot.longitude,
    }),
  }));
}

function compareSpotsForDiscovery(first: EnhancedSpot, second: EnhancedSpot) {
  const distanceDelta = first.distanceValue - second.distanceValue;
  if (Math.abs(distanceDelta) > 0.001) return distanceDelta;

  const ratingDelta = (second.rating ?? 0) - (first.rating ?? 0);
  if (Math.abs(ratingDelta) > 0.001) return ratingDelta;

  const reviewDelta = (second.review_count ?? 0) - (first.review_count ?? 0);
  if (reviewDelta !== 0) return reviewDelta;

  return new Date(second.created_at ?? 0).getTime() - new Date(first.created_at ?? 0).getTime();
}

function spotCenter(spot: EnhancedSpot) {
  return {
    latitude: spot.latitude,
    longitude: spot.longitude,
  };
}

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focusSpotId?: string | string[]; openSpot?: string | string[] }>();
  const { width } = useWindowDimensions();
  const [navigationHeight, setNavigationHeight] = useState(bottomNavLayout.minHeight);
  const { appColors } = useTheme();
  const { getCurrentLocation, location, loading: locating } = useLocation();
  const listRef = useRef<FlatList<EnhancedSpot> | null>(null);
  const programmaticCardTarget = useRef<string | null>(null);
  const lastFocusedSpotId = useRef<string | null>(null);
  const distanceOriginRef = useRef<GeoCoordinate>(cebuRegion);
  const requestedInitialLocationRef = useRef(false);
  const openedFocusSpotRef = useRef<string | null>(null);
  const [spots, setSpots] = useState<EnhancedSpot[]>(enhanceSpots(sampleSpots));
  const [search, setSearch] = useState('');
  const [zoomedOnce, setZoomedOnce] = useState(false);
  const [initialLocationChecked, setInitialLocationChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedSpot, setSelectedSpot] = useState<EnhancedSpot | null>(spots[0] ?? null);
  lastFocusedSpotId.current = selectedSpot?.id ?? null;
  const [mapCenter, setMapCenter] = useState(cebuRegion);
  const [mapZoom, setMapZoom] = useState(14);
  const [mapTransitionKey, setMapTransitionKey] = useState(0);
  const [favoriteSpotIds, setFavoriteSpotIds] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [filters, setFilters] = useState({
    category: 'All',
    minRating: 0,
    maxDistance: 10,
  });

  const cardWidth = Math.min(width - spacing.md * 2, 390);
  const snapInterval = cardWidth + spacing.md;
  const favoriteSpotIdSet = useMemo(() => new Set(favoriteSpotIds), [favoriteSpotIds]);
  const focusSpotId = Array.isArray(params.focusSpotId) ? params.focusSpotId[0] : params.focusSpotId;
  const shouldOpenFocusedSpot = (Array.isArray(params.openSpot) ? params.openSpot[0] : params.openSpot) === '1';
  const distanceOrigin = useMemo<GeoCoordinate>(
    () => location ? { latitude: location.latitude, longitude: location.longitude } : cebuRegion,
    [location?.latitude, location?.longitude]
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const fetchedSpots = await spotService.getSpots();
        const nextSpots = enhanceSpots(fetchedSpots.length ? fetchedSpots : sampleSpots, distanceOriginRef.current);
        if (!mounted) return;
        setSpots(nextSpots);
        setSelectedSpot(nextSpots[0] ?? null);
        setActiveIndex(0);
      } catch (error) {
        console.warn('Unable to load live spots; using fallback data:', error);
        const nextSpots = enhanceSpots(sampleSpots, distanceOriginRef.current);
        if (!mounted) return;
        setSpots(nextSpots);
        setSelectedSpot(nextSpots[0] ?? null);
        setActiveIndex(0);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    const unsubscribe = spotService.subscribeToSpots((nextRows) => {
      if (!mounted) return;
      const nextSpots = enhanceSpots(nextRows.length ? nextRows : sampleSpots, distanceOriginRef.current);
      setSpots(nextSpots);
      setSelectedSpot((current) => {
        if (!current) return nextSpots[0] ?? null;
        return nextSpots.find((spot) => spot.id === current.id) ?? nextSpots[0] ?? null;
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    distanceOriginRef.current = distanceOrigin;
    setSpots((current) => enhanceSpots(current, distanceOrigin));
  }, [distanceOrigin]);

  useEffect(() => {
    let mounted = true;

    async function loadFavorites() {
      try {
        const savedIds = await savedSpotService.getSavedSpotIds();
        if (mounted) setFavoriteSpotIds(savedIds);
      } catch (error) {
        console.error('Unable to load favorite spots:', error);
      } finally {
        if (mounted) setFavoritesLoaded(true);
      }
    }

    loadFavorites();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    savedSpotService.saveSavedSpotIds(favoriteSpotIds).catch((error) => {
      console.error('Unable to save favorite spots:', error);
    });
  }, [favoriteSpotIds, favoritesLoaded]);

  useEffect(() => {
    if (requestedInitialLocationRef.current) return;
    requestedInitialLocationRef.current = true;
    getCurrentLocation().finally(() => {
      setInitialLocationChecked(true);
    });
  }, [getCurrentLocation]);

  useEffect(() => {
    if (!location) return;
    setMapCenter({ latitude: location.latitude, longitude: location.longitude });
    setMapZoom(16);
    setMapTransitionKey((current) => current + 1);
    setZoomedOnce(true);
  }, [location]);

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
    }).sort(compareSpotsForDiscovery);
  }, [filters, search, spots]);

  useEffect(() => {
    const hasActiveSpot = Boolean(filteredSpots[activeIndex]);
    const nextIndex = hasActiveSpot ? activeIndex : 0;
    const nextSpot = filteredSpots[nextIndex] ?? null;

    if (!nextSpot) {
      setSelectedSpot(null);
      return;
    }

    if (selectedSpot?.id !== nextSpot.id) {
      setActiveIndex(nextIndex);
      setSelectedSpot(nextSpot);
      setMapCenter(spotCenter(nextSpot));
      setMapZoom(16);
      setMapTransitionKey((current) => current + 1);
    }
  }, [activeIndex, filteredSpots, selectedSpot?.id]);

  useEffect(() => {
    if (!selectedSpot || zoomedOnce || !initialLocationChecked || location) return;
    setMapCenter(spotCenter(selectedSpot));
    setMapZoom(16);
    setMapTransitionKey((current) => current + 1);
    setZoomedOnce(true);
  }, [initialLocationChecked, location, selectedSpot, zoomedOnce]);

  useEffect(() => {
    if (!focusSpotId || loading) return;
    if (openedFocusSpotRef.current === `${focusSpotId}:${shouldOpenFocusedSpot ? 'open' : 'focus'}`) return;

    const targetSpotId = focusSpotId;
    let cancelled = false;
    let openTimer: ReturnType<typeof setTimeout> | undefined;

    async function focusSpotFromNotification() {
      setSearch('');
      setFilters({ category: 'All', minRating: 0, maxDistance: 50 });

      const existingSpot = spots.find((spot) => spot.id === targetSpotId);
      const loadedSpot = existingSpot ?? await spotService.getSpotById(targetSpotId);
      if (cancelled || !loadedSpot) return;

      const enhancedSpot = 'distanceValue' in loadedSpot
        ? loadedSpot as EnhancedSpot
        : enhanceSpots([loadedSpot], distanceOriginRef.current)[0];
      if (!enhancedSpot) return;

      const nextIndex = Math.max(0, spots.findIndex((spot) => spot.id === enhancedSpot.id));
      setSpots((current) => (current.some((spot) => spot.id === enhancedSpot.id) ? current : [enhancedSpot, ...current]));
      setSelectedSpot(enhancedSpot);
      setActiveIndex(nextIndex);
      setMapCenter(spotCenter(enhancedSpot));
      setMapZoom(17);
      setMapTransitionKey((current) => current + 1);
      setZoomedOnce(true);
      openedFocusSpotRef.current = `${targetSpotId}:${shouldOpenFocusedSpot ? 'open' : 'focus'}`;
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });

      if (shouldOpenFocusedSpot) {
        openTimer = setTimeout(() => {
          router.push(`/spot/${enhancedSpot.id}`);
        }, 1200);
      }
    }

    void focusSpotFromNotification();
    return () => {
      cancelled = true;
      if (openTimer) clearTimeout(openTimer);
    };
  }, [focusSpotId, loading, router, shouldOpenFocusedSpot, spots]);

  const mapMarkers = useMemo(
    () => [
      ...filteredSpots.map((spot) => ({
        id: spot.id,
        latitude: spot.latitude,
        longitude: spot.longitude,
        color: getSpotCategoryColor(spot.category, spot.categories),
        selected: selectedSpot?.id === spot.id,
        label: spot.name,
        category: [spot.category, ...(spot.categories ?? [])].join(' '),
      })),
      ...(location
        ? [
            {
              id: 'current-location',
              latitude: location.latitude,
              longitude: location.longitude,
              color: '#2563EB',
              selected: true,
              category: 'current location',
              variant: 'circle' as const,
              size: 'small' as const,
              showIcon: false,
            },
          ]
        : []),
    ],
    [filteredSpots, location, selectedSpot?.id]
  );

  const centerOnUser = useCallback(async () => {
    await getCurrentLocation();
  }, [getCurrentLocation]);

  const setActiveSpot = useCallback((spot: EnhancedSpot, index: number, scroll = true, force = true) => {
    // Scroll/momentum events often report the same card. Do not restart its flight.
    if (!force && lastFocusedSpotId.current === spot.id) return;
    lastFocusedSpotId.current = spot.id;
    setSelectedSpot(spot);
    setActiveIndex(index);
    setMapCenter(spotCenter(spot));
    setMapZoom(16);
    setMapTransitionKey((current) => current + 1);
    if (scroll) {
      programmaticCardTarget.current = spot.id;
      // A native FlatList consumes the next tap while an animated programmatic
      // scroll is settling. Pin selection must leave the destination card
      // immediately tappable; its focus spring and the map camera still animate.
      listRef.current?.scrollToIndex({ index, animated: false });
    }
  }, []);

  const handleCardSnap = useCallback((offsetX: number) => {
    const index = Math.max(0, Math.min(filteredSpots.length - 1, Math.round(offsetX / snapInterval)));
    const spot = filteredSpots[index];
    if (!spot) return;
    // A pin tap may scroll past several cards. Keep the tapped destination selected.
    if (programmaticCardTarget.current) {
      if (spot.id === programmaticCardTarget.current && Math.abs(offsetX - index * snapInterval) < 2) {
        programmaticCardTarget.current = null;
      }
      return;
    }
    setActiveSpot(spot, index, false, false);
  }, [filteredSpots, setActiveSpot, snapInterval]);

  const handleCardMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleCardSnap(event.nativeEvent.contentOffset.x);
    },
    [handleCardSnap]
  );

  const handleCardDragStart = useCallback(() => {
    programmaticCardTarget.current = null;
  }, []);

  const carouselViewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 60,
  }).current;

  const handleViewableCardsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<EnhancedSpot>[] }) => {
      if (programmaticCardTarget.current) return;
      const visibleCard = viewableItems.find((item) => item.isViewable && item.item);
      if (!visibleCard || visibleCard.index == null) return;
      setActiveSpot(visibleCard.item, visibleCard.index, false, false);
    },
  ).current;

  const toggleFavorite = useCallback((spotId: string) => {
    setFavoriteSpotIds((current) =>
      current.includes(spotId) ? current.filter((id) => id !== spotId) : [...current, spotId]
    );
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ category: 'All', minRating: 0, maxDistance: 10 });
  }, []);

  const keyExtractor = useCallback((spot: EnhancedSpot) => spot.id, []);

  const getCardItemLayout = useCallback(
    (_: ArrayLike<EnhancedSpot> | null | undefined, index: number) => ({
      length: snapInterval,
      offset: snapInterval * index,
      index,
    }),
    [snapInterval]
  );

  const handleScrollToIndexFailed = useCallback(
    ({ index }: { index: number }) => {
      listRef.current?.scrollToOffset({ offset: index * snapInterval, animated: true });
    },
    [snapInterval]
  );

  const openSpot = useCallback((spotId: string) => router.push(`/spot/${spotId}`), [router]);

  const renderSpotCard = useCallback(
    ({ item }: { item: EnhancedSpot }) => (
      <PulseSpotCard
        spot={item}
        active={selectedSpot?.id === item.id}
        width={cardWidth}
        appColors={appColors}
        onOpen={openSpot}
        isFavorite={favoriteSpotIdSet.has(item.id)}
        onToggleFavorite={toggleFavorite}
      />
    ),
    [appColors, cardWidth, favoriteSpotIdSet, openSpot, selectedSpot?.id, toggleFavorite]
  );

  return (
    <ScreenContainer appColors={appColors} showBottomNav bottomNavOverlay onBottomNavHeightChange={setNavigationHeight} padded={false}>
      <View style={[styles.screen, { backgroundColor: appColors.surface }]}>
        <TileMap
          style={styles.map}
          center={mapCenter}
          zoom={mapZoom}
          transitionKey={mapTransitionKey}
          attributionPosition="topleft"
          attributionInset={76}
          onCenterChange={setMapCenter}
          onZoomChange={setMapZoom}
          markers={mapMarkers}
          onMarkerPress={(marker) => {
            const index = filteredSpots.findIndex((spot) => spot.id === marker.id);
            if (index >= 0) setActiveSpot(filteredSpots[index], index);
          }}
        />

        <View style={styles.searchWrap} pointerEvents="box-none">
          <View style={[styles.searchBar, { backgroundColor: appColors.surfaceHighest + 'F2' }]}>
            <Search size={17} color={appColors.onSurfaceVariant} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search spots..."
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

        <View style={[styles.explorePanel, {
          bottom: bottomNavLayout.bottom + navigationHeight + bottomNavLayout.raisedContent + bottomNavLayout.carouselGap,
        }]} pointerEvents="box-none">
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
              testID="spot-carousel"
              ref={listRef}
              data={filteredSpots}
              keyExtractor={keyExtractor}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={snapInterval}
              decelerationRate="fast"
              contentContainerStyle={[styles.cardRail, { paddingRight: Math.max(spacing.md, width - cardWidth - spacing.md * 2) }]}
              contentInsetAdjustmentBehavior="never"
              keyboardShouldPersistTaps="handled"
              directionalLockEnabled
              disableIntervalMomentum
              getItemLayout={getCardItemLayout}
              onScrollBeginDrag={handleCardDragStart}
              onMomentumScrollEnd={handleCardMomentumEnd}
              onViewableItemsChanged={handleViewableCardsChanged}
              viewabilityConfig={carouselViewabilityConfig}
              onScrollToIndexFailed={handleScrollToIndexFailed}
              renderItem={renderSpotCard}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={5}
              updateCellsBatchingPeriod={80}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          ) : (
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: appColors.surfaceLow,
                  borderColor: appColors.outlineVariant + '55',
                },
              ]}
            >
              <Text style={[styles.emptyTitle, { color: appColors.onSurface }]}>No matches found</Text>
              <Pressable onPress={resetFilters}>
                <Text style={styles.clearFilters}>Clear filters</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)}>
            <Pressable style={[styles.filterSheet, { backgroundColor: appColors.surface }]}>
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

interface PulseSpotCardProps {
  spot: EnhancedSpot;
  active: boolean;
  width: number;
  appColors: AppColors;
  onOpen: (spotId: string) => void;
  isFavorite: boolean;
  onToggleFavorite: (spotId: string) => void;
}

const PulseSpotCard = memo(function PulseSpotCard({
  spot,
  active,
  width,
  appColors,
  onOpen,
  isFavorite,
  onToggleFavorite,
}: PulseSpotCardProps) {
  const focusAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  const imageUrl = spot.images?.[0] ?? fallbackImage;
  const spotCategories = Array.from(new Set([spot.category, ...(spot.categories ?? [])].filter(Boolean))).slice(0, 2);

  useEffect(() => {
    Animated.spring(focusAnim, {
      toValue: active ? 1 : 0,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [active, focusAnim]);

  const animatedCardStyle = {
    opacity: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.72, 1],
    }),
  };

  return (
    <Animated.View style={[styles.cardShell, { width }, animatedCardStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${spot.name}`}
        onPress={() => onOpen(spot.id)}
        style={({ pressed }) => [
          styles.pulseCard,
          {
            backgroundColor: appColors.surfaceLow + 'F2',
            borderColor: active ? colors.primary + '55' : appColors.outlineVariant + '40',
          },
          pressed && styles.cardPressed,
        ]}
      >
        <View style={[styles.imageWrap, { backgroundColor: appColors.surfaceContainer }]}>
          <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        </View>

        <View style={styles.cardBody}>
          <View>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, { color: appColors.onSurface }]} numberOfLines={1}>
                {spot.name}
              </Text>
            </View>

            <Text style={[styles.cardMeta, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
              {spot.address} - {spot.distanceValue.toFixed(1)}km
            </Text>

            <View style={styles.tagRow}>
              {spotCategories.map((category) => (
                <Text key={category} style={[styles.tag, { backgroundColor: colors.primary + '14' }]} numberOfLines={1}>
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

          <View style={styles.goButton}>
            <Text style={styles.goButtonText}>Go to Spot</Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${isFavorite ? 'Remove' : 'Add'} ${spot.name} ${isFavorite ? 'from' : 'to'} favorites`}
        hitSlop={7}
        onPress={() => onToggleFavorite(spot.id)}
        style={({ pressed }) => [
          styles.favoriteButton,
          {
            backgroundColor: isFavorite ? colors.primary + '16' : appColors.surfaceContainer,
            borderColor: isFavorite ? colors.primary + '66' : appColors.outlineVariant + '44',
          },
          pressed && styles.favoriteButtonPressed,
        ]}
      >
        <Bookmark
          size={15}
          color={isFavorite ? colors.primary : appColors.onSurfaceVariant}
          fill={isFavorite ? colors.primary : 'transparent'}
        />
      </Pressable>
    </Animated.View>
  );
});

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
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
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
  },
  cardShell: {
    marginRight: spacing.md,
  },
  pulseCard: {
    height: 148,
    borderRadius: radius.xxl,
    padding: spacing.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardPressed: {
    opacity: 0.86,
  },
  imageWrap: {
    width: 112,
    height: 112,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
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
    minHeight: 30,
    paddingRight: 30 + spacing.xs,
  },
  favoriteButton: {
    position: 'absolute',
    top: spacing.md + 1,
    right: spacing.md + 1,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  favoriteButtonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.94 }],
  },
  cardTitle: {
    flex: 1,
    fontFamily: 'Montserrat_900Black',
    fontSize: fontSize.lg,
    fontWeight: '900',
    lineHeight: 19,
  },
  cardMeta: {
    fontFamily: 'Montserrat_700Bold',
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
    fontFamily: 'Montserrat_900Black',
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
    fontFamily: 'Montserrat_900Black',
    fontSize: 8,
    fontWeight: '900',
  },
  goButton: {
    minHeight: 32,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goButtonText: {
    color: colors.white,
    fontFamily: 'Montserrat_900Black',
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
