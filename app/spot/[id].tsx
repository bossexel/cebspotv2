import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  Clock,
  Edit3,
  ExternalLink,
  Globe2,
  Heart,
  Info,
  MapPin,
  MoreHorizontal,
  Navigation,
  Phone,
  Send,
  Share2,
  ShieldCheck,
  Star,
  Users,
  Video,
  X,
} from 'lucide-react-native';
import { AppButton } from '../../src/components/AppButton';
import { CategoryChip } from '../../src/components/CategoryChip';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { TileMap } from '../../src/components/TileMap';
import { colors } from '../../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../../src/constants/design';
import { sampleSpots } from '../../src/constants/sampleData';
import { useAuth } from '../../src/hooks/useAuth';
import { useLocation } from '../../src/hooks/useLocation';
import { useTheme } from '../../src/hooks/useTheme';
import { gamificationService } from '../../src/services/gamificationService';
import { reviewService } from '../../src/services/reviewService';
import { spotEditSuggestionService } from '../../src/services/spotEditSuggestionService';
import { spotService } from '../../src/services/spotService';
import type { Review, Spot } from '../../src/types';
import { calculateReservationFee, getReservationTypeLabel, getSpotReservationType, isPaymentRequired } from '../../src/utils/reservations';

const fallbackImage =
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=900';
const testCebspotSpotId = '66666666-6666-4666-8666-666666666666';

const reportReasons = [
  'Inaccurate or misleading review',
  'Frauds and scams',
  'Spam',
  'Hate speech',
  'Harassment or bullying',
  'Pornography and nudity',
  'Illegal activities and regulated goods',
  'Others',
  'Child or minor safety',
];

const editSuggestionFields = [
  'Location / map pin',
  'Address',
  'Opening hours',
  'Website',
  'Contact number',
  'Description',
  'Category',
  'Other',
];

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

function midpoint(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  return {
    latitude: (first.latitude + second.latitude) / 2,
    longitude: (first.longitude + second.longitude) / 2,
  };
}

function formatUrlForDisplay(url: string) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function normalizeWebsiteUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function openPhoneNumber(phoneNumber: string) {
  const normalizedNumber = phoneNumber.replace(/[^\d+]/g, '');
  Linking.openURL(`tel:${normalizedNumber}`).catch((error) => {
    console.error('Unable to open phone number:', error);
  });
}

async function fetchRoute(origin: MapCoordinate, destination: MapCoordinate) {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origin.longitude},${origin.latitude};` +
      `${destination.longitude},${destination.latitude}` +
      `?overview=full&geometries=geojson`;

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Route line request failed with status ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      console.warn('No route line found');
      return [];
    }

    return data.routes[0].geometry.coordinates.map(([longitude, latitude]: [number, number]) => ({
      latitude,
      longitude,
    }));
  } catch (error) {
    console.error('Failed to fetch route line:', error);
    return [];
  }
}

export default function SpotDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const { getCurrentLocation, location } = useLocation();
  const heroGalleryRef = useRef<FlatList<string> | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewMedia, setReviewMedia] = useState<{ uri: string; type: string }[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reportingReview, setReportingReview] = useState<Review | null>(null);
  const [selectedReportReason, setSelectedReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [editSuggestionOpen, setEditSuggestionOpen] = useState(false);
  const [editSuggestionField, setEditSuggestionField] = useState(editSuggestionFields[0]);
  const [editSuggestionValue, setEditSuggestionValue] = useState('');
  const [editSuggestionCoordinate, setEditSuggestionCoordinate] = useState<MapCoordinate | null>(null);
  const [editSuggestionNote, setEditSuggestionNote] = useState('');
  const [editSuggestionSubmitted, setEditSuggestionSubmitted] = useState(false);
  const [submittingEditSuggestion, setSubmittingEditSuggestion] = useState(false);
  const [websitePreviewUrl, setWebsitePreviewUrl] = useState<string | null>(null);
  const [websitePreviewLoading, setWebsitePreviewLoading] = useState(false);
  const [websitePreviewError, setWebsitePreviewError] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<MapCoordinate[]>([]);

  useEffect(() => {
    let active = true;
    const shouldSubscribeToLiveSettings = Boolean(id);
    const unsubscribe = shouldSubscribeToLiveSettings
      ? spotService.subscribeToSpotById(id, (nextSpot) => {
          if (active && nextSpot) setSpot(nextSpot);
        })
      : undefined;

    async function loadSpot() {
      if (!id) return;
      try {
        const nextSpot = await spotService.getSpotById(id);
        if (active) setSpot(nextSpot);
      } catch (error) {
        console.error('Unable to load spot:', error);
        if (active) setSpot(sampleSpots.find((sample) => sample.id === id) ?? null);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSpot();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [id]);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  useEffect(() => {
    async function loadReviews() {
      if (!id) return;
      try {
        setReviews(await reviewService.getReviewsForSpot(id));
      } catch (error) {
        console.error('Unable to load reviews:', error);
        setReviews([]);
      } finally {
        setReviewsLoading(false);
      }
    }

    loadReviews();
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    async function loadTransitRoute() {
      if (!location || !spot) {
        setRouteCoordinates([]);
        return;
      }

      const coords = await fetchRoute(
        {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        {
          latitude: spot.latitude,
          longitude: spot.longitude,
        },
      );

      if (!cancelled) {
        setRouteCoordinates(coords);
      }
    }

    loadTransitRoute();

    return () => {
      cancelled = true;
    };
  }, [location?.latitude, location?.longitude, spot?.id, spot?.latitude, spot?.longitude]);

  if (loading) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  if (!spot) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Spot not found</Text>
          <AppButton label="Back to Explore" onPress={() => router.replace('/')} />
        </View>
      </ScreenContainer>
    );
  }

  const imageUrls = spot.images?.length ? spot.images : [fallbackImage];
  const spotCategories = Array.from(new Set(spot.categories?.length ? spot.categories : [spot.category]));
  const reservationType = getSpotReservationType(spot);
  const reservationFee = calculateReservationFee(spot);
  const paymentRequired = isPaymentRequired(spot);
  const spotCoordinate = { latitude: spot.latitude, longitude: spot.longitude };
  const userCoordinate = location ? { latitude: location.latitude, longitude: location.longitude } : null;
  const transitCenter = userCoordinate ? midpoint(userCoordinate, spotCoordinate) : spotCoordinate;
  const transitMarkers = [
    ...(userCoordinate
      ? [
          {
            id: 'current-location',
            ...userCoordinate,
            color: '#2563EB',
            selected: true,
            category: 'current location',
            label: 'You',
            variant: 'circle' as const,
            size: 'small' as const,
            showIcon: false,
          },
        ]
      : []),
    {
      id: spot.id,
      ...spotCoordinate,
      color: colors.primary,
      selected: true,
      category: [spot.category, ...(spot.categories ?? [])].join(' '),
      label: spot.category,
    },
  ];
  const spotDetails = [
    {
      id: 'hours',
      label: 'Opening Hours',
      value: spot.opening_hours ?? 'Hours not posted',
      Icon: Clock,
    },
    {
      id: 'address',
      label: 'Address',
      value: spot.address,
      Icon: MapPin,
    },
    {
      id: 'website',
      label: 'Website',
      value: spot.website_url ? formatUrlForDisplay(spot.website_url) : 'Website not posted',
      Icon: Globe2,
      onPress: spot.website_url ? () => openWebsitePreview(spot.website_url as string) : undefined,
    },
    {
      id: 'contact',
      label: 'Contact Number',
      value: spot.contact_number ?? 'Contact not posted',
      Icon: Phone,
      onPress: spot.contact_number ? () => openPhoneNumber(spot.contact_number as string) : undefined,
    },
  ];

  async function attachReviewMedia() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setReviewMedia((current) => [
        ...current,
        ...result.assets.map((asset) => ({
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'image',
        })),
      ]);
    }
  }

  async function submitReview() {
    if (!profile) {
      Alert.alert('Sign in required', 'Please sign in before leaving a review.');
      return;
    }
    if (!spot || !reviewText.trim()) {
      Alert.alert('Review needed', 'Write a short review before posting.');
      return;
    }

    try {
      setSubmittingReview(true);
      const created = await reviewService.createReview({
        spot_id: spot.id,
        user_id: profile.id,
        user_name: profile.display_name || profile.email || 'CebSpot user',
        user_photo_url: profile.photo_url,
        rating: reviewRating,
        comment: reviewText.trim(),
        media_urls: reviewMedia.map((media) => media.uri),
        media_types: reviewMedia.map((media) => media.type),
      });
      setReviews((current) => [created, ...current]);
      setReviewText('');
      setReviewRating(5);
      setReviewMedia([]);
    } catch (error: any) {
      console.error('Create review error:', error);
      Alert.alert('Review saved locally', 'Supabase reviews table may need the updated schema. Showing it in this session.');
      setReviews((current) => [
        {
          id: `local-review-${Date.now()}`,
          spot_id: spot.id,
          user_id: profile.id,
          user_name: profile.display_name || profile.email || 'CebSpot user',
          user_photo_url: profile.photo_url,
          rating: reviewRating,
          comment: reviewText.trim(),
          media_urls: reviewMedia.map((media) => media.uri),
          media_types: reviewMedia.map((media) => media.type),
          likes_count: 0,
          reports_count: 0,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setReviewText('');
      setReviewRating(5);
      setReviewMedia([]);
    } finally {
      setSubmittingReview(false);
    }
  }

  async function likeReview(reviewId: string) {
    if (!profile) {
      Alert.alert('Sign in required', 'Please sign in before marking a review helpful.');
      return;
    }

    try {
      const result = await gamificationService.markReviewHelpful(reviewId);
      if (result.awarded) {
        setReviews((current) =>
          current.map((review) =>
            review.id === reviewId ? { ...review, likes_count: (review.likes_count ?? 0) + 1 } : review
          )
        );
      }
    } catch (error: any) {
      Alert.alert('Unable to mark helpful', error.message ?? 'Please try again.');
    }
  }

  async function verifyVisit() {
    if (!profile) {
      Alert.alert('Sign in required', 'Please sign in before verifying your visit.');
      return;
    }
    if (!spot || checkingIn) return;

    try {
      setCheckingIn(true);
      const currentLocation = await getCurrentLocation();
      if (!currentLocation) {
        Alert.alert('Location unavailable', 'Turn on location access and try again near the spot.');
        return;
      }

      const visit = await gamificationService.recordSpotVisit({
        spotId: spot.id,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        accuracy: currentLocation.accuracy,
      });

      if (visit?.verified) {
        Alert.alert('Visit verified', 'You earned visit XP for checking in at this spot.');
      } else {
        Alert.alert('Visit recorded', 'You are too far from the spot for verified visit XP right now.');
      }
    } catch (error: any) {
      Alert.alert('Check-in failed', error.message ?? 'Please try again.');
    } finally {
      setCheckingIn(false);
    }
  }

  function limitReportDetails(text: string) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 200) {
      setReportDetails(text);
      return;
    }
    setReportDetails(words.slice(0, 200).join(' '));
  }

  function closeReportForm() {
    setReportingReview(null);
    setSelectedReportReason('');
    setReportDetails('');
    setReportSubmitted(false);
    setSubmittingReport(false);
  }

  function openReportForm(review: Review) {
    setReportingReview(review);
    setSelectedReportReason('');
    setReportDetails('');
    setReportSubmitted(false);
  }

  function openWebsitePreview(url: string) {
    setWebsitePreviewUrl(normalizeWebsiteUrl(url));
    setWebsitePreviewLoading(true);
    setWebsitePreviewError(false);
  }

  function getCurrentSpotValue(field: string) {
    if (!spot) return null;
    switch (field) {
      case 'Location / map pin':
        return `${spot.latitude}, ${spot.longitude}`;
      case 'Address':
        return spot.address;
      case 'Opening hours':
        return spot.opening_hours ?? null;
      case 'Website':
        return spot.website_url ?? null;
      case 'Contact number':
        return spot.contact_number ?? null;
      case 'Description':
        return spot.description ?? null;
      case 'Category':
        return [spot.category, ...(spot.categories ?? [])].filter(Boolean).join(', ');
      default:
        return null;
    }
  }

  function openEditSuggestionForm(field = 'Location / map pin') {
    setEditSuggestionField(field);
    setEditSuggestionValue('');
    setEditSuggestionCoordinate(spot ? { latitude: spot.latitude, longitude: spot.longitude } : null);
    setEditSuggestionNote('');
    setEditSuggestionSubmitted(false);
    setEditSuggestionOpen(true);
  }

  function selectEditSuggestionField(field: string) {
    setEditSuggestionField(field);
    setEditSuggestionValue('');
    setEditSuggestionCoordinate(spot ? { latitude: spot.latitude, longitude: spot.longitude } : null);
  }

  function closeEditSuggestionForm() {
    setEditSuggestionOpen(false);
    setEditSuggestionField(editSuggestionFields[0]);
    setEditSuggestionValue('');
    setEditSuggestionCoordinate(null);
    setEditSuggestionNote('');
    setEditSuggestionSubmitted(false);
    setSubmittingEditSuggestion(false);
  }

  function showGalleryImage(index: number) {
    setActiveImageIndex(index);
    heroGalleryRef.current?.scrollToIndex({ index, animated: true });
  }

  function closeWebsitePreview() {
    setWebsitePreviewUrl(null);
    setWebsitePreviewLoading(false);
    setWebsitePreviewError(false);
  }

  async function reportReview(reason: string, details = '') {
    if (!reportingReview) return;
    if (!profile) {
      Alert.alert('Sign in required', 'Please sign in before reporting a review.');
      closeReportForm();
      return;
    }

    try {
      setSubmittingReport(true);
      await reviewService.reportReview(
        reportingReview.id,
        profile.id,
        details.trim() ? `${reason}: ${details.trim()}` : reason
      );
      setReportSubmitted(true);
    } catch (error: any) {
      console.error('Report review error:', error);
      Alert.alert('Report failed', error?.message ?? 'Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  }

  async function submitEditSuggestion() {
    if (!spot) return;
    if (!profile) {
      Alert.alert('Sign in required', 'Please sign in before suggesting an edit.');
      return;
    }
    const isLocationSuggestion = editSuggestionField === 'Location / map pin';
    if (isLocationSuggestion && !editSuggestionCoordinate) {
      Alert.alert('Pin needed', 'Choose the corrected map pin before submitting.');
      return;
    }
    if (!isLocationSuggestion && !editSuggestionValue.trim()) {
      Alert.alert('Correction needed', 'Enter the corrected detail before submitting.');
      return;
    }

    try {
      setSubmittingEditSuggestion(true);
      const currentValue = isLocationSuggestion
        ? JSON.stringify({ latitude: spot.latitude, longitude: spot.longitude })
        : getCurrentSpotValue(editSuggestionField);
      const suggestedValue = isLocationSuggestion && editSuggestionCoordinate
        ? JSON.stringify({
            latitude: Number(editSuggestionCoordinate.latitude.toFixed(7)),
            longitude: Number(editSuggestionCoordinate.longitude.toFixed(7)),
          })
        : editSuggestionValue;

      await spotEditSuggestionService.createSuggestion({
        spot_id: spot.id,
        user_id: profile.id,
        field: editSuggestionField,
        current_value: currentValue,
        suggested_value: suggestedValue,
        note: editSuggestionNote,
      });
      setEditSuggestionSubmitted(true);
    } catch (error: any) {
      Alert.alert('Suggestion failed', error?.message ?? 'Please try again.');
    } finally {
      setSubmittingEditSuggestion(false);
    }
  }

  const editSuggestionIsLocation = editSuggestionField === 'Location / map pin';
  const editSuggestionMapCenter = editSuggestionCoordinate ?? (spot ? { latitude: spot.latitude, longitude: spot.longitude } : null);
  const editSuggestionMarkers = spot && editSuggestionCoordinate
    ? [
        {
          id: 'original-location',
          latitude: spot.latitude,
          longitude: spot.longitude,
          label: 'Current pin',
          category: spot.category,
          color: appColors.onSurfaceVariant,
          variant: 'circle' as const,
          size: 'small' as const,
        },
        {
          id: 'suggested-location',
          latitude: editSuggestionCoordinate.latitude,
          longitude: editSuggestionCoordinate.longitude,
          label: 'Suggested pin',
          category: spot.category,
          color: colors.primary,
          selected: true,
          variant: 'pin' as const,
        },
      ]
    : [];

  return (
    <ScreenContainer appColors={appColors} scroll padded={false}>
      <View style={styles.hero}>
        <FlatList
          ref={heroGalleryRef}
          data={imageUrls}
          keyExtractor={(item, index) => `${item}-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => heroGalleryRef.current?.scrollToIndex({ index, animated: true }), 100);
          }}
          onMomentumScrollEnd={(event) => setActiveImageIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => <Image source={{ uri: item }} style={[styles.heroImage, { width }]} />}
        />
        <View style={styles.heroShade} />
        {imageUrls.length > 1 && (
          <View style={styles.galleryDots}>
            {imageUrls.map((image, index) => (
              <View key={`${image}-${index}`} style={[styles.galleryDot, activeImageIndex === index && styles.galleryDotActive]} />
            ))}
          </View>
        )}
        <View style={styles.heroActions}>
          <Pressable style={styles.glassButton} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.white} />
          </Pressable>
          <Pressable style={styles.glassButton}>
            <Share2 size={20} color={colors.white} />
          </Pressable>
        </View>
        <View style={styles.heroText}>
          <Text style={styles.badge}>Premium Spot</Text>
          {spot.is_reservable && (
            <Text style={styles.reservationBadge}>
              {paymentRequired ? `Reservation Fee: ₱${reservationFee}` : 'Free Reservation'}
            </Text>
          )}
          <Text style={styles.heroTitle}>{spot.name}</Text>
          <View style={styles.heroMeta}>
            <MapPin size={14} color={colors.white} />
            <Text style={styles.heroMetaText} numberOfLines={1}>
              {spot.address}
            </Text>
            {!!spot.rating && (
              <>
                <Star size={14} color={colors.primaryContainer} fill={colors.primaryContainer} />
                <Text style={styles.heroMetaText}>{spot.rating.toFixed(1)}</Text>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.sheet, { backgroundColor: appColors.surface }]}>
        {spot.is_reservable && (
          <View style={[styles.bookingCard, { backgroundColor: appColors.white }]}>
            <View style={styles.bookingIcon}>
              <ShieldCheck size={28} color={colors.primary} />
            </View>
            <View style={styles.bookingCopy}>
              <Text style={[styles.cardTitle, { color: appColors.onSurface }]}>Reservation Access</Text>
              <Text style={[styles.cardSub, { color: appColors.onSurfaceVariant }]}>
                {paymentRequired
                  ? `₱${reservationFee} fixed reservation fee required to secure this booking.`
                  : 'Free reservation. No payment is required for this booking.'}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.chips}>
          {spotCategories.map((category) => (
            <CategoryChip key={category} label={category} appColors={appColors} />
          ))}
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: appColors.surfaceLow }]}>
            <Star size={18} color={colors.primary} />
            <Text style={[styles.statLabel, { color: appColors.onSurfaceVariant }]}>Rating</Text>
            <Text style={[styles.statValue, { color: appColors.onSurface }]}>
              {spot.rating ? `${spot.rating.toFixed(1)} / 5.0` : 'No rating yet'}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: appColors.surfaceLow }]}>
            <Users size={18} color={colors.primary} />
            <Text style={[styles.statLabel, { color: appColors.onSurfaceVariant }]}>Volume</Text>
            <Text style={[styles.statValue, { color: appColors.onSurface }]}>Medium</Text>
          </View>
        </View>

        <View style={[styles.visitCard, { backgroundColor: appColors.surfaceLow }]}>
          <View style={styles.visitCopy}>
            <Text style={[styles.cardTitle, { color: appColors.onSurface }]}>Verify your visit</Text>
            <Text style={[styles.cardSub, { color: appColors.onSurfaceVariant }]}>
              Check in near this spot to earn verified visit XP.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Verify visit at this spot"
            disabled={checkingIn}
            style={[styles.visitButton, checkingIn && styles.disabledButton]}
            onPress={verifyVisit}
          >
            {checkingIn ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <CheckCircle size={18} color={colors.white} />
            )}
            <Text style={styles.visitButtonText}>Check in</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.inlineTitle}>
            <Info size={14} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: appColors.onSurfaceVariant }]}>Overview</Text>
          </View>
          <Text style={[styles.description, { color: appColors.onSurfaceVariant }]}>
            {spot.description ?? 'A community-discovered Cebu spot with real local pulse.'}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: appColors.onSurfaceVariant }]}>Gallery</Text>
            <Text style={styles.reviewCount}>{imageUrls.length} photos</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotGalleryList}>
            {imageUrls.map((imageUrl, index) => (
              <Pressable
                key={`${imageUrl}-gallery-${index}`}
                style={[
                  styles.spotGalleryTile,
                  {
                    borderColor: activeImageIndex === index ? colors.primary : appColors.outlineVariant + '55',
                    backgroundColor: appColors.surfaceLow,
                  },
                ]}
                onPress={() => showGalleryImage(index)}
              >
                <Image source={{ uri: imageUrl }} style={styles.spotGalleryImage} />
                {activeImageIndex === index && (
                  <View style={styles.spotGalleryActiveBadge}>
                    <Text style={styles.spotGalleryActiveText}>Main</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: appColors.onSurfaceVariant }]}>Community Reviews</Text>
            <Text style={styles.reviewCount}>{reviews.length} posts</Text>
          </View>

          <View style={[styles.reviewComposer, { backgroundColor: appColors.surfaceLow }]}>
            <View style={styles.ratingPicker}>
              {[1, 2, 3, 4, 5].map((rating) => (
                <Pressable key={rating} onPress={() => setReviewRating(rating)}>
                  <Star
                    size={22}
                    color={rating <= reviewRating ? colors.primary : appColors.outline}
                    fill={rating <= reviewRating ? colors.primary : 'transparent'}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Share your experience at this spot..."
              placeholderTextColor={appColors.onSurfaceVariant}
              multiline
              style={[styles.reviewInput, { color: appColors.onSurface, backgroundColor: appColors.white }]}
            />
            {!!reviewMedia.length && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewMediaPreview}>
                {reviewMedia.map((media, index) => (
                  <View key={`${media.uri}-${index}`} style={styles.mediaThumb}>
                    {media.type === 'video' ? (
                      <View style={styles.videoThumb}>
                        <Video size={20} color={colors.white} />
                      </View>
                    ) : (
                      <Image source={{ uri: media.uri }} style={styles.mediaImage} />
                    )}
                    <Pressable
                      style={styles.removeMedia}
                      onPress={() => setReviewMedia((current) => current.filter((_, mediaIndex) => mediaIndex !== index))}
                    >
                      <X size={12} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.reviewActions}>
              <Pressable style={styles.attachButton} onPress={attachReviewMedia}>
                <Camera size={16} color={colors.primary} />
                <Text style={styles.attachText}>Photo/Video</Text>
              </Pressable>
              <Pressable style={styles.postButton} onPress={submitReview} disabled={submittingReview}>
                {submittingReview ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Send size={15} color={colors.white} />
                    <Text style={styles.postText}>Post</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {reviewsLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : reviews.length ? (
            reviews.map((review) => (
              <View key={review.id} style={[styles.reviewCard, { backgroundColor: appColors.surfaceLow }]}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewerAvatar}>
                    {review.user_photo_url ? (
                      <Image source={{ uri: review.user_photo_url }} style={styles.reviewerImage} />
                    ) : (
                      <Text style={styles.reviewerInitial}>{(review.user_name || 'U').charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={styles.reviewerCopy}>
                    <Text style={[styles.reviewerName, { color: appColors.onSurface }]}>
                      {review.user_name || 'CebSpot user'}
                    </Text>
                    <View style={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <Star
                          key={rating}
                          size={11}
                          color={rating <= Math.round(review.rating) ? colors.primary : appColors.outline}
                          fill={rating <= Math.round(review.rating) ? colors.primary : 'transparent'}
                        />
                      ))}
                    </View>
                  </View>
                </View>

                {!!review.comment && (
                  <Text style={[styles.reviewComment, { color: appColors.onSurfaceVariant }]}>{review.comment}</Text>
                )}

                {!!review.media_urls?.length && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewMediaPreview}>
                    {review.media_urls.map((mediaUrl, index) => (
                      <View key={`${review.id}-${mediaUrl}-${index}`} style={styles.reviewMediaTile}>
                        {review.media_types?.[index] === 'video' ? (
                          <View style={styles.videoThumb}>
                            <Video size={22} color={colors.white} />
                            <Text style={styles.videoText}>Video</Text>
                          </View>
                        ) : (
                          <Image source={{ uri: mediaUrl }} style={styles.mediaImage} />
                        )}
                      </View>
                    ))}
                  </ScrollView>
                )}

                <View style={styles.reviewFooter}>
                  <Pressable style={styles.likeButton} onPress={() => likeReview(review.id)}>
                    <Heart size={15} color={colors.primary} />
                    <Text style={styles.likeText}>{review.likes_count ?? 0}</Text>
                  </Pressable>
                  <Pressable style={styles.moreButton} onPress={() => openReportForm(review)}>
                    <MoreHorizontal size={18} color={appColors.onSurfaceVariant} />
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <View style={[styles.emptyReviews, { backgroundColor: appColors.surfaceLow }]}>
              <Text style={[styles.emptyReviewTitle, { color: appColors.onSurface }]}>No reviews yet</Text>
              <Text style={[styles.emptyReviewText, { color: appColors.onSurfaceVariant }]}>
                Be the first to post a review for this spot.
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.detailsPanel, { backgroundColor: appColors.surfaceLow }]}>
          <View style={styles.inlineTitle}>
            <Info size={14} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: appColors.onSurfaceVariant }]}>Spot Details</Text>
          </View>
          <View style={styles.detailList}>
            {spotDetails.map(({ id: detailId, label, value, Icon, onPress }) => {
              const RowContainer = onPress ? Pressable : View;
              return (
                <RowContainer
                  key={detailId}
                  style={[styles.detailRow, { backgroundColor: appColors.white }]}
                  onPress={onPress}
                >
                  <View style={styles.detailIcon}>
                    <Icon size={17} color={colors.primary} />
                  </View>
                  <View style={styles.detailCopy}>
                    <Text style={[styles.detailLabel, { color: appColors.onSurfaceVariant }]}>{label}</Text>
                    <Text style={[styles.detailValue, { color: appColors.onSurface }]} numberOfLines={2}>
                      {value}
                    </Text>
                  </View>
                  {onPress && <ExternalLink size={15} color={appColors.onSurfaceVariant} />}
                </RowContainer>
              );
            })}
          </View>
          <Pressable style={[styles.suggestEditButton, { backgroundColor: appColors.white }]} onPress={() => openEditSuggestionForm()}>
            <View style={styles.suggestEditIcon}>
              <Edit3 size={17} color={colors.primary} />
            </View>
            <View style={styles.detailCopy}>
              <Text style={[styles.detailLabel, { color: appColors.onSurfaceVariant }]}>Found incorrect details?</Text>
              <Text style={[styles.detailValue, { color: appColors.onSurface }]}>Suggest an edit</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: appColors.onSurfaceVariant }]}>Route Line</Text>
            <View style={styles.routeBadge}>
              <Navigation size={13} color={colors.primary} />
              <Text style={styles.routeBadgeText}>Route Line</Text>
            </View>
          </View>
          <View style={styles.mapCard}>
            <TileMap
              style={styles.map}
              center={transitCenter}
              zoom={15}
              markers={transitMarkers}
              routeLine={routeCoordinates}
            />
          </View>
          <Text style={[styles.ownerPrompt, { color: appColors.onSurfaceVariant }]}>
            Own this spot?{' '}
            <Text style={styles.ownerPromptLink} onPress={() => router.push('/owner-access')}>
              Contact us.
            </Text>
          </Text>
        </View>
      </View>

      {spot.is_reservable && (
        <View style={[styles.floatingFooter, { backgroundColor: appColors.surfaceLow }]}>
          <View>
            <Text style={[styles.accessLabel, { color: appColors.onSurfaceVariant }]}>Access</Text>
            <Text style={styles.accessPrice}>
              {paymentRequired ? `₱${reservationFee}` : getReservationTypeLabel(reservationType)}
            </Text>
          </View>
          <AppButton
            label="Secure Spot"
            onPress={() => router.push(`/reservation/${spot.id}`)}
            icon={<ShieldCheck size={18} color={colors.white} />}
            style={styles.footerButton}
          />
        </View>
      )}

      <Modal visible={Boolean(reportingReview)} transparent animationType="fade" onRequestClose={closeReportForm}>
        <Pressable style={styles.reportBackdrop} onPress={closeReportForm}>
          <Pressable style={[styles.reportSheet, { backgroundColor: appColors.surface }]}>
            {reportSubmitted ? (
              <View style={styles.reportSuccess}>
                <View style={styles.reportSuccessIcon}>
                  <CheckCircle size={76} color={colors.white} />
                </View>
                <Text style={[styles.reportSuccessTitle, { color: appColors.onSurface }]}>Thanks for reporting</Text>
                <Text style={[styles.reportSuccessText, { color: appColors.onSurfaceVariant }]}>
                  We'll review your report and take action if there is a violation of CebSpot Spot Listing Guidelines.
                </Text>
                <Pressable style={styles.reportDoneButton} onPress={closeReportForm}>
                  <Text style={styles.reportDoneText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.reportHeader}>
                  <Text style={[styles.reportTitle, { color: appColors.onSurface }]}>Report Review</Text>
                  <Pressable style={[styles.reportClose, { backgroundColor: appColors.surfaceLow }]} onPress={closeReportForm}>
                    <X size={18} color={appColors.onSurface} />
                  </Pressable>
                </View>
                <Text style={[styles.reportSubtitle, { color: appColors.onSurfaceVariant }]}>Select a reason</Text>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reportReasonList}>
                  {reportReasons.map((reason) => (
                    <Pressable
                      key={reason}
                      style={[
                        styles.reportReasonButton,
                        submittingReport && styles.disabledButton,
                        {
                          backgroundColor: selectedReportReason === reason ? colors.primary + '14' : appColors.surfaceLow,
                          borderColor: selectedReportReason === reason ? colors.primary : appColors.outlineVariant + '55',
                        },
                      ]}
                      onPress={() => {
                        setSelectedReportReason(reason);
                        if (reason !== 'Others') {
                          reportReview(reason);
                        }
                      }}
                      disabled={submittingReport}
                    >
                      {submittingReport && selectedReportReason === reason ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <Text
                          style={[
                            styles.reportReasonText,
                            { color: selectedReportReason === reason ? colors.primary : appColors.onSurface },
                          ]}
                        >
                          {reason}
                        </Text>
                      )}
                    </Pressable>
                  ))}

                  {selectedReportReason === 'Others' && (
                    <View style={styles.otherReportBox}>
                      <TextInput
                        value={reportDetails}
                        onChangeText={limitReportDetails}
                        placeholder="Share more details about the issue..."
                        placeholderTextColor={appColors.onSurfaceVariant}
                        multiline
                        style={[
                          styles.reportDetailsInput,
                          { color: appColors.onSurface, backgroundColor: appColors.white },
                        ]}
                      />
                      <Text style={[styles.wordCount, { color: appColors.onSurfaceVariant }]}>
                        {reportDetails.trim().split(/\s+/).filter(Boolean).length}/200 words
                      </Text>
                      <Pressable
                        style={[styles.submitReportButton, submittingReport && styles.disabledButton]}
                        onPress={() => reportReview('Others', reportDetails)}
                        disabled={submittingReport}
                      >
                        {submittingReport ? (
                          <ActivityIndicator color={colors.white} />
                        ) : (
                          <Text style={styles.submitReportText}>Submit Report</Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={editSuggestionOpen} transparent animationType="fade" onRequestClose={closeEditSuggestionForm}>
        <Pressable style={styles.reportBackdrop} onPress={closeEditSuggestionForm}>
          <Pressable style={[styles.reportSheet, { backgroundColor: appColors.surface }]} onPress={(event) => event.stopPropagation()}>
            {editSuggestionSubmitted ? (
              <View style={styles.reportSuccess}>
                <View style={styles.reportSuccessIcon}>
                  <CheckCircle size={76} color={colors.white} />
                </View>
                <Text style={[styles.reportSuccessTitle, { color: appColors.onSurface }]}>Edit suggested</Text>
                <Text style={[styles.reportSuccessText, { color: appColors.onSurfaceVariant }]}>
                  Thanks for helping keep CebSpot accurate. An admin will review your suggested change.
                </Text>
                <Pressable style={styles.reportDoneButton} onPress={closeEditSuggestionForm}>
                  <Text style={styles.reportDoneText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.reportHeader}>
                  <Text style={[styles.reportTitle, { color: appColors.onSurface }]}>Suggest an Edit</Text>
                  <Pressable style={[styles.reportClose, { backgroundColor: appColors.surfaceLow }]} onPress={closeEditSuggestionForm}>
                    <X size={18} color={appColors.onSurface} />
                  </Pressable>
                </View>

                <Text style={[styles.reportSubtitle, { color: appColors.onSurfaceVariant }]}>What should be corrected?</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editFieldList}>
                  {editSuggestionFields.map((field) => (
                    <Pressable
                      key={field}
                      style={[
                        styles.editFieldChip,
                        {
                          backgroundColor: editSuggestionField === field ? colors.primary : appColors.surfaceLow,
                          borderColor: editSuggestionField === field ? colors.primary : appColors.outlineVariant + '55',
                        },
                      ]}
                      onPress={() => selectEditSuggestionField(field)}
                    >
                      <Text
                        style={[
                          styles.editFieldText,
                          { color: editSuggestionField === field ? colors.white : appColors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {field}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {editSuggestionIsLocation && editSuggestionMapCenter ? (
                  <View style={styles.editLocationPicker}>
                    <View style={[styles.editLocationMap, { borderColor: appColors.outlineVariant + '55' }]}>
                      <TileMap
                        style={styles.map}
                        center={editSuggestionMapCenter}
                        zoom={16}
                        markers={editSuggestionMarkers}
                        onCenterChange={setEditSuggestionCoordinate}
                        onPressCoordinate={setEditSuggestionCoordinate}
                      />
                    </View>
                    <View style={[styles.editLocationHint, { backgroundColor: appColors.surfaceLow }]}>
                      <MapPin size={16} color={colors.primary} />
                      <Text style={[styles.editLocationHintText, { color: appColors.onSurface }]}>
                        Place the pin where this spot should appear on the map.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <TextInput
                    value={editSuggestionValue}
                    onChangeText={setEditSuggestionValue}
                    placeholder="Enter the corrected detail..."
                    placeholderTextColor={appColors.onSurfaceVariant}
                    multiline
                    style={[
                      styles.reportDetailsInput,
                      { color: appColors.onSurface, backgroundColor: appColors.white },
                    ]}
                  />
                )}

                <TextInput
                  value={editSuggestionNote}
                  onChangeText={setEditSuggestionNote}
                  placeholder="Optional note for admins..."
                  placeholderTextColor={appColors.onSurfaceVariant}
                  multiline
                  style={[
                    styles.editNoteInput,
                    { color: appColors.onSurface, backgroundColor: appColors.white },
                  ]}
                />
                <Pressable
                  style={[styles.submitReportButton, submittingEditSuggestion && styles.disabledButton]}
                  onPress={submitEditSuggestion}
                  disabled={submittingEditSuggestion}
                >
                  {submittingEditSuggestion ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.submitReportText}>Submit Suggestion</Text>
                  )}
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(websitePreviewUrl)} transparent animationType="slide" onRequestClose={closeWebsitePreview}>
        <View style={styles.websiteBackdrop}>
          <View style={[styles.websitePreview, { backgroundColor: appColors.surface }]}>
            <View style={styles.websiteHeader}>
              <View style={styles.websiteHeaderCopy}>
                <Text style={[styles.websiteTitle, { color: appColors.onSurface }]}>Website Preview</Text>
                <Text style={[styles.websiteUrl, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
                  {websitePreviewUrl ? formatUrlForDisplay(websitePreviewUrl) : ''}
                </Text>
              </View>
              <Pressable style={[styles.reportClose, { backgroundColor: appColors.surfaceLow }]} onPress={closeWebsitePreview}>
                <X size={18} color={appColors.onSurface} />
              </Pressable>
            </View>

            <View style={[styles.websiteFrame, { borderColor: appColors.outlineVariant + '55' }]}>
              {websitePreviewUrl && (
                <WebView
                  source={{ uri: websitePreviewUrl }}
                  startInLoadingState
                  onLoadStart={() => {
                    setWebsitePreviewLoading(true);
                    setWebsitePreviewError(false);
                  }}
                  onLoadEnd={() => setWebsitePreviewLoading(false)}
                  onError={(event) => {
                    console.error('Website preview failed:', event.nativeEvent);
                    setWebsitePreviewError(true);
                    setWebsitePreviewLoading(false);
                  }}
                  style={styles.websiteWebView}
                />
              )}
              {websitePreviewLoading && (
                <View style={[styles.websiteLoading, { backgroundColor: appColors.surface }]}>
                  <ActivityIndicator color={colors.primary} size="large" />
                </View>
              )}
              {websitePreviewError && (
                <View style={[styles.websiteLoading, { backgroundColor: appColors.surface }]}>
                  <Text style={[styles.websiteErrorTitle, { color: appColors.onSurface }]}>Website unavailable</Text>
                  <Text style={[styles.websiteErrorText, { color: appColors.onSurfaceVariant }]}>
                    This site could not be loaded inside CebSpot.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  hero: {
    height: 360,
    backgroundColor: colors.secondary,
  },
  heroImage: {
    height: 360,
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  heroActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glassButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroText: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xxl + spacing.lg,
  },
  galleryDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  galleryDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  galleryDotActive: {
    width: 20,
    backgroundColor: colors.white,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    color: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    overflow: 'hidden',
  },
  reservationBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    backgroundColor: colors.white,
    color: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    overflow: 'hidden',
  },
  heroTitle: {
    color: colors.white,
    fontSize: 34,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    lineHeight: 36,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
    paddingRight: spacing.lg,
  },
  heroMetaText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '800',
    maxWidth: 280,
    lineHeight: 18,
  },
  sheet: {
    marginTop: -spacing.xl,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 118,
  },
  bookingCard: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary + '22',
    ...shadow.card,
  },
  bookingIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  bookingCopy: {
    flex: 1,
  },
  cardTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardSub: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  visitCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '18',
  },
  visitCopy: {
    flex: 1,
    minWidth: 0,
  },
  visitButton: {
    minHeight: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    ...shadow.card,
  },
  visitButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  description: {
    fontSize: fontSize.lg,
    lineHeight: 25,
    fontWeight: '600',
  },
  spotGalleryList: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  spotGalleryTile: {
    width: 148,
    height: 108,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 2,
  },
  spotGalleryImage: {
    width: '100%',
    height: '100%',
  },
  spotGalleryActiveBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.primary,
  },
  spotGalleryActiveText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  reviewCount: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reviewComposer: {
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  ratingPicker: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  reviewInput: {
    minHeight: 92,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  reviewMediaPreview: {
    gap: spacing.sm,
  },
  mediaThumb: {
    width: 82,
    height: 82,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.secondary,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  videoThumb: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.secondary,
  },
  videoText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  removeMedia: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  attachButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '12',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  attachText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  postButton: {
    minWidth: 108,
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    ...shadow.card,
  },
  postText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reviewCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reviewerAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reviewerImage: {
    width: '100%',
    height: '100%',
  },
  reviewerInitial: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  reviewerCopy: {
    flex: 1,
  },
  reviewerName: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 3,
  },
  reviewComment: {
    fontSize: fontSize.md,
    lineHeight: 21,
    fontWeight: '600',
  },
  reviewMediaTile: {
    width: 116,
    height: 92,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.secondary,
  },
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  likeButton: {
    minHeight: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primary + '12',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  likeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyReviews: {
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  emptyReviewTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  emptyReviewText: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  detailsPanel: {
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  detailList: {
    gap: spacing.sm,
  },
  detailRow: {
    minHeight: 62,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  detailValue: {
    marginTop: 3,
    fontSize: fontSize.sm,
    lineHeight: 18,
    fontWeight: '800',
  },
  suggestEditButton: {
    minHeight: 62,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '28',
  },
  suggestEditIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary + '12',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  routeBadgeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mapCard: {
    height: 220,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  ownerPrompt: {
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  ownerPromptLink: {
    color: colors.primary,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  floatingFooter: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    minHeight: 78,
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.white + '66',
    ...shadow.lifted,
  },
  accessLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  accessPrice: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  footerButton: {
    flex: 1,
  },
  reportBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'flex-end',
  },
  websiteBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  websitePreview: {
    height: '82%',
    borderRadius: radius.xxl,
    overflow: 'hidden',
    ...shadow.lifted,
  },
  websiteHeader: {
    minHeight: 70,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  websiteHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  websiteTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  websiteUrl: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  websiteFrame: {
    flex: 1,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  websiteWebView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  websiteLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  websiteErrorTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  websiteErrorText: {
    textAlign: 'center',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  reportSheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    gap: spacing.lg,
    maxHeight: '88%',
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reportTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  reportClose: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportSubtitle: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  reportReasonList: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  reportReasonButton: {
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  reportReasonText: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  editFieldList: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  editFieldChip: {
    minHeight: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  editFieldText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  editLocationPicker: {
    gap: spacing.sm,
  },
  editLocationMap: {
    height: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  editLocationHint: {
    minHeight: 44,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editLocationHintText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 18,
    fontWeight: '800',
  },
  currentValueBox: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 3,
  },
  currentValueLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  currentValueText: {
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '800',
  },
  otherReportBox: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  reportDetailsInput: {
    minHeight: 118,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlignVertical: 'top',
  },
  editNoteInput: {
    minHeight: 82,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlignVertical: 'top',
  },
  wordCount: {
    alignSelf: 'flex-end',
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  submitReportButton: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  disabledButton: {
    opacity: 0.72,
  },
  submitReportText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.3,
  },
  reportSuccess: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  reportSuccessIcon: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lifted,
  },
  reportSuccessTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  reportSuccessText: {
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  reportDoneButton: {
    minHeight: 52,
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  reportDoneText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
});
