import { userErrorMessage } from '../src/utils/userError';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Modal,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Camera,
  Check,
  MapPin,
  Play,
  ShieldCheck,
  Video,
  X,
} from 'lucide-react-native';
import { AppButton } from '../src/components/AppButton';
import { CategoryChip } from '../src/components/CategoryChip';
import { ConfirmationModal } from '../src/components/ConfirmationModal';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { SpotLocationPicker } from '../src/components/SpotLocationPicker';
import type { MapCoordinate } from '../src/components/map/types';
import { colors } from '../src/constants/colors';
import { categories, fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { spotSubmissionDraftService } from '../src/services/spotSubmissionDraftService';
import { spotSubmissionQueueService } from '../src/services/spotSubmissionQueueService';
import { findMatchingSpots, type SpotMatch } from '../src/services/spotMatchingService';
import { spotService } from '../src/services/spotService';
import type { SpotSubmissionDraft, SpotSubmissionMediaAsset } from '../src/types';

const maxMediaItems = 5;
const maxVideoDurationMs = 15_000;
const maxVideoFileSize = 25 * 1024 * 1024;

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDuration(durationMs?: number | null) {
  if (!durationMs) return 'Video';
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `0:${seconds.toString().padStart(2, '0')}`;
}

export default function SubmitSpotScreen() {
  const router = useRouter();
  const { spotId } = useLocalSearchParams<{ spotId?: string }>();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [matches, setMatches] = useState<SpotMatch[]>([]);
  const [linkedSpot, setLinkedSpot] = useState<SpotSubmissionDraft['linkedSpot']>(null);
  const [differentPlace, setDifferentPlace] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState(false);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [acceptsReservations, setAcceptsReservations] = useState<boolean | null>(null);
  const [media, setMedia] = useState<SpotSubmissionMediaAsset[]>([]);
  const [latitude, setLatitude] = useState(10.3157);
  const [longitude, setLongitude] = useState(123.8854);
  const [locationOrigin, setLocationOrigin] = useState({ latitude: 10.3157, longitude: 123.8854 });
  const [coordinatesValid, setCoordinatesValid] = useState(true);
  const [locationEdited, setLocationEdited] = useState(false);
  const [mapInteracting, setMapInteracting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shareStatus, setShareStatus] = useState<'sharing' | 'success' | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [privacyNoticeAccepted, setPrivacyNoticeAccepted] = useState(false);
  const primaryCategory = selectedCategories[0] ?? null;
  const hasFormContent = useMemo(
    () =>
      Boolean(
        name.trim() ||
          description.trim() ||
          address.trim() ||
          selectedCategories.length ||
          acceptsReservations !== null ||
          media.length || locationEdited
      ),
    [acceptsReservations, address, description, media.length, name, selectedCategories.length, locationEdited]
  );

  useEffect(() => {
    if (!profile?.id || spotId) return;
    let active = true;

    spotSubmissionDraftService
      .get(profile.id)
      .then((draft) => {
        if (!active || !draft) return;
        setDraftId(draft.id);
        setLinkedSpot(draft.linkedSpot ?? null);
        setDifferentPlace(draft.differentPlace ?? false);
        setName(draft.name);
        setDescription(draft.description);
        setAddress(draft.address);
        setSelectedCategories(draft.selectedCategories);
        setAcceptsReservations(draft.acceptsReservations);
        setLatitude(draft.latitude);
        setLongitude(draft.longitude);
        setLocationOrigin({ latitude: draft.latitude, longitude: draft.longitude });
        setCoordinatesValid(true);
        setMedia(draft.media);
      })
      .catch((error) => console.warn('Unable to restore spot draft:', error));

    return () => {
      active = false;
    };
  }, [profile?.id, spotId]);

  useEffect(() => {
    if (!spotId) return;
    let active = true;
    spotService.getSpotById(spotId).then((spot) => {
      if (!active || !spot || !spot.is_public) return;
      setLinkedSpot({ id: spot.id, name: spot.name, address: spot.address, latitude: spot.latitude, longitude: spot.longitude });
      setDifferentPlace(false);
      setName(spot.name);
      setAddress(spot.address);
      setLatitude(spot.latitude);
      setLongitude(spot.longitude);
      setLocationOrigin({ latitude: spot.latitude, longitude: spot.longitude });
      setCoordinatesValid(true);
    }).catch(() => { if (active) setMatchError(true); });
    return () => { active = false; };
  }, [spotId]);

  useEffect(() => {
    let active = true;
    setMatching(name.trim().length >= 2);
    setMatches([]);
    setMatchError(false);
    if (name.trim().length < 2 || !coordinatesValid || mapInteracting) { setMatching(false); return; }
    const timer = setTimeout(() => {
      findMatchingSpots(name, latitude, longitude)
        .then((items) => { if (active) setMatches(items); })
        .catch(() => { if (active) setMatchError(true); })
        .finally(() => { if (active) setMatching(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [name, latitude, longitude, coordinatesValid, mapInteracting]);

  function resetPlaceChoice() {
    setLinkedSpot(null);
    setDifferentPlace(false);
  }

  function toggleCategory(item: string) {
    setSelectedCategories((current) =>
      current.includes(item) ? current.filter((category) => category !== item) : [...current, item]
    );
  }

  async function selectMedia(mediaType: 'images' | 'videos') {
    const remainingSlots = maxMediaItems - media.length;
    if (remainingSlots <= 0) {
      Alert.alert('Media limit reached', `You can attach up to ${maxMediaItems} photos and videos.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [mediaType],
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      orderedSelection: true,
      quality: 0.8,
      videoMaxDuration: 15,
    });

    if (!result.canceled) {
      const rejected: string[] = [];
      const accepted = result.assets.flatMap<SpotSubmissionMediaAsset>((asset, index) => {
        const type = asset.type === 'video' || asset.mimeType?.startsWith('video/') ? 'video' : 'image';
        if (type === 'video' && (!asset.duration || asset.duration > maxVideoDurationMs)) {
          rejected.push(asset.duration ? 'Videos must be 15 seconds or shorter.' : 'A video length could not be verified.');
          return [];
        }
        if (type === 'video' && asset.fileSize && asset.fileSize > maxVideoFileSize) {
          rejected.push('Videos must be 25 MB or smaller.');
          return [];
        }
        return [{
          id: createLocalId(`${type}-${index}`),
          uri: asset.uri,
          type,
          mimeType: asset.mimeType ?? null,
          durationMs: asset.duration ?? null,
          fileName: asset.fileName ?? null,
          fileSize: asset.fileSize ?? null,
        }];
      });

      setMedia((current) => {
        const knownUris = new Set(current.map((asset) => asset.uri));
        const next = [...current, ...accepted.filter((asset) => !knownUris.has(asset.uri))].slice(0, maxMediaItems);
        return [
          ...next.filter((asset) => asset.type === 'image'),
          ...next.filter((asset) => asset.type === 'video'),
        ];
      });

      if (rejected.length) {
        Alert.alert('Some media was not added', [...new Set(rejected)].join('\n'));
      }
    }
  }

  function removeMedia(assetId: string) {
    setMedia((current) => current.filter((asset) => asset.id !== assetId));
  }

  const updateSpotCoordinate = useCallback((coordinate: MapCoordinate | null) => {
    setLocationEdited(true);
    setCoordinatesValid(coordinate !== null);
    if (!coordinate) return;
    setLinkedSpot(null); setDifferentPlace(false);
    setLatitude(coordinate.latitude); setLongitude(coordinate.longitude);
  }, []);

  const closeLocationMap = useCallback(() => { setShowMap(false); setMapInteracting(false); }, []);

  const requestExit = useCallback(() => {
    if (submitting || savingDraft) return;
    if (!hasFormContent) {
      router.back();
      return;
    }
    setExitConfirmationOpen(true);
  }, [hasFormContent, router, savingDraft, submitting]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        requestExit();
        return true;
      });
      return () => subscription.remove();
    }, [requestExit])
  );

  function buildDraft(id: string): SpotSubmissionDraft {
    return {
      id,
      linkedSpot,
      differentPlace,
      name,
      description,
      address,
      selectedCategories,
      acceptsReservations,
      latitude,
      longitude,
      media,
      updatedAt: new Date().toISOString(),
    };
  }

  async function saveDraftAndExit() {
    if (!profile?.id || savingDraft) return;
    try {
      setSavingDraft(true);
      const saved = await spotSubmissionDraftService.save(
        profile.id,
        buildDraft(draftId ?? createLocalId('draft'))
      );
      setDraftId(saved.id);
      setExitConfirmationOpen(false);
      router.back();
    } catch (error: any) {
      Alert.alert('Draft not saved', userErrorMessage(error, 'We could not save this. Please try again.'));
    } finally {
      setSavingDraft(false);
    }
  }

  async function exitWithoutSaving() {
    if (profile?.id) {
      await spotSubmissionDraftService.clear(profile.id).catch((error) => {
        console.warn('Unable to clear spot draft:', error);
      });
    }
    setExitConfirmationOpen(false);
    router.back();
  }

  async function submit() {
    if (!profile) {
      Alert.alert('Authentication required', 'Please sign in again to submit a spot.');
      return;
    }
    if (!linkedSpot && (!coordinatesValid || mapInteracting)) {
      Alert.alert('Choose a location', 'Enter valid latitude and longitude, or place the pin on the map.');
      return;
    }
    if (!linkedSpot && (!name.trim() || !address.trim() || !primaryCategory)) {
      Alert.alert('Missing details', 'Spot name, address, and category are required.');
      return;
    }
    if (!linkedSpot && acceptsReservations === null) {
      Alert.alert('Missing reservation info', 'Please choose whether this spot accepts reservations.');
      return;
    }
    if (matching || (matches.length > 0 && !linkedSpot && !differentPlace)) {
      Alert.alert('Confirm the place', 'Is this the spot you’re posting about? Select a match or choose “This is a different place”.');
      return;
    }
    if (!media.some((asset) => asset.type === 'image')) {
      Alert.alert('Cover photo required', 'Add at least one photo before submitting this spot.');
      return;
    }

    try {
      setSubmitting(true);
      setShareStatus('sharing');

      await spotSubmissionQueueService.enqueue(
        {
          name: linkedSpot?.name ?? name.trim(),
          spot_id: linkedSpot?.id ?? null,
          different_place: differentPlace,
          description: description.trim() || null,
          address: linkedSpot?.address ?? address.trim(),
          category: primaryCategory ?? 'Community',
          categories: selectedCategories,
          latitude: linkedSpot?.latitude ?? latitude,
          longitude: linkedSpot?.longitude ?? longitude,
          images: media.map((asset) => asset.uri),
          media,
          draftId: draftId ?? undefined,
          reservation_fee: 0,
          reservation_type: 'free',
          payment_required: false,
          is_reservable: acceptsReservations ?? false,
          submitter_id: profile.id,
        },
        profile.display_name || 'Explorer'
      );
      setShareStatus('success');
      setTimeout(() => {
        setShareStatus(null);
        router.replace('/');
      }, 1000);
    } catch (error: any) {
      console.error('Submit spot error:', error);
      setShareStatus(null);
      Alert.alert('Submission failed', userErrorMessage(error, 'We could not save this. Please try again.'));
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer appColors={appColors} scroll scrollEnabled={!mapInteracting}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave spot submission"
          style={[styles.backButton, { backgroundColor: appColors.surfaceRaised }]}
          onPress={requestExit}
        >
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        {draftId ? (
          <View style={[styles.draftBadge, { backgroundColor: appColors.surfaceContainer }]}>
            <Text style={[styles.draftBadgeText, { color: appColors.onSurfaceVariant }]}>Draft restored</Text>
          </View>
        ) : null}
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.intro}>
        <Text style={[styles.title, { color: appColors.onSurface }]}>Found a Spot?</Text>
        <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
          Help the community expand the network.
        </Text>
      </View>

      <View style={[styles.form, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.field}>
          <View style={styles.mediaHeader}>
            <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Media</Text>
            <Text style={[styles.mediaCount, { color: appColors.onSurfaceVariant }]}>
              {media.length}/{maxMediaItems}
            </Text>
          </View>

          {media.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaRail}
            >
              {media.map((asset, index) => (
                <View
                  key={asset.id}
                  style={[
                    styles.mediaTile,
                    { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant },
                  ]}
                >
                  {asset.type === 'image' ? (
                    <Image source={{ uri: asset.uri }} style={styles.mediaPreview} />
                  ) : (
                    <View style={[styles.videoPreview, { backgroundColor: appColors.surfaceHighest }]}>
                      <Play size={28} color={colors.primary} fill={colors.primary} />
                      <Text style={[styles.videoDuration, { color: appColors.onSurface }]}>
                        {formatDuration(asset.durationMs)}
                      </Text>
                    </View>
                  )}
                  {index === 0 && asset.type === 'image' ? (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>Cover</Text>
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${asset.type}`}
                    hitSlop={6}
                    style={styles.removeMediaButton}
                    onPress={() => removeMedia(asset.id)}
                  >
                    <X size={15} color={colors.white} strokeWidth={3} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add spot photos"
              style={[
                styles.emptyMedia,
                { backgroundColor: appColors.inputSurface, borderColor: appColors.inputBorder },
              ]}
              onPress={() => selectMedia('images')}
            >
              <View style={styles.uploadIcon}>
                <Camera size={24} color={colors.primary} />
              </View>
              <Text style={[styles.uploadText, { color: appColors.onSurfaceVariant }]}>Add Spot Media</Text>
            </Pressable>
          )}

          <View style={styles.mediaActions}>
            <Pressable
              accessibilityRole="button"
              disabled={media.length >= maxMediaItems || submitting || savingDraft}
              onPress={() => selectMedia('images')}
              style={({ pressed }) => [
                styles.mediaAction,
                { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant },
                media.length >= maxMediaItems && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Camera size={18} color={colors.primary} />
              <Text style={[styles.mediaActionText, { color: appColors.onSurface }]}>Photos</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={media.length >= maxMediaItems || submitting || savingDraft}
              onPress={() => selectMedia('videos')}
              style={({ pressed }) => [
                styles.mediaAction,
                { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant },
                media.length >= maxMediaItems && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Video size={18} color={colors.primary} />
              <Text style={[styles.mediaActionText, { color: appColors.onSurface }]}>Video 15s</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Spot Name</Text>
          <TextInput
            value={name}
            onChangeText={(value) => { resetPlaceChoice(); setName(value); }}
            placeholder="e.g. Neon Brew Terminal"
            placeholderTextColor={appColors.onSurfaceVariant}
            selectionColor={appColors.primary}
            style={[
              styles.input,
              {
                backgroundColor: appColors.inputSurface,
                borderColor: appColors.inputBorder,
                color: appColors.onSurface,
              },
            ]}
          />
        </View>

        <View style={styles.field}>
          {matching && <Text style={{ color: appColors.onSurfaceVariant }}>Looking for matching spots…</Text>}
          {matchError && <Text style={{ color: appColors.onSurfaceVariant }}>Spot suggestions are unavailable. Your submission will still need admin place verification.</Text>}
          {matches.length > 0 && <Text style={[styles.label, { color: appColors.onSurface }]}>Is this the spot you’re posting about?</Text>}
          {matches.map((spot) => (
            <Pressable key={spot.id} accessibilityRole="button" accessibilityState={{ selected: linkedSpot?.id === spot.id }}
              onPress={() => { setLocationOrigin({ latitude, longitude }); setLinkedSpot(spot); setDifferentPlace(false); }}
              style={[styles.input, { borderColor: linkedSpot?.id === spot.id ? colors.primary : appColors.inputBorder }]}>
              <Text style={{ color: appColors.onSurface }}>{spot.name}{linkedSpot?.id === spot.id ? ' ✓' : ''}</Text>
              <Text style={{ color: appColors.onSurfaceVariant }}>{spot.address} · {Math.round(spot.distance_m)} m away</Text>
            </Pressable>
          ))}
          {(matches.length > 0 || linkedSpot) && <Pressable accessibilityRole="button" accessibilityState={{ selected: differentPlace }}
            onPress={() => { setLinkedSpot(null); setDifferentPlace(true); }} style={styles.locationNote}>
            <Text style={{ color: colors.primary }}>This is a different place{differentPlace ? ' ✓' : ''}</Text>
          </Pressable>}
          {linkedSpot && <Text style={{ color: appColors.onSurfaceVariant }}>Your post will link to {linkedSpot.name}. Your caption, media and comments belong to this post.</Text>}
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Caption</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What makes this spot worth finding?"
            placeholderTextColor={appColors.onSurfaceVariant}
            multiline
            selectionColor={appColors.primary}
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: appColors.inputSurface,
                borderColor: appColors.inputBorder,
                color: appColors.onSurface,
              },
            ]}
          />
        </View>

        {!linkedSpot && <>
        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Categories</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {categories.map((item) => (
              <CategoryChip
                key={item}
                label={item}
                selected={selectedCategories.includes(item)}
                onPress={() => toggleCategory(item)}
                appColors={appColors}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Address</Text>
          <View
            style={[
              styles.addressRow,
              { backgroundColor: appColors.inputSurface, borderColor: appColors.inputBorder },
            ]}
          >
            <TextInput
              value={address}
              onChangeText={(value) => { resetPlaceChoice(); setAddress(value); }}
              placeholder="Street, Barangay, City"
              placeholderTextColor={appColors.onSurfaceVariant}
              selectionColor={appColors.primary}
              style={[styles.addressInput, { color: appColors.onSurface }]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Choose spot location on map"
              accessibilityState={{ expanded: showMap }} style={styles.pinButton} onPress={() => setShowMap(true)}>
              <MapPin size={20} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        <SpotLocationPicker key={`${locationOrigin.latitude}:${locationOrigin.longitude}`} purpose="posting"
          latitude={locationOrigin.latitude} longitude={locationOrigin.longitude} category={primaryCategory ?? ''}
          mapVisible={showMap} onCloseMap={closeLocationMap}
          onChange={updateSpotCoordinate} onInteractionChange={setMapInteracting} />

        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Accepts Reservations?</Text>
          <View style={styles.reservationChoiceRow}>
            {[
              { label: 'Yes', value: true },
              { label: 'No', value: false },
            ].map((option) => {
              const selected = acceptsReservations === option.value;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => setAcceptsReservations(option.value)}
                  style={[
                    styles.reservationChoice,
                    {
                      backgroundColor: selected ? colors.primary : appColors.surfaceRaised,
                      borderColor: selected ? colors.primary : appColors.outlineVariant,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.reservationChoiceText,
                      { color: selected ? colors.white : appColors.onSurfaceVariant },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        </>}
        <View style={styles.policy}>
          <ShieldCheck size={16} color={colors.primary} />
          <Text style={[styles.policyText, { color: appColors.onSurfaceVariant }]}>
            New places need admin approval for the map. Each community post follows its own moderation rules. Ratings and reviews belong in the spot’s review section.
          </Text>
        </View>
      </View>

      <AppButton
        label={submitting ? 'Spot uploading...' : linkedSpot ? 'Post about this spot' : 'Submit Spot'}
        disabled={savingDraft || matching || (!linkedSpot && (!coordinatesValid || mapInteracting))}
        loading={submitting}
        onPress={submit}
      />

      <Modal visible={Boolean(shareStatus)} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.statusOverlayBackdrop}>
          <View style={[styles.statusOverlayCard, { backgroundColor: appColors.surfaceRaised }]}>
            {shareStatus === 'sharing' ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <Check size={42} color={colors.primary} />
            )}
            <Text style={[styles.statusOverlayText, { color: appColors.onSurface }]}>
              {shareStatus === 'sharing' ? 'Sharing the Spot' : 'Spot submitted'}
            </Text>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        visible={exitConfirmationOpen}
        title="Leave this spot?"
        message="Are you sure you want to exit without submitting?"
        onRequestClose={() => setExitConfirmationOpen(false)}
        actions={[
          {
            label: 'Keep Editing',
            onPress: () => setExitConfirmationOpen(false),
          },
          {
            label: savingDraft ? 'Saving Draft...' : 'Save as Draft',
            variant: 'primary',
            disabled: savingDraft,
            onPress: () => void saveDraftAndExit(),
          },
          {
            label: 'Exit Without Saving',
            variant: 'destructive',
            disabled: savingDraft,
            onPress: () => void exitWithoutSaving(),
          },
        ]}
      />

      <ConfirmationModal
        visible={!privacyNoticeAccepted}
        title="Privacy notice"
        message="For compliance with the Data Privacy Act, any image containing a visible face will have the face automatically blurred before the spot is posted. Select I Agree to continue filling out the spot details."
        onRequestClose={() => router.back()}
        actions={[
          {
            label: 'Not Now',
            onPress: () => router.back(),
          },
          {
            label: 'I Agree',
            variant: 'primary',
            onPress: () => setPrivacyNoticeAccepted(true),
          },
        ]}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
  },
  headerSpacer: {
    width: 42,
  },
  draftBadge: {
    minHeight: 30,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statusOverlayBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  statusOverlayCard: {
    minWidth: 190,
    minHeight: 150,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    ...shadow.card,
  },
  statusOverlayText: {
    fontSize: fontSize.md,
    fontWeight: '900',
    textAlign: 'center',
  },
  intro: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 31,
  },
  subtitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  form: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  mediaHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mediaCount: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  mediaRail: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  mediaTile: {
    width: 112,
    height: 150,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  videoDuration: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  coverBadge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  coverBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  removeMediaButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black + 'AA',
  },
  emptyMedia: {
    height: 150,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  uploadIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  uploadText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  mediaActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mediaAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mediaActionText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '700',
    borderWidth: 1,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  chips: {
    gap: spacing.sm,
  },
  addressRow: {
    minHeight: 54,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  addressInput: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  pinButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
    marginRight: spacing.xs,
  },
  locationNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reservationChoiceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reservationChoice: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reservationChoiceText: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  policy: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primary + '10',
  },
  policyText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
});
