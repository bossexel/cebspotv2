import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Coffee,
  Martini,
  MapPin,
  Music2,
  Play,
  ShieldCheck,
  Sparkles,
  Trees,
  Utensils,
  Video,
  X,
} from 'lucide-react-native';
import { AppButton } from '../src/components/AppButton';
import { CategoryChip } from '../src/components/CategoryChip';
import { ConfirmationModal } from '../src/components/ConfirmationModal';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { TileMap } from '../src/components/TileMap';
import { colors } from '../src/constants/colors';
import { categories, fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useLocation } from '../src/hooks/useLocation';
import { useTheme } from '../src/hooks/useTheme';
import { spotSubmissionDraftService } from '../src/services/spotSubmissionDraftService';
import { spotSubmissionQueueService } from '../src/services/spotSubmissionQueueService';
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

function getCategoryIcon(category = '') {
  const lower = category.toLowerCase();
  if (lower.includes('coffee') || lower.includes('cafe') || lower.includes('co-working')) return Coffee;
  if (lower.includes('club') || lower.includes('pulse') || lower.includes('night')) return Music2;
  if (lower.includes('bar') || lower.includes('chill')) return Martini;
  if (lower.includes('outdoor') || lower.includes('garden') || lower.includes('park')) return Trees;
  return Utensils;
}

function CenterPin({ category }: { category: string | null }) {
  const Icon = category ? getCategoryIcon(category) : null;

  return (
    <View pointerEvents="none" style={styles.centerPinWrap}>
      <View style={styles.centerPinHead}>
        {Icon ? <Icon size={17} color={colors.secondary} strokeWidth={2.8} /> : <View style={styles.centerPinDot} />}
      </View>
      <View style={styles.centerPinTip} />
    </View>
  );
}

export default function SubmitSpotScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const { getCurrentLocation, loading: locating } = useLocation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [acceptsReservations, setAcceptsReservations] = useState<boolean | null>(null);
  const [media, setMedia] = useState<SpotSubmissionMediaAsset[]>([]);
  const [latitude, setLatitude] = useState(10.3157);
  const [longitude, setLongitude] = useState(123.8854);
  const [showMap, setShowMap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const primaryCategory = selectedCategories[0] ?? null;
  const hasFormContent = useMemo(
    () =>
      Boolean(
        name.trim() ||
          description.trim() ||
          address.trim() ||
          selectedCategories.length ||
          acceptsReservations !== null ||
          media.length
      ),
    [acceptsReservations, address, description, media.length, name, selectedCategories.length]
  );

  useEffect(() => {
    if (!profile?.id) return;
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
        setMedia(draft.media);
      })
      .catch((error) => console.warn('Unable to restore spot draft:', error));

    return () => {
      active = false;
    };
  }, [profile?.id]);

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

  async function useCurrentLocation() {
    const current = await getCurrentLocation();
    if (!current) return;
    setLatitude(current.latitude);
    setLongitude(current.longitude);
    setShowMap(true);
  }

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
      Alert.alert('Draft not saved', error.message ?? 'Please try again.');
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
    if (!name.trim() || !address.trim() || !primaryCategory) {
      Alert.alert('Missing details', 'Spot name, address, and category are required.');
      return;
    }
    if (acceptsReservations === null) {
      Alert.alert('Missing reservation info', 'Please choose whether this spot accepts reservations.');
      return;
    }
    if (!media.some((asset) => asset.type === 'image')) {
      Alert.alert('Cover photo required', 'Add at least one photo before submitting this spot.');
      return;
    }

    try {
      setSubmitting(true);

      await spotSubmissionQueueService.enqueue(
        {
          name: name.trim(),
          description: description.trim() || null,
          address: address.trim(),
          category: primaryCategory,
          categories: selectedCategories,
          latitude,
          longitude,
          images: media.map((asset) => asset.uri),
          media,
          draftId: draftId ?? undefined,
          reservation_fee: 0,
          reservation_type: 'free',
          payment_required: false,
          is_reservable: acceptsReservations,
          submitter_id: profile.id,
        },
        profile.display_name || 'Explorer'
      );
      router.replace('/');
    } catch (error: any) {
      console.error('Submit spot error:', error);
      Alert.alert('Submission failed', error.message ?? 'Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer appColors={appColors} scroll>
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
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Description</Text>
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
              onChangeText={setAddress}
              placeholder="Street, Barangay, City"
              placeholderTextColor={appColors.onSurfaceVariant}
              selectionColor={appColors.primary}
              style={[styles.addressInput, { color: appColors.onSurface }]}
            />
            <Pressable style={styles.pinButton} onPress={useCurrentLocation}>
              {locating ? <Sparkles size={17} color={colors.primary} /> : <MapPin size={17} color={colors.primary} />}
            </Pressable>
          </View>
          <Pressable style={styles.locationNote} onPress={() => setShowMap((value) => !value)}>
            <Check size={12} color={colors.primary} />
            <Text style={styles.locationText}>
              Location pinned: {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </Text>
            <ChevronRight size={13} color={colors.primary} />
          </Pressable>
        </View>

        {showMap && (
          <View style={styles.mapBox}>
            <TileMap
              style={styles.map}
              center={{
                latitude,
                longitude,
              }}
              zoom={15}
              onCenterChange={(coordinate) => {
                setLatitude(coordinate.latitude);
                setLongitude(coordinate.longitude);
              }}
              onPressCoordinate={(coordinate) => {
                setLatitude(coordinate.latitude);
                setLongitude(coordinate.longitude);
              }}
            />
            <CenterPin category={primaryCategory} />
            <Pressable style={styles.closeMap} onPress={() => setShowMap(false)}>
              <X size={16} color={colors.white} />
            </Pressable>
          </View>
        )}

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
            Submitted spots are reviewed before becoming public. Reservation pricing is added by verified owners and checked by admins.
          </Text>
        </View>
      </View>

      <AppButton
        label={submitting ? 'Spot uploading...' : 'Submit Spot'}
        disabled={savingDraft}
        loading={submitting}
        onPress={submit}
      />

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
  locationText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  mapBox: {
    height: 230,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  centerPinWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 38,
    height: 48,
    marginLeft: -19,
    marginTop: -45,
    alignItems: 'center',
  },
  centerPinHead: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  centerPinDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.white,
  },
  centerPinTip: {
    width: 15,
    height: 15,
    marginTop: -9,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.primary,
    transform: [{ rotateZ: '45deg' }],
  },
  closeMap: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
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
