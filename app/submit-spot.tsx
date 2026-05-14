import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
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
  ShieldCheck,
  Sparkles,
  Trees,
  Utensils,
  X,
} from 'lucide-react-native';
import { AppButton } from '../src/components/AppButton';
import { CategoryChip } from '../src/components/CategoryChip';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { TileMap } from '../src/components/TileMap';
import { colors } from '../src/constants/colors';
import { categories, fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useLocation } from '../src/hooks/useLocation';
import { useTheme } from '../src/hooks/useTheme';
import { spotSubmissionService } from '../src/services/spotSubmissionService';

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
  const [images, setImages] = useState<string[]>([]);
  const [latitude, setLatitude] = useState(10.3157);
  const [longitude, setLongitude] = useState(123.8854);
  const [showMap, setShowMap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const primaryCategory = selectedCategories[0] ?? null;

  function toggleCategory(item: string) {
    setSelectedCategories((current) =>
      current.includes(item) ? current.filter((category) => category !== item) : [...current, item]
    );
  }

  async function selectImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setImages((current) => [...current, ...result.assets.map((asset) => asset.uri)]);
    }
  }

  async function useCurrentLocation() {
    const current = await getCurrentLocation();
    if (!current) return;
    setLatitude(current.latitude);
    setLongitude(current.longitude);
    setShowMap(true);
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

    try {
      setSubmitting(true);
      await spotSubmissionService.createSubmission(
        {
          name: name.trim(),
          description: description.trim() || null,
          address: address.trim(),
          category: primaryCategory,
          categories: selectedCategories,
          latitude,
          longitude,
          images,
          reservation_fee: 0,
          reservation_type: 'free',
          payment_required: false,
          is_reservable: acceptsReservations,
          submitter_id: profile.id,
        },
        profile.display_name || 'Explorer'
      );
      Alert.alert('Spot submitted', 'Thanks for expanding the CebSpot network.', [
        { text: 'View Activity', onPress: () => router.replace('/activity') },
      ]);
    } catch (error: any) {
      console.error('Submit spot error:', error);
      Alert.alert('Submission failed', error.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer appColors={appColors} scroll>
      <View style={styles.header}>
        <Pressable style={[styles.backButton, { backgroundColor: appColors.white }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.intro}>
        <Text style={[styles.title, { color: appColors.onSurface }]}>Found a Spot?</Text>
        <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
          Help the community expand the network.
        </Text>
      </View>

      <View style={[styles.form, { backgroundColor: appColors.surfaceLow }]}>
        <Pressable style={[styles.upload, { backgroundColor: appColors.white }]} onPress={selectImage}>
          {images[0] ? (
            <Image source={{ uri: images[0] }} style={styles.uploadImage} />
          ) : (
            <>
              <View style={styles.uploadIcon}>
                <Camera size={24} color={colors.primary} />
              </View>
              <Text style={[styles.uploadText, { color: appColors.onSurfaceVariant }]}>Add Visual Proof</Text>
            </>
          )}
        </Pressable>

        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Spot Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Neon Brew Terminal"
            placeholderTextColor={appColors.onSurfaceVariant}
            style={[styles.input, { backgroundColor: appColors.white, color: appColors.onSurface }]}
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
            style={[styles.input, styles.textArea, { backgroundColor: appColors.white, color: appColors.onSurface }]}
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
          <View style={[styles.addressRow, { backgroundColor: appColors.white }]}>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Street, Barangay, City"
              placeholderTextColor={appColors.onSurfaceVariant}
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
                      backgroundColor: selected ? colors.primary : appColors.white,
                      borderColor: selected ? colors.primary : colors.outlineVariant + '55',
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

      <AppButton label="Submit Spot" loading={submitting} onPress={submit} />
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
    fontStyle: 'italic',
  },
  headerSpacer: {
    width: 42,
  },
  intro: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    fontStyle: 'italic',
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
  upload: {
    height: 190,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
  },
  uploadImage: {
    width: '100%',
    height: '100%',
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
    borderColor: colors.outlineVariant + '55',
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
    borderColor: colors.outlineVariant + '55',
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
});
