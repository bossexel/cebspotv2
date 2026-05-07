import React, { useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { ArrowLeft, Camera, Check, ChevronRight, MapPin, ShieldCheck, Sparkles, X } from 'lucide-react-native';
import { AppButton } from '../src/components/AppButton';
import { CategoryChip } from '../src/components/CategoryChip';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { categories, fontSize, radius, shadow, spacing } from '../src/constants/design';
import { lightTileUrl, mapAttribution } from '../src/constants/mapTiles';
import { useAuth } from '../src/hooks/useAuth';
import { useLocation } from '../src/hooks/useLocation';
import { useTheme } from '../src/hooks/useTheme';
import { spotSubmissionService } from '../src/services/spotSubmissionService';

export default function SubmitSpotScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const { getCurrentLocation, loading: locating } = useLocation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [fee, setFee] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [latitude, setLatitude] = useState(10.3157);
  const [longitude, setLongitude] = useState(123.8854);
  const [showMap, setShowMap] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    if (!name.trim() || !address.trim() || !category) {
      Alert.alert('Missing details', 'Spot name, address, and category are required.');
      return;
    }

    try {
      setSubmitting(true);
      await spotSubmissionService.createSubmission(
        {
          name: name.trim(),
          description: description.trim() || null,
          address: address.trim(),
          category,
          latitude,
          longitude,
          images,
          reservation_fee: Number(fee || 0),
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
        <Text style={[styles.headerTitle, { color: appColors.onSurface }]}>New Pulse</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.intro}>
        <Text style={[styles.title, { color: appColors.onSurface }]}>Found a hidden gem?</Text>
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
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {categories.map((item) => (
              <CategoryChip
                key={item}
                label={item}
                selected={item === category}
                onPress={() => setCategory(item)}
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
              placeholder="Street, barangay, city"
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
            <MapView
              style={styles.map}
              mapType={Platform.OS === 'android' ? 'none' : 'standard'}
              initialRegion={{
                latitude,
                longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
              onPress={(event) => {
                setLatitude(event.nativeEvent.coordinate.latitude);
                setLongitude(event.nativeEvent.coordinate.longitude);
              }}
            >
              <UrlTile urlTemplate={lightTileUrl} maximumZ={19} tileSize={256} />
              <Marker coordinate={{ latitude, longitude }} pinColor={colors.primary} />
            </MapView>
            <Text style={styles.attribution}>{mapAttribution}</Text>
            <Pressable style={styles.closeMap} onPress={() => setShowMap(false)}>
              <X size={16} color={colors.white} />
            </Pressable>
          </View>
        )}

        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Reservation Fee</Text>
          <TextInput
            value={fee}
            onChangeText={setFee}
            keyboardType="number-pad"
            placeholder="Optional, PHP"
            placeholderTextColor={appColors.onSurfaceVariant}
            style={[styles.input, { backgroundColor: appColors.white, color: appColors.onSurface }]}
          />
        </View>

        <View style={styles.policy}>
          <ShieldCheck size={16} color={colors.primary} />
          <Text style={[styles.policyText, { color: appColors.onSurfaceVariant }]}>
            Submitted spots go into Supabase spot_submissions and can be approved before becoming public.
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
  attribution: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.86)',
    color: colors.onSurfaceVariant,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: '800',
    overflow: 'hidden',
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
