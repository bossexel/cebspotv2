import { userErrorMessage } from '../src/utils/userError';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  BackHandler,
  DeviceEventEmitter,
  Image,
  Linking,
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
import * as Location from 'expo-location';
import {
  ArrowLeft,
  Camera,
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
import { spotService } from '../src/services/spotService';
import { yourPostsService, type EditableSpotSubmission } from '../src/services/yourPostsService';
import { isCebuCoordinate, resolveAddressPin } from '../src/utils/addressGeocoding';
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
  const { spotId, submissionId } = useLocalSearchParams<{ spotId?: string; submissionId?: string }>();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [customCategoryOpen, setCustomCategoryOpen] = useState(false);
  const [customCategoryDraft, setCustomCategoryDraft] = useState('');
  const [editSubmission, setEditSubmission] = useState<EditableSpotSubmission | null>(null);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [addressLookupEnabled, setAddressLookupEnabled] = useState(false);
  const [addressLookupRetry, setAddressLookupRetry] = useState(0);
  const [addressLookupStatus, setAddressLookupStatus] = useState<'idle' | 'searching' | 'not-found' | 'outside-cebu' | 'permission-required' | 'permission-denied' | 'unavailable'>('idle');
  const addressLookupRequest = useRef(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [acceptsReservations, setAcceptsReservations] = useState<boolean | null>(null);
  const [media, setMedia] = useState<SpotSubmissionMediaAsset[]>([]);
  const [selectingMedia, setSelectingMedia] = useState(false);
  const mediaPickerOpen = useRef(false);
  const [latitude, setLatitude] = useState(10.3157);
  const [longitude, setLongitude] = useState(123.8854);
  const [locationOrigin, setLocationOrigin] = useState({ latitude: 10.3157, longitude: 123.8854 });
  const [coordinatesValid, setCoordinatesValid] = useState(true);
  const [locationEdited, setLocationEdited] = useState(false);
  const [mapInteracting, setMapInteracting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shareStatus, setShareStatus] = useState<'sharing' | 'queued' | null>(null);
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
    if (!profile?.id || spotId || submissionId) return;
    let active = true;

    spotSubmissionDraftService
      .get(profile.id)
      .then((draft) => {
        if (!active || !draft) return;
        setDraftId(draft.id);
        setName(draft.name);
        setDescription(draft.description);
        setAddress(draft.address);
        setSelectedCategories(draft.selectedCategories);
        setAcceptsReservations(draft.acceptsReservations);
        setLatitude(draft.latitude);
        setLongitude(draft.longitude);
        setLocationOrigin({ latitude: draft.latitude, longitude: draft.longitude });
        setCoordinatesValid(isCebuCoordinate({ latitude: draft.latitude, longitude: draft.longitude }));
        setMedia(draft.media);
      })
      .catch((error) => console.warn('Unable to restore spot draft:', error));

    return () => {
      active = false;
    };
  }, [profile?.id, spotId, submissionId]);

  useEffect(() => {
    if (!profile?.id || !submissionId) return;
    let active = true;
    setEditLoadError(null);
    void yourPostsService.getOwnSubmission(profile.id, submissionId).then((submission) => {
      if (!active) return;
      setEditSubmission(submission);
      setName(submission.name);
      setDescription(submission.description ?? '');
      setAddress(submission.address);
      const selected = Array.from(new Set([submission.category, ...(submission.categories ?? [])].filter(Boolean)));
      setSelectedCategories(selected);
      setAcceptsReservations(Boolean(submission.is_reservable));
      setLatitude(submission.latitude);
      setLongitude(submission.longitude);
      setLocationOrigin({ latitude: submission.latitude, longitude: submission.longitude });
      setCoordinatesValid(isCebuCoordinate({ latitude: submission.latitude, longitude: submission.longitude }));
    }).catch(() => {
      if (active) setEditLoadError('Your spot could not be loaded for editing. Check your connection and try again from Your Posts.');
    });
    return () => { active = false; };
  }, [profile?.id, submissionId]);

  useEffect(() => {
    if (!spotId) return;
    let active = true;
    spotService.getSpotById(spotId).then((spot) => {
      if (!active || !spot || !spot.is_public) return;
      setName(spot.name);
      setAddress(spot.address);
      setLatitude(spot.latitude);
      setLongitude(spot.longitude);
      setLocationOrigin({ latitude: spot.latitude, longitude: spot.longitude });
      setCoordinatesValid(isCebuCoordinate({ latitude: spot.latitude, longitude: spot.longitude }));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [spotId]);

  useEffect(() => {
    const query = address.trim();
    if (!addressLookupEnabled || Platform.OS !== 'android' || query.length < 5) {
      setAddressLookupStatus('idle');
      return;
    }

    let active = true;
    const requestId = ++addressLookupRequest.current;
    setAddressLookupStatus('searching');
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await resolveAddressPin(query);
          if (!active || requestId !== addressLookupRequest.current) return;
          if (result.status === 'permission-required') {
            setAddressLookupStatus('permission-required');
            return;
          }
          if (result.status === 'not-found') {
            setAddressLookupStatus('not-found');
            return;
          }
          if (result.status === 'outside-cebu') {
            setAddressLookupStatus('outside-cebu');
            return;
          }

          setLatitude(result.coordinate.latitude);
          setLongitude(result.coordinate.longitude);
          setLocationOrigin(result.coordinate);
          setLocationEdited(true);
          setCoordinatesValid(true);
          // The coordinates update quietly; keep the address field unobstructed
          // so the user can continue editing the form without dismissing a notice.
          setAddressLookupStatus('idle');
        } catch {
          if (active && requestId === addressLookupRequest.current) setAddressLookupStatus('unavailable');
        }
      })();
    }, 850);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [address, addressLookupEnabled, addressLookupRetry]);

  function toggleCategory(item: string) {
    if (selectedCategories.includes(item)) {
      setSelectedCategories((current) => current.filter((category) => category !== item));
      return;
    }
    if (selectedCategories.length >= 8) {
      Alert.alert('Category limit reached', 'You can choose up to eight categories. Remove one before adding another.');
      return;
    }
    setSelectedCategories((current) => [...current, item]);
  }

  function addCustomCategory() {
    const label = customCategoryDraft.trim().replace(/\s+/g, ' ');
    if (label.length < 2 || label.length > 50) {
      Alert.alert('Category name needed', 'Enter a category from 2 to 50 characters.');
      return;
    }
    if (selectedCategories.some((category) => category.toLowerCase() === label.toLowerCase())) {
      Alert.alert('Category already added', 'Choose it from the selected categories instead.');
      return;
    }
    if (selectedCategories.length >= 8) {
      Alert.alert('Category limit reached', 'You can add up to eight categories.');
      return;
    }
    setSelectedCategories((current) => [...current, label]);
    setCustomCategoryDraft('');
    setCustomCategoryOpen(false);
  }

  async function requestAddressLookupPermission() {
    setAddressLookupStatus('searching');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setAddressLookupStatus('permission-denied');
        return;
      }
      setAddressLookupRetry((current) => current + 1);
    } catch {
      setAddressLookupStatus('unavailable');
    }
  }

  function choosePhotoSource() {
    if (mediaPickerOpen.current || submitting || savingDraft || media.length >= maxMediaItems) return;
    Alert.alert('Add Spot Media', 'Take a new photo or choose photos from your gallery.', [
      { text: 'Take Photo', onPress: () => { void selectMedia('images', 'camera'); } },
      { text: 'Choose from Gallery', onPress: () => { void selectMedia('images'); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function selectMedia(mediaType: 'images' | 'videos', source: 'library' | 'camera' = 'library') {
    if (mediaPickerOpen.current || submitting || savingDraft) return;
    const remainingSlots = maxMediaItems - media.length;
    if (remainingSlots <= 0) {
      Alert.alert('Media limit reached', `You can attach up to ${maxMediaItems} photos and videos.`);
      return;
    }

    mediaPickerOpen.current = true;
    setSelectingMedia(true);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', permission.canAskAgain
            ? 'Allow camera access to take a spot photo. You can also choose a photo from your gallery.'
            : 'Enable camera access for CebSpot in your phone settings, or choose a photo from your gallery.',
          permission.canAskAgain ? [{ text: 'OK' }] : [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { void Linking.openSettings().catch(() => {
              Alert.alert('Open phone settings', 'Open your phone settings and enable camera access for CebSpot.');
            }); } },
          ]);
          return;
        }
      }
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      }) : await ImagePicker.launchImageLibraryAsync({
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
    } catch (error) {
      Alert.alert(source === 'camera' ? 'Camera unavailable' : 'Media unavailable',
        userErrorMessage(error, source === 'camera'
          ? 'We could not open the camera. Please try again or choose a photo from your gallery.'
          : 'We could not open your media. Please try again.'));
    } finally {
      mediaPickerOpen.current = false;
      setSelectingMedia(false);
    }
  }

  function removeMedia(assetId: string) {
    setMedia((current) => current.filter((asset) => asset.id !== assetId));
  }

  const updateSpotCoordinate = useCallback((coordinate: MapCoordinate | null) => {
    addressLookupRequest.current += 1;
    setAddressLookupStatus('idle');
    setLocationEdited(true);
    setCoordinatesValid(coordinate !== null && isCebuCoordinate(coordinate));
    if (!coordinate) return;
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
    if (!coordinatesValid || mapInteracting) {
      Alert.alert('Choose a Cebu location', 'CebSpot currently supports locations in Cebu only. Enter coordinates or place the pin within Cebu.');
      return;
    }
    if (!name.trim() || !address.trim() || !primaryCategory) {
      Alert.alert('Missing details', 'Spot name, address, and category are required.');
      return;
    }
    if (acceptsReservations === null) {
      Alert.alert('Missing reservation info', 'Please choose whether this spot accepts reservations.');
      return;
    }
    if (!submissionId && !media.some((asset) => asset.type === 'image')) {
      Alert.alert('Cover photo required', 'Add at least one photo before submitting this spot.');
      return;
    }

    try {
      setSubmitting(true);
      setShareStatus('sharing');

      if (submissionId) {
        if (!editSubmission) throw new Error(editLoadError ?? 'Spot details are still loading. Please try again.');
        await yourPostsService.updateOwnSubmission(profile.id, {
          ...editSubmission,
          name: name.trim(),
          description: description.trim() || null,
          category: primaryCategory,
          categories: selectedCategories,
          address: address.trim(),
          latitude,
          longitude,
          is_reservable: acceptsReservations,
        });
        DeviceEventEmitter.emit('your-posts-submission-updated');
        setShareStatus(null);
        setSubmitting(false);
        Alert.alert('Changes saved', 'Your spot is back in admin review. Photos remain as originally submitted.');
        router.back();
        return;
      }

      await spotSubmissionQueueService.enqueue(
        {
          name: name.trim(),
          spot_id: null,
          different_place: false,
          description: description.trim() || null,
          address: address.trim(),
          category: primaryCategory ?? 'Community',
          categories: selectedCategories,
          latitude,
          longitude,
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
      setShareStatus('queued');
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
        <Text style={[styles.title, { color: appColors.onSurface }]}>{submissionId ? 'Edit Your Spot' : 'Found a Spot?'}</Text>
        {!!editLoadError && <Text accessibilityRole="alert" style={[styles.editError, { color: appColors.danger }]}>{editLoadError}</Text>}
        <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
          Help the community expand the network.
        </Text>
      </View>

      <View style={[styles.form, { backgroundColor: appColors.surfaceLow }]}>
        {submissionId ? <Text style={[styles.editHint, { color: appColors.onSurfaceVariant }]}>Photos stay as originally submitted while you edit the spot details.</Text> : <View style={styles.field}>
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
              accessibilityLabel="Add spot media"
              disabled={selectingMedia || submitting || savingDraft}
              style={[
                styles.emptyMedia,
                { backgroundColor: appColors.inputSurface, borderColor: appColors.inputBorder },
              ]}
              onPress={choosePhotoSource}
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
              disabled={media.length >= maxMediaItems || selectingMedia || submitting || savingDraft}
              onPress={choosePhotoSource}
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
              disabled={media.length >= maxMediaItems || selectingMedia || submitting || savingDraft}
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
        </View>}

        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Spot Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
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
            {selectedCategories.filter((item) => !categories.includes(item)).map((item) => (
              <CategoryChip key={`custom-${item}`} label={item} selected onPress={() => toggleCategory(item)} appColors={appColors} />
            ))}
            <Pressable accessibilityRole="button" accessibilityLabel="Add a custom category" onPress={() => setCustomCategoryOpen(true)} style={[styles.addCategoryButton, { borderColor: appColors.outlineVariant }]}>
              <Text style={[styles.addCategoryText, { color: colors.primary }]}>+ Add</Text>
            </Pressable>
          </ScrollView>
          {submissionId && <Text style={[styles.editHint, { color: appColors.onSurfaceVariant }]}>
            {editSubmission?.status === 'approved'
              ? 'Saving sends this post back for admin review. Its live map listing stays unchanged until an admin updates it.'
              : 'Saving sends this spot back for admin review.'}
          </Text>}
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
              onChangeText={(value) => {
                addressLookupRequest.current += 1;
                setAddressLookupEnabled(true);
                setAddress(value);
              }}
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
          {(addressLookupStatus === 'not-found' || addressLookupStatus === 'outside-cebu' || addressLookupStatus === 'unavailable' || addressLookupStatus === 'permission-required' || addressLookupStatus === 'permission-denied') && (
            <View style={styles.addressFeedback}>
              {(addressLookupStatus === 'permission-required' || addressLookupStatus === 'permission-denied') ? (
                <>
                  <Text style={[styles.addressFeedbackText, { color: appColors.onSurfaceVariant }]}>Android needs location permission to look up this address. Your current location is not used.</Text>
                  <Pressable accessibilityRole="button" onPress={() => void requestAddressLookupPermission()} style={[styles.addressLookupButton, { borderColor: appColors.outlineVariant }]}>
                    <Text style={{ color: colors.primary, fontWeight: '800' }}>Allow address lookup</Text>
                  </Pressable>
                </>
              ) : (
                <Text accessibilityRole="alert" style={[styles.addressFeedbackText, { color: appColors.onSurfaceVariant }]}>
                  {addressLookupStatus === 'outside-cebu'
                    ? 'CebSpot currently supports locations in Cebu only. The pin was not moved; enter a Cebu address or choose a location within Cebu.'
                    : addressLookupStatus === 'not-found'
                    ? 'Could not find that address. The pin is unchanged; you can edit the address or place the pin on the map.'
                    : 'Address lookup is unavailable right now. The pin is unchanged; you can edit the address or place it on the map.'}
                </Text>
              )}
            </View>
          )}
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

        <View style={styles.policy}>
          <ShieldCheck size={16} color={colors.primary} />
          <Text style={[styles.policyText, { color: appColors.onSurfaceVariant }]}>
            Your post will appear in Activity after submission. An admin verifies the place and links it to the right listing. New places need admin approval before appearing on the map.
          </Text>
        </View>
      </View>

      <AppButton
        label={submitting ? (submissionId ? 'Saving changes...' : 'Spot uploading...') : submissionId ? 'Save Changes' : 'Submit Spot'}
        disabled={savingDraft || !coordinatesValid || mapInteracting || Boolean(submissionId && (!editSubmission || editLoadError))}
        loading={submitting}
        onPress={submit}
      />

      <Modal visible={customCategoryOpen} transparent animationType="fade" onRequestClose={() => setCustomCategoryOpen(false)}>
        <View style={styles.categoryModalBackdrop}>
          <View style={[styles.categoryModal, { backgroundColor: appColors.surfaceRaised }]}>
            <Text style={[styles.categoryModalTitle, { color: appColors.onSurface }]}>Add a category</Text>
            <TextInput accessibilityLabel="Custom category name" value={customCategoryDraft} onChangeText={setCustomCategoryDraft}
              placeholder="e.g. Board game cafe" maxLength={50} autoCapitalize="words" returnKeyType="done" onSubmitEditing={addCustomCategory}
              style={[styles.categoryInput, { color: appColors.onSurface, backgroundColor: appColors.inputSurface, borderColor: appColors.inputBorder }]} />
            <View style={styles.categoryModalActions}>
              <Pressable accessibilityRole="button" onPress={() => { setCustomCategoryOpen(false); setCustomCategoryDraft(''); }} style={styles.categoryModalButton}><Text style={{ color: appColors.onSurfaceVariant }}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={addCustomCategory} style={styles.categoryModalButton}><Text style={{ color: colors.primary, fontWeight: '800' }}>Add category</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(shareStatus)} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.statusOverlayBackdrop}>
          <View style={[styles.statusOverlayCard, { backgroundColor: appColors.surfaceRaised }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.statusOverlayText, { color: appColors.onSurface }]}>
              {shareStatus === 'sharing' ? 'Sharing the Spot' : "Upload started. We'll notify you when it is submitted."}
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
        message="Photos are processed to blur detected faces before posting. Automated detection can miss faces. Review the processed photos and avoid sharing sensitive images. Select I Agree to continue filling out the spot details."
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
  addCategoryButton: {
    minHeight: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  addCategoryText: { fontSize: fontSize.sm, fontWeight: '900' },
  editHint: { fontSize: fontSize.xs, lineHeight: 18 },
  editError: { marginTop: spacing.sm, textAlign: 'center' },
  categoryModalBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.42)' },
  categoryModal: { padding: spacing.lg, borderRadius: radius.xl, gap: spacing.md },
  categoryModalTitle: { fontSize: fontSize.lg, fontWeight: '900' },
  categoryInput: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  categoryModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
  categoryModalButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
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
  addressFeedback: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  addressFeedbackText: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  addressLookupPermission: {
    gap: spacing.xs,
  },
  addressLookupButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
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
