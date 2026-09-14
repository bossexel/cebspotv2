import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Grid3X3,
  Images as ImagesIcon,
  LogOut,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Store,
  Table2,
  TrendingUp,
  TriangleAlert,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmationModal } from '../src/components/ConfirmationModal';
import { PasswordInput } from '../src/components/PasswordInput';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { hasOwnerAccess, normalizeAuthEmail } from '../src/constants/authRoles';
import { clubBookableTables, clubTableDisplayName, normalizeClubTableInventory } from '../src/constants/clubFloorPlan';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { supabase } from '../src/lib/supabase';
import { ownerAccessService } from '../src/services/ownerAccessService';
import { ownerGalleryService } from '../src/services/ownerGalleryService';
import { paymentProofService } from '../src/services/paymentProofService';
import { reservationService } from '../src/services/reservationService';
import { reviewService } from '../src/services/reviewService';
import { spotService } from '../src/services/spotService';
import type { Reservation, Review, Spot, UserProfile } from '../src/types';
import {
  formatGuestCount,
  formatReservationDateTime,
  getPaymentStatusLabel,
  getReservationBookingId,
  getReservationStatusLabel,
  getReservationUniqueId,
} from '../src/utils/reservations';
import {
  getTableInventoryTotals,
  type TableInventory,
  type TableSlotId,
} from '../src/utils/tableInventory';

const cebspotLogo = require('../assets/cebspot-logo.png');

type OwnerTab = 'Overview' | 'Reservations' | 'Payments' | 'Reviews' | 'Tables & Pricing' | 'Spot Profile';
type GalleryFilter = 'all' | 'latest' | 'owner';
type OwnerGalleryItem = {
  id: string;
  url: string;
  source: 'owner' | 'community';
  createdAt: string;
};

type PortalIcon = React.ComponentType<any>;
type OwnerConfirmation =
  | { kind: 'approve-reservation'; reservation: Reservation }
  | { kind: 'mark-arrived'; reservation: Reservation }
  | { kind: 'mark-no-show'; reservation: Reservation }
  | { kind: 'view-payment-proof'; reservation: Reservation }
  | { kind: 'publish-settings'; reservationFee: number };

const ownerTabs: Array<{ label: OwnerTab; icon: PortalIcon }> = [
  { label: 'Overview', icon: Grid3X3 },
  { label: 'Reservations', icon: CalendarDays },
  { label: 'Payments', icon: CreditCard },
  { label: 'Reviews', icon: Star },
  { label: 'Tables & Pricing', icon: Table2 },
  { label: 'Spot Profile', icon: Store },
];

const galleryFilters: Array<{ value: GalleryFilter; label: string; icon: PortalIcon }> = [
  { value: 'all', label: 'All', icon: ImagesIcon },
  { value: 'latest', label: 'Latest', icon: Clock3 },
  { value: 'owner', label: 'By owner', icon: UserRound },
];

function ownerPhotoDate(url: string, fallback: string) {
  try {
    const match = decodeURIComponent(url).match(/owner-gallery[^/]*\/[^/]*\/(\d{13})-/);
    return match ? new Date(Number(match[1])).toISOString() : fallback;
  } catch {
    return fallback;
  }
}

function buildOwnerGallery(spot: Spot | null, reviews: Review[]) {
  if (!spot) return [];

  const items: OwnerGalleryItem[] = [];
  const seen = new Set<string>();
  const ownerFallback = spot.created_at || spot.updated_at || new Date(0).toISOString();

  for (const [index, rawUrl] of (spot.images ?? []).entries()) {
    const url = rawUrl?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    items.push({
      id: `owner-${index}-${url}`,
      url,
      source: 'owner',
      createdAt: ownerPhotoDate(url, ownerFallback),
    });
  }

  for (const review of reviews) {
    for (const [index, rawUrl] of (review.media_urls ?? []).entries()) {
      if (review.media_types?.[index] === 'video') continue;
      const url = rawUrl?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push({
        id: `community-${review.id}-${index}`,
        url,
        source: 'community',
        createdAt: review.created_at,
      });
    }
  }

  return items;
}

function formatPeso(amount: number) {
  return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactPeso(amount: number) {
  return `PHP ${amount.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function isApprovedReservation(reservation: Reservation) {
  return ['confirmed', 'checked_in', 'completed'].includes(reservation.status);
}

function isPendingPayment(reservation: Reservation) {
  return reservation.payment_required && reservation.payment_status === 'pending';
}

function isPaymongoReservation(reservation: Reservation) {
  return reservation.payment_method === 'paymongo_gcash' || reservation.payment_method === 'paymongo_qrph';
}

function getPaymongoMethodLabel(reservation: Reservation) {
  return reservation.payment_method === 'paymongo_qrph' ? 'PayMongo QR Ph' : 'PayMongo GCash';
}

function isAlreadySettled(reservation: Reservation) {
  return reservation.payment_status === 'paid' || ['confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'].includes(reservation.status);
}

// Manual GCash reservations can only be approved by the owner, since PayMongo
// reservations are confirmed automatically once the gateway's webhook fires.
function canManuallyApproveReservation(reservation: Reservation) {
  return reservation.payment_required && !isPaymongoReservation(reservation) && !isAlreadySettled(reservation);
}

function canRecordAttendance(reservation: Reservation) {
  if (['checked_in', 'completed', 'cancelled', 'no_show'].includes(reservation.status)) return false;
  if (reservation.payment_required && reservation.payment_status !== 'paid') return false;
  return ['pending', 'confirmed', 'rescheduled'].includes(reservation.status);
}

// A manual GCash reservation is eligible for approval, but the owner hasn't
// done the verification step yet (checked the screenshot, or there isn't one
// and no reference was given either). Returns null when there's nothing
// blocking approval right now.
function getApprovalGateReason(reservation: Reservation, viewedProofIds: Set<string>): string | null {
  if (!canManuallyApproveReservation(reservation)) return null;
  const hasProof = Boolean(reservation.payment_proof_url);
  if (hasProof && !viewedProofIds.has(reservation.id)) {
    return 'Review proof first';
  }
  if (!hasProof && !reservation.payment_reference?.trim()) {
    return 'No proof or reference yet';
  }
  return null;
}

function getReservationDisplayRef(reservation: Reservation) {
  return `CEBSPOT-${getReservationBookingId(reservation)}-${getReservationUniqueId(reservation)}`;
}

function getReservationGuestName(reservation: Reservation) {
  return reservation.guest_name?.trim() || reservation.guest_email?.trim() || `Guest ${reservation.user_id.slice(0, 8)}`;
}

function getOwnerConfirmationTitle(confirmation: OwnerConfirmation | null) {
  if (confirmation?.kind === 'approve-reservation') return 'Approve this reservation?';
  if (confirmation?.kind === 'mark-arrived') return 'Confirm guest arrival?';
  if (confirmation?.kind === 'mark-no-show') return 'Mark this guest as no-show?';
  if (confirmation?.kind === 'view-payment-proof') return 'Open payment proof?';
  if (confirmation?.kind === 'publish-settings') return 'Publish table changes?';
  return 'Confirm owner action';
}

function getOwnerConfirmationMessage(confirmation: OwnerConfirmation | null) {
  if (confirmation?.kind === 'approve-reservation') {
    return `This confirms ${getReservationDisplayRef(confirmation.reservation)} for ${formatReservationDateTime(confirmation.reservation)} and marks it as paid. Make sure the amount and reference match what actually landed in your GCash account before proceeding — this can't be auto-reversed.`;
  }
  if (confirmation?.kind === 'mark-arrived') {
    return `Confirm that ${getReservationGuestName(confirmation.reservation)} arrived for ${formatReservationDateTime(confirmation.reservation)}. Their table will remain occupied.`;
  }
  if (confirmation?.kind === 'mark-no-show') {
    return `This marks ${getReservationGuestName(confirmation.reservation)} as a no-show and immediately releases ${confirmation.reservation.table_id ? clubTableDisplayName(confirmation.reservation.table_id) : 'their table'} for the next guest. The reservation and payment record will remain in history.`;
  }
  if (confirmation?.kind === 'view-payment-proof') {
    return `This opens the uploaded payment screenshot for ${getReservationDisplayRef(confirmation.reservation)}. Compare the amount and reference against your own GCash account activity before approving.`;
  }
  if (confirmation?.kind === 'publish-settings') {
    return `This will publish the current table inventory and set the reservation price to ${formatPeso(confirmation.reservationFee)}.`;
  }
  return 'Please confirm before continuing.';
}

function getOwnerConfirmationActionLabel(
  confirmation: OwnerConfirmation | null,
  savingSettings: boolean,
  approvingReservation: boolean,
  updatingAttendance: boolean,
) {
  if (confirmation?.kind === 'approve-reservation') return approvingReservation ? 'Approving...' : 'Approve';
  if (confirmation?.kind === 'mark-arrived') return updatingAttendance ? 'Confirming...' : 'Guest Arrived';
  if (confirmation?.kind === 'mark-no-show') return updatingAttendance ? 'Updating...' : 'Mark No Show';
  if (confirmation?.kind === 'view-payment-proof') return 'Open Proof';
  if (confirmation?.kind === 'publish-settings') return savingSettings ? 'Publishing...' : 'Publish';
  return 'Confirm';
}

export default function OwnerDashboardScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { appColors } = useTheme();
  const { profile, loading: authLoading, signIn, logOut } = useAuth();
  const ownerSupabase = supabase;
  const [activeTab, setActiveTab] = useState<OwnerTab>('Overview');
  const [spot, setSpot] = useState<Spot | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessClaimed, setAccessClaimed] = useState<boolean | null>(null);
  const [managedSpotId, setManagedSpotId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [attendanceUpdatingId, setAttendanceUpdatingId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutConfirmationOpen, setSignOutConfirmationOpen] = useState(false);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [ownerConfirmation, setOwnerConfirmation] = useState<OwnerConfirmation | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [draftFee, setDraftFee] = useState('150');
  const [draftInventory, setDraftInventory] = useState<TableInventory>(() => normalizeClubTableInventory(null));
  // Gate for manual GCash approval: an owner must open a reservation's payment
  // proof (and, implicitly, check it against their own GCash account) before
  // the Approve action becomes available for that reservation.
  const [viewedProofIds, setViewedProofIds] = useState<Set<string>>(new Set());
  const isOwner = hasOwnerAccess(profile);
  // NOTE: tablet threshold left as-is intentionally — the fix here is that the
  // phone branch no longer reuses tablet-scale spacing/typography anymore.
  const tabletLayout = width >= 900 && Math.min(width, height) >= 600;

  const pendingPayments = useMemo(() => reservations.filter(isPendingPayment), [reservations]);
  const approvedReservations = useMemo(() => reservations.filter(isApprovedReservation), [reservations]);
  const paidReservations = useMemo(() => reservations.filter((reservation) => reservation.payment_status === 'paid'), [reservations]);
  const paymentReservations = useMemo(
    () => reservations.filter((reservation) => reservation.payment_required || reservation.payment_reference || reservation.payment_proof_url),
    [reservations],
  );
  const paidTotal = useMemo(
    () => paidReservations.reduce((sum, reservation) => sum + Number(reservation.reservation_fee || reservation.fee || 0), 0),
    [paidReservations],
  );
  const tableSummaries = useMemo(() => getTableInventoryTotals(draftInventory), [draftInventory]);
  const activeTables = clubBookableTables.length;
  const totalTables = clubBookableTables.length;
  const rating = Number(spot?.rating ?? 4.7);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL).catch((error) => {
      console.warn('Unable to unlock owner dashboard orientation:', error);
    });

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isOwner) return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setExitConfirmationOpen(true);
      return true;
    });

    return () => subscription.remove();
  }, [isOwner]);

  useEffect(() => {
    if (!spot) return;
    setDraftFee(String(Number(spot.gcash_amount ?? spot.reservation_fee ?? 150)));
    setDraftInventory(normalizeClubTableInventory(spot.table_inventory));
  }, [spot?.gcash_amount, spot?.reservation_fee, spot?.table_inventory]);

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await logOut();
      setSignOutConfirmationOpen(false);
      router.replace('/login');
    } catch (error: any) {
      Alert.alert('Sign out failed', error.message ?? 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  async function loadDashboard() {
    if (!isOwner) {
      setSpot(null);
      setReservations([]);
      setReviews([]);
      setAccessClaimed(false);
      setManagedSpotId(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setRefreshing(true);
      const assignedSpotId = await ownerAccessService.getPrimaryManagedSpotId(ownerSupabase);
      setManagedSpotId(assignedSpotId);
      setAccessClaimed(Boolean(assignedSpotId));
      if (!assignedSpotId) {
        setSpot(null);
        setReservations([]);
        setReviews([]);
        return;
      }
      const [nextSpot, nextReservations, nextReviews] = await Promise.all([
        spotService.getSpotById(assignedSpotId, ownerSupabase),
        reservationService.getSpotReservations(assignedSpotId, ownerSupabase),
        reviewService.getReviewsForSpot(assignedSpotId, ownerSupabase),
      ]);
      setSpot(nextSpot);
      setReservations(nextReservations);
      setReviews(nextReviews);
    } catch (error) {
      console.error('Unable to load owner dashboard:', error);
      setAccessClaimed(false);
      setManagedSpotId(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!isOwner) {
      setSpot(null);
      setReservations([]);
      setReviews([]);
      setAccessClaimed(false);
      setManagedSpotId(null);
      setLoading(false);
      return () => undefined;
    }

    void loadDashboard();
    return () => undefined;
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner || !managedSpotId) return () => undefined;

    const unsubscribeSpot = spotService.subscribeToSpotById(
      managedSpotId,
      (nextSpot) => {
        if (nextSpot) setSpot(nextSpot);
      },
      ownerSupabase,
    );
    const unsubscribeReservations = reservationService.subscribeToSpotReservations(
      managedSpotId,
      setReservations,
      ownerSupabase,
    );

    return () => {
      unsubscribeReservations();
      unsubscribeSpot();
    };
  }, [isOwner, managedSpotId, ownerSupabase]);

  function requestSaveReservationSettings() {
    const nextFee = Number(draftFee);
    if (!Number.isFinite(nextFee) || nextFee < 0) {
      Alert.alert('Invalid price', 'Enter a valid reservation amount.');
      return;
    }
    setOwnerConfirmation({ kind: 'publish-settings', reservationFee: nextFee });
  }

  async function postOwnerPhotos() {
    if (!spot || !profile?.id) {
      Alert.alert('Gallery unavailable', 'The venue profile is still loading.');
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Photo access needed', 'Allow photo access to post venue photos.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: 8,
        quality: 0.82,
      });
      if (result.canceled || !result.assets.length) return;

      setUploadingPhotos(true);
      const updatedSpot = await ownerGalleryService.publishPhotos({
        assets: result.assets.map((asset) => ({
          uri: asset.uri,
          fileName: asset.fileName,
          fileSize: asset.fileSize,
          mimeType: asset.mimeType,
        })),
        userId: profile.id,
        spot,
        client: ownerSupabase,
      });
      setSpot(updatedSpot);
      Alert.alert('Photos posted', `${result.assets.length} ${result.assets.length === 1 ? 'photo is' : 'photos are'} now in the spot gallery.`);
    } catch (error: any) {
      Alert.alert('Upload failed', error.message ?? 'The photos could not be posted.');
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function saveReservationSettings(reservationFee: number) {
    if (!managedSpotId) {
      Alert.alert('Owner access unavailable', 'This business account is not assigned to a spot.');
      return;
    }
    try {
      setSavingSettings(true);
      const updatedSpot = await spotService.updateReservationSettings(
        managedSpotId,
        {
          reservationFee,
          tableInventory: normalizeClubTableInventory(draftInventory),
        },
        ownerSupabase,
      );
      setSpot(updatedSpot);
      Alert.alert('Updated', 'Guests will see the latest tables and reservation price in real time.');
    } catch (error: any) {
      Alert.alert('Update failed', error.message ?? 'Please try again.');
    } finally {
      setSavingSettings(false);
    }
  }

  function requestApproveReservation(reservation: Reservation) {
    setOwnerConfirmation({ kind: 'approve-reservation', reservation });
  }

  async function approveReservation(reservation: Reservation) {
    try {
      setApprovingId(reservation.id);
      const approvedReservation = await reservationService.approvePaidReservation(reservation.id, ownerSupabase);
      setReservations((current) =>
        current.map((item) =>
          item.id === reservation.id
            ? approvedReservation ?? {
                ...item,
                status: 'confirmed',
                payment_status: 'paid',
                updated_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      Alert.alert('Reservation approved', 'The guest has been notified in their Activity page.');
    } catch (error: any) {
      Alert.alert('Approval failed', error.message ?? 'Please try again.');
    } finally {
      setApprovingId(null);
    }
  }

  function requestRecordAttendance(reservation: Reservation, status: 'checked_in' | 'no_show') {
    setOwnerConfirmation({
      kind: status === 'checked_in' ? 'mark-arrived' : 'mark-no-show',
      reservation,
    });
  }

  async function recordAttendance(reservation: Reservation, status: 'checked_in' | 'no_show') {
    try {
      setAttendanceUpdatingId(reservation.id);
      const updatedReservation = await reservationService.recordReservationAttendance(
        reservation.id,
        status,
        ownerSupabase,
      );
      setReservations((current) =>
        current.map((item) =>
          item.id === reservation.id
            ? updatedReservation ?? { ...item, status, updated_at: new Date().toISOString() }
            : item,
        ),
      );
      Alert.alert(
        status === 'checked_in' ? 'Guest checked in' : 'Reservation marked no show',
        status === 'checked_in'
          ? 'The guest has been notified and the table remains occupied.'
          : 'The guest has been notified and the table is now available for the next reservation.',
      );
    } catch (error: any) {
      Alert.alert('Attendance update failed', error.message ?? 'Please try again.');
    } finally {
      setAttendanceUpdatingId(null);
    }
  }

  function requestOpenPaymentProof(reservation: Reservation) {
    if (!reservation.payment_proof_url) {
      Alert.alert('No screenshot', 'This reservation does not have an uploaded payment screenshot.');
      return;
    }
    setOwnerConfirmation({ kind: 'view-payment-proof', reservation });
  }

  async function openPaymentProof(reservation: Reservation) {
    if (!reservation.payment_proof_url) {
      Alert.alert('No screenshot', 'This reservation does not have an uploaded payment screenshot.');
      return;
    }

    try {
      const proofUrl = await paymentProofService.getProofUrl(reservation.payment_proof_url, ownerSupabase);
      await Linking.openURL(proofUrl);
      setViewedProofIds((current) => {
        if (current.has(reservation.id)) return current;
        const next = new Set(current);
        next.add(reservation.id);
        return next;
      });
    } catch (error: any) {
      Alert.alert('Unable to open proof', error.message ?? 'Please try again.');
    }
  }

  function closeOwnerConfirmation() {
    setOwnerConfirmation(null);
  }

  function requestExit() {
    setExitConfirmationOpen(true);
  }

  function confirmExit() {
    setExitConfirmationOpen(false);
    router.back();
  }

  function confirmOwnerAction() {
    const confirmation = ownerConfirmation;
    if (!confirmation) return;
    setOwnerConfirmation(null);

    if (confirmation.kind === 'approve-reservation') {
      void approveReservation(confirmation.reservation);
      return;
    }
    if (confirmation.kind === 'mark-arrived') {
      void recordAttendance(confirmation.reservation, 'checked_in');
      return;
    }
    if (confirmation.kind === 'mark-no-show') {
      void recordAttendance(confirmation.reservation, 'no_show');
      return;
    }
    if (confirmation.kind === 'view-payment-proof') {
      void openPaymentProof(confirmation.reservation);
      return;
    }
    void saveReservationSettings(confirmation.reservationFee);
  }

  if (authLoading) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Checking owner session...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!isOwner) {
    return <OwnerLoginGate signedInEmail={profile?.email ?? null} onSignIn={signIn} onSwitchAccount={logOut} />;
  }

  if (loading) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading venue profile...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!managedSpotId || !spot) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          <ShieldCheck size={34} color={colors.primary} />
          <Text style={styles.loadingText}>No venue is assigned to this owner account.</Text>
          <Pressable style={styles.primaryPortalButton} onPress={() => void handleSignOut()}>
            <Text style={styles.primaryPortalButtonText}>Return to login</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const venueName = spot.name;
  const reservationFee = Number(spot?.gcash_amount ?? spot?.reservation_fee ?? 150);
  const dashboardProps: DashboardContentProps = {
    activeTab,
    accessClaimed,
    activeTables,
    approvingId,
    attendanceUpdatingId,
    approvedReservations,
    draftFee,
    onApproveReservation: requestApproveReservation,
    onRecordAttendance: requestRecordAttendance,
    onOpenPaymentProof: requestOpenPaymentProof,
    onPostOwnerPhotos: postOwnerPhotos,
    onRefresh: loadDashboard,
    onSaveReservationSettings: requestSaveReservationSettings,
    paidReservations,
    paidTotal,
    paymentReservations,
    pendingPayments,
    profileEmail: profile?.email ?? 'Owner account',
    rating,
    refreshing,
    reservationFee,
    reservations,
    reviews,
    savingSettings,
    setActiveTab,
    setDraftFee,
    spot,
    tableSummaries,
    tabletLayout,
    totalTables,
    uploadingPhotos,
    venueName,
    viewedProofIds,
  };

  return (
    <View style={styles.portalShell}>
      {tabletLayout ? (
        <View style={styles.tabletLayout}>
          <OwnerSidebar
            activeTab={activeTab}
            profileEmail={profile?.email ?? 'Owner account'}
            venueName={venueName}
            category={spot?.category ?? 'Club'}
            onTabChange={setActiveTab}
            onSignOut={() => setSignOutConfirmationOpen(true)}
          />
          <ScrollView
            style={styles.tabletMain}
            contentContainerStyle={[styles.tabletMainContent, { paddingTop: Math.max(28, insets.top + spacing.sm) }]}
            showsVerticalScrollIndicator={false}
          >
            <PortalHeader
              title={`Good Morning, ${profile?.display_name?.split(' ')[0] || 'Admin'}`}
              subtitle="Venue Performance Overview"
              onBack={requestExit}
              onRefresh={loadDashboard}
              refreshing={refreshing}
            />
            <DashboardContent {...dashboardProps} />
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          style={styles.phoneShell}
          contentContainerStyle={[styles.phoneContent, { paddingTop: Math.max(spacing.md, insets.top + spacing.xs) }]}
          showsVerticalScrollIndicator={false}
        >
          <PortalHeader
            title={`Good Morning, ${profile?.display_name?.split(' ')[0] || 'Admin'}`}
            subtitle={venueName}
            onBack={requestExit}
            onRefresh={loadDashboard}
            refreshing={refreshing}
            compact
          />
          <MobileTabs activeTab={activeTab} onTabChange={setActiveTab} />
          <DashboardContent {...dashboardProps} />
        </ScrollView>
      )}

      <ConfirmationModal
        visible={exitConfirmationOpen}
        title="Exit owner dashboard?"
        message="Are you sure you want to exit the owner dashboard?"
        onRequestClose={() => setExitConfirmationOpen(false)}
        actions={[
          { label: 'Stay here', onPress: () => setExitConfirmationOpen(false) },
          { label: 'Exit', variant: 'destructive', onPress: confirmExit },
        ]}
      />
      <ConfirmationModal
        visible={signOutConfirmationOpen}
        title="Sign out of owner dashboard?"
        message="You can sign in again with the owner account CebSpot gave you."
        onRequestClose={() => setSignOutConfirmationOpen(false)}
        actions={[
          { label: 'Cancel', disabled: signingOut, onPress: () => setSignOutConfirmationOpen(false) },
          {
            label: signingOut ? 'Signing Out...' : 'Sign Out',
            variant: 'destructive',
            disabled: signingOut,
            onPress: () => void handleSignOut(),
          },
        ]}
      />
      <ConfirmationModal
        visible={ownerConfirmation !== null}
        title={getOwnerConfirmationTitle(ownerConfirmation)}
        message={getOwnerConfirmationMessage(ownerConfirmation)}
        onRequestClose={closeOwnerConfirmation}
        actions={[
          { label: 'Cancel', disabled: savingSettings || Boolean(approvingId) || Boolean(attendanceUpdatingId), onPress: closeOwnerConfirmation },
          {
            label: getOwnerConfirmationActionLabel(
              ownerConfirmation,
              savingSettings,
              Boolean(approvingId),
              Boolean(attendanceUpdatingId),
            ),
            variant:
              ownerConfirmation?.kind === 'mark-no-show'
                ? 'destructive'
                : ownerConfirmation?.kind === 'approve-reservation' || ownerConfirmation?.kind === 'mark-arrived'
                  ? 'primary'
                  : 'secondary',
            disabled: savingSettings || Boolean(approvingId) || Boolean(attendanceUpdatingId),
            onPress: confirmOwnerAction,
          },
        ]}
      />
    </View>
  );
}

type DashboardContentProps = {
  activeTab: OwnerTab;
  accessClaimed: boolean | null;
  activeTables: number;
  approvingId: string | null;
  attendanceUpdatingId: string | null;
  approvedReservations: Reservation[];
  draftFee: string;
  onApproveReservation: (reservation: Reservation) => void;
  onRecordAttendance: (reservation: Reservation, status: 'checked_in' | 'no_show') => void;
  onOpenPaymentProof: (reservation: Reservation) => void;
  onPostOwnerPhotos: () => void;
  onRefresh: () => void;
  onSaveReservationSettings: () => void;
  paidReservations: Reservation[];
  paidTotal: number;
  paymentReservations: Reservation[];
  pendingPayments: Reservation[];
  profileEmail: string;
  rating: number;
  refreshing: boolean;
  reservationFee: number;
  reservations: Reservation[];
  reviews: Review[];
  savingSettings: boolean;
  setActiveTab: (tab: OwnerTab) => void;
  setDraftFee: (value: string) => void;
  spot: Spot | null;
  tableSummaries: ReturnType<typeof getTableInventoryTotals>;
  tabletLayout: boolean;
  totalTables: number;
  uploadingPhotos: boolean;
  venueName: string;
  viewedProofIds: Set<string>;
};

function DashboardContent(props: DashboardContentProps) {
  if (props.activeTab === 'Reservations') return <ReservationsView {...props} />;
  if (props.activeTab === 'Payments') return <PaymentsView {...props} />;
  if (props.activeTab === 'Reviews') return <ReviewsView rating={props.rating} reservations={props.reservations} tabletLayout={props.tabletLayout} />;
  if (props.activeTab === 'Tables & Pricing') return <TablesPricingView {...props} />;
  if (props.activeTab === 'Spot Profile') return <SpotProfileView {...props} />;
  return <OverviewView {...props} />;
}

function PortalHeader({
  title,
  subtitle,
  onBack,
  onRefresh,
  refreshing,
  compact,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  compact?: boolean;
}) {
  return (
      <View style={[styles.portalHeader, compact && styles.portalHeaderCompact]}>
      <View style={styles.headerIdentity}>
        <Pressable
          accessibilityLabel="Exit owner dashboard"
          accessibilityRole="button"
          style={[styles.headerExitButton, compact && styles.headerExitButtonCompact]}
          onPress={onBack}
        >
          <LogOut size={compact ? 16 : 18} color={portalColors.ink} />
          <Text style={[styles.headerExitText, compact && styles.headerExitTextCompact]}>Exit</Text>
        </Pressable>
        <View style={[styles.trendIcon, compact && styles.trendIconCompact]}>
          <TrendingUp size={18} color={portalColors.primaryDark} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.portalTitle, compact && styles.portalTitleCompact]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.portalSubtitle, compact && styles.portalSubtitleCompact]} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>
      <View style={[styles.headerActions, compact && styles.headerActionsCompact]}>
        {!compact ? (
          <View style={styles.searchPill}>
            <Search size={16} color={portalColors.muted} />
            <Text style={styles.searchText} numberOfLines={1}>Search reservations or bills...</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityLabel="Owner notifications"
          accessibilityRole="button"
          style={[styles.headerIconButton, compact && styles.headerIconButtonCompact]}
          onPress={onRefresh}
        >
          {refreshing ? <ActivityIndicator size="small" color={portalColors.primary} /> : <Bell size={compact ? 16 : 18} color={portalColors.ink} />}
        </Pressable>
      </View>
    </View>
  );
}

function OwnerSidebar({
  activeTab,
  profileEmail,
  venueName,
  category,
  onTabChange,
  onSignOut,
}: {
  activeTab: OwnerTab;
  profileEmail: string;
  venueName: string;
  category: string;
  onTabChange: (tab: OwnerTab) => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.sidebar}>
      <Text style={styles.sidebarBrand}>CebSpot</Text>
      <View style={styles.sidebarSpot}>
        <Image source={cebspotLogo} resizeMode="contain" style={styles.sidebarLogo} />
        <View style={styles.sidebarSpotCopy}>
          <Text style={styles.sidebarSpotName} numberOfLines={1}>{venueName}</Text>
          <Text style={styles.sidebarSpotMeta}>{category}</Text>
        </View>
      </View>
      <View style={styles.sidebarNav}>
        {ownerTabs.map((tab) => {
          const selected = tab.label === activeTab;
          const Icon = tab.icon;
          return (
            <Pressable
              accessibilityRole="button"
              key={tab.label}
              style={[styles.sidebarNavItem, selected && styles.sidebarNavItemActive]}
              onPress={() => onTabChange(tab.label)}
            >
              <Icon size={19} color={selected ? colors.white : portalColors.sidebarMuted} />
              <Text style={[styles.sidebarNavText, selected && styles.sidebarNavTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.sidebarFooter}>
        <View style={styles.sidebarAccount}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profileEmail.slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={styles.sidebarAccountCopy}>
            <Text style={styles.sidebarEmail} numberOfLines={1}>{profileEmail}</Text>
            <Text style={styles.sidebarRole}>Spot Owner</Text>
          </View>
          <Settings size={16} color={portalColors.sidebarMuted} />
        </View>
        <Pressable accessibilityRole="button" style={styles.sidebarSignOut} onPress={onSignOut}>
          <LogOut size={17} color={portalColors.danger} />
          <Text style={styles.sidebarSignOutText}>Sign Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MobileTabs({ activeTab, onTabChange }: { activeTab: OwnerTab; onTabChange: (tab: OwnerTab) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileTabs}>
      {ownerTabs.map((tab) => {
        const selected = tab.label === activeTab;
        const Icon = tab.icon;
        return (
          <Pressable
            accessibilityRole="button"
            key={tab.label}
            style={[styles.mobileTab, selected && styles.mobileTabActive]}
            onPress={() => onTabChange(tab.label)}
          >
            <Icon size={16} color={selected ? colors.white : portalColors.muted} />
            <Text style={[styles.mobileTabText, selected && styles.mobileTabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function OverviewView(props: DashboardContentProps) {
  const incoming = props.reservations.slice(0, 3);
  const compact = !props.tabletLayout;

  return (
    <View style={styles.viewStack}>
      <View style={[styles.metricDeck, props.tabletLayout && styles.metricDeckTablet]}>
        <PortalMetric icon={WalletCards} iconTone="green" label="Total Revenue" value={formatPeso(props.paidTotal)} delta="+12.5%" compact={compact} />
        <PortalMetric icon={CalendarDays} iconTone="blue" label="Reservations" value={String(props.reservations.length)} delta="+4.2%" compact={compact} />
        <PortalMetric icon={Star} iconTone="orange" label="Verified Rating" value={props.rating.toFixed(1)} delta="+0.1" compact={compact} />
        <PortalMetric icon={Users} iconTone="amber" label="Active Tables" value={`${props.activeTables}/${props.totalTables || 1}`} live compact={compact} />
      </View>

      <View style={[styles.overviewGrid, props.tabletLayout && styles.overviewGridTablet]}>
        <View style={styles.incomingPanel}>
          <View style={[styles.panelHeader, compact && styles.panelHeaderCompact]}>
            <View>
              <View style={styles.inlineTitleRow}>
                <Text style={[styles.panelTitle, compact && styles.panelTitleCompact]}>Incoming Reservations</Text>
                <Text style={styles.newBadge}>New</Text>
              </View>
              <Text style={styles.panelEyebrow}>Next 24 Hours</Text>
            </View>
            <MoreHorizontal size={22} color={portalColors.brown} />
          </View>
          {incoming.length ? (
            <View style={[styles.incomingList, compact && styles.incomingListCompact]}>
              {incoming.map((reservation) => (
                <ReservationRow
                  key={reservation.id}
                  reservation={reservation}
                  approving={props.approvingId === reservation.id}
                  updatingAttendance={props.attendanceUpdatingId === reservation.id}
                  viewedProofIds={props.viewedProofIds}
                  onApprove={() => props.onApproveReservation(reservation)}
                  onRecordAttendance={(status) => props.onRecordAttendance(reservation, status)}
                  onOpenPaymentProof={() => props.onOpenPaymentProof(reservation)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No recent reservations.</Text>
            </View>
          )}
          <Pressable accessibilityRole="button" style={styles.panelFooterButton} onPress={() => props.setActiveTab('Reservations')}>
            <Text style={styles.panelFooterButtonText}>View All Reservations</Text>
          </Pressable>
        </View>

        <View style={styles.sideColumn}>
          <View style={[styles.financePanel, compact && styles.financePanelCompact]}>
            <Text style={[styles.panelTitle, compact && styles.panelTitleCompact]}>Financial Overview</Text>
            {props.paidReservations.length ? (
              <View style={styles.financeRows}>
                <FinanceRow label="Paid Reservations" value={String(props.paidReservations.length)} />
                <FinanceRow label="Confirmed Revenue" value={compactPeso(props.paidTotal)} />
                <FinanceRow label="Reservation Fee" value={formatPeso(props.reservationFee)} />
              </View>
            ) : (
              <Text style={styles.financeEmpty}>No payments recorded.</Text>
            )}
            <Pressable accessibilityRole="button" style={styles.secondaryPortalButton} onPress={() => props.setActiveTab('Payments')}>
              <Text style={styles.secondaryPortalButtonText}>Finance Settings</Text>
            </Pressable>
          </View>

          <View style={[styles.tipPanel, compact && styles.tipPanelCompact]}>
            <Text style={styles.tipEyebrow}>Quick Tip</Text>
            <Text style={[styles.tipTitle, compact && styles.tipTitleCompact]}>Boost reservations by adding weekend happy hour specials.</Text>
            <Text style={styles.tipBody}>Analytics show guests are more likely to book tables when specials are visible.</Text>
            <Pressable accessibilityRole="button" style={styles.tipButton} onPress={() => props.setActiveTab('Spot Profile')}>
              <Text style={styles.tipButtonText}>Edit Profile</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <OwnerAccessPanel accessClaimed={props.accessClaimed} profileEmail={props.profileEmail} />
    </View>
  );
}

function ReservationsView(props: DashboardContentProps) {
  return (
    <View style={styles.viewStack}>
      <SectionIntro
        title="Reservations"
        eyebrow="Live Queue"
        detail={`${props.pendingPayments.length} pending payments, ${props.approvedReservations.length} approved`}
        onRefresh={props.onRefresh}
        refreshing={props.refreshing}
        compact={!props.tabletLayout}
      />
      <View style={styles.listPanel}>
        {props.reservations.length ? (
          props.reservations.map((reservation) => (
            <ReservationRow
              key={reservation.id}
              reservation={reservation}
              expanded
              approving={props.approvingId === reservation.id}
              updatingAttendance={props.attendanceUpdatingId === reservation.id}
              viewedProofIds={props.viewedProofIds}
              onApprove={() => props.onApproveReservation(reservation)}
              onRecordAttendance={(status) => props.onRecordAttendance(reservation, status)}
              onOpenPaymentProof={() => props.onOpenPaymentProof(reservation)}
            />
          ))
        ) : (
          <EmptyPanel title="No Reservations" body="Reservations from guests will appear here." />
        )}
      </View>
    </View>
  );
}

function PaymentsView(props: DashboardContentProps) {
  const compact = !props.tabletLayout;
  return (
    <View style={styles.viewStack}>
      <SectionIntro
        title="Payments"
        eyebrow="GCash Review"
        detail={`${props.paymentReservations.length} payment-linked reservations`}
        onRefresh={props.onRefresh}
        refreshing={props.refreshing}
        compact={compact}
      />
      <View style={styles.paymentSummaryDeck}>
        <PortalMetric icon={WalletCards} iconTone="green" label="Collected" value={formatPeso(props.paidTotal)} compact={compact} />
        <PortalMetric icon={ReceiptText} iconTone="orange" label="Pending Review" value={String(props.pendingPayments.length)} compact={compact} />
      </View>
      <View style={styles.listPanel}>
        {props.paymentReservations.length ? (
          props.paymentReservations.map((reservation) => (
            <PaymentCard
              key={reservation.id}
              reservation={reservation}
              approving={props.approvingId === reservation.id}
              viewedProofIds={props.viewedProofIds}
              onApprove={() => props.onApproveReservation(reservation)}
              onOpenPaymentProof={() => props.onOpenPaymentProof(reservation)}
            />
          ))
        ) : (
          <EmptyPanel title="No Payments Recorded" body="Submitted payment references and screenshots will appear here." />
        )}
      </View>
    </View>
  );
}

function ReviewsView({ rating, reservations, tabletLayout }: { rating: number; reservations: Reservation[]; tabletLayout: boolean }) {
  const compact = !tabletLayout;
  return (
    <View style={styles.viewStack}>
      <SectionIntro title="Reviews" eyebrow="Guest Signal" detail="Verified rating and reservation volume" compact={compact} />
      <View style={styles.reviewGrid}>
        <View style={[styles.reviewScorePanel, compact && styles.reviewScorePanelCompact]}>
          <Star size={compact ? 28 : 36} color={portalColors.primary} />
          <Text style={[styles.reviewScore, compact && styles.reviewScoreCompact]}>{rating.toFixed(1)}</Text>
          <Text style={styles.reviewCopy}>Verified Rating</Text>
        </View>
        <View style={[styles.reviewDetailPanel, compact && styles.reviewDetailPanelCompact]}>
          <Text style={[styles.panelTitle, compact && styles.panelTitleCompact]}>Recent Feedback</Text>
          <Text style={styles.financeEmpty}>
            Reservation activity is live with {reservations.length} records. Full review moderation can plug into this tab next.
          </Text>
        </View>
      </View>
    </View>
  );
}

function TablesPricingView(props: DashboardContentProps) {
  const compact = !props.tabletLayout;
  const clubSlotLabels: Record<TableSlotId, { label: string; time: string }> = {
    sunset: { label: 'Early Night', time: '20:00 - 22:30' },
    prime: { label: 'Prime', time: '23:00 - 01:30' },
    late: { label: 'Late Night', time: '02:00 - 04:00' },
  };
  return (
    <View style={styles.viewStack}>
      <SectionIntro title="Tables & Pricing" eyebrow="Club Floor Plan" detail="The mapped tables publish to guest booking screens." compact={compact} />
      <View style={[styles.tablesPanel, compact && styles.tablesPanelCompact]}>
        <View style={[styles.pricePanel, compact && styles.pricePanelCompact]}>
          <Text style={styles.fieldLabel}>Reservation Price</Text>
          <View style={styles.priceInputRow}>
            <Text style={styles.currencyPrefix}>PHP</Text>
            <TextInput
              value={props.draftFee}
              onChangeText={props.setDraftFee}
              keyboardType="numeric"
              placeholder="150"
              placeholderTextColor={portalColors.muted}
              selectionColor={portalColors.primary}
              style={[styles.priceInput, compact && styles.priceInputCompact]}
            />
          </View>
        </View>
        <View style={styles.tableList}>
          {props.tableSummaries.map((slot) => (
            <View key={slot.slotId} style={[styles.tableRow, compact && styles.tableRowCompact]}>
              <View style={styles.tableCopy}>
                <Text style={[styles.tableTitle, compact && styles.tableTitleCompact]}>{clubSlotLabels[slot.slotId].label}</Text>
                <Text style={styles.tableMeta}>{clubSlotLabels[slot.slotId].time} - {slot.tableCount} mapped tables</Text>
              </View>
              <View style={styles.tableStepper}>
                <Table2 size={20} color={portalColors.primary} />
                <Text style={styles.tableCount}>{slot.tableCount}</Text>
              </View>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          style={[styles.primaryPortalButton, props.savingSettings && styles.disabledButton]}
          disabled={props.savingSettings}
          onPress={props.onSaveReservationSettings}
        >
          <Text style={styles.primaryPortalButtonText}>{props.savingSettings ? 'Publishing...' : 'Publish Price & Floor Plan'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SpotProfileView(props: DashboardContentProps) {
  const spot = props.spot;
  const compact = !props.tabletLayout;
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>('all');
  const galleryItems = useMemo(() => buildOwnerGallery(spot, props.reviews), [props.reviews, spot]);
  const previewItems = galleryItems.slice(0, compact ? 4 : 6);
  const visibleGalleryItems = useMemo(() => {
    if (galleryFilter === 'owner') return galleryItems.filter((item) => item.source === 'owner');
    if (galleryFilter === 'latest') {
      return [...galleryItems].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    }
    return galleryItems;
  }, [galleryFilter, galleryItems]);

  return (
    <View style={styles.viewStack}>
      <SectionIntro title="Spot Profile" eyebrow="Venue Details" detail={spot?.address ?? 'Barangay Apas, Cebu City'} compact={compact} />
      <View style={[styles.profileSummary, compact && styles.profileSummaryCompact]}>
        <View style={[styles.profileLogoLarge, compact && styles.profileLogoLargeCompact]}>
          <Image source={cebspotLogo} resizeMode="contain" style={[styles.profileLogoImage, compact && styles.profileLogoImageCompact]} />
        </View>
        <View style={styles.profileHeroCopy}>
          <Text style={[styles.profileVenueName, compact && styles.profileVenueNameCompact]} numberOfLines={2}>{props.venueName}</Text>
          <Text style={styles.profileVenueMeta}>{spot?.category ?? 'Club'}</Text>
        </View>
      </View>
      <View style={styles.profileGrid}>
        <ProfileInfo icon={MapPin} label="Address" value={spot?.address ?? 'Barangay Apas, Cebu City'} />
        <ProfileInfo icon={Phone} label="Phone" value={spot?.contact_number ?? 'Not set'} />
        <ProfileInfo icon={Mail} label="Website" value={spot?.website_url ?? 'Not set'} />
        <ProfileInfo
          icon={WalletCards}
          label="GCash"
          value={`${spot?.gcash_wallet_name ?? props.venueName} - ${spot?.gcash_wallet_number ?? '0917 555 0198'}`}
        />
      </View>
      <View style={[styles.ownerGalleryPanel, compact && styles.ownerGalleryPanelCompact]}>
        <View style={[styles.ownerGalleryHeader, compact && styles.ownerGalleryHeaderCompact]}>
          <View style={styles.ownerGalleryHeading}>
            <Text style={[styles.panelTitle, compact && styles.panelTitleCompact]}>Gallery</Text>
            <Text style={styles.ownerGalleryCount}>
              {galleryItems.length} {galleryItems.length === 1 ? 'photo' : 'photos'} · Owner photos appear first
            </Text>
          </View>
          <View style={styles.ownerGalleryActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post photos of this spot"
              disabled={props.uploadingPhotos || !spot}
              onPress={props.onPostOwnerPhotos}
              style={[styles.galleryUploadButton, (props.uploadingPhotos || !spot) && styles.disabledButton]}
            >
              {props.uploadingPhotos ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Plus size={16} color={colors.white} />
              )}
              <Text style={styles.galleryUploadButtonText}>{props.uploadingPhotos ? 'Posting...' : 'Post photos'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={galleryExpanded ? 'Close full gallery' : 'See all gallery photos'}
              disabled={!galleryItems.length}
              onPress={() => setGalleryExpanded((current) => !current)}
              style={[styles.gallerySeeAllButton, !galleryItems.length && styles.disabledButton]}
            >
              <Text style={styles.gallerySeeAllText}>{galleryExpanded ? 'Close' : 'See all'}</Text>
            </Pressable>
          </View>
        </View>

        {previewItems.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.ownerGalleryPreview}
          >
            {previewItems.map((item, index) => (
              <View key={item.id} style={[styles.ownerGalleryPreviewTile, compact && styles.ownerGalleryPreviewTileCompact]}>
                <Image source={{ uri: item.url }} resizeMode="cover" style={styles.ownerGalleryImage} />
                <View style={styles.ownerGalleryBadge}>
                  <Text style={styles.ownerGalleryBadgeText}>
                    {item.source === 'owner' ? (index === 0 ? 'Main · Owner' : 'Owner') : 'Community'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.ownerGalleryEmpty}>
            <ImagesIcon size={28} color={portalColors.primary} />
            <Text style={styles.ownerGalleryEmptyTitle}>Show guests what makes this spot special</Text>
            <Text style={styles.ownerGalleryEmptyText}>Post clear venue photos from the owner dashboard.</Text>
          </View>
        )}

        {galleryExpanded ? (
          <View style={styles.ownerGalleryExpanded}>
            <View style={styles.galleryFilterRow}>
              {galleryFilters.map((filter) => {
                const selected = filter.value === galleryFilter;
                const Icon = filter.icon;
                return (
                  <Pressable
                    key={filter.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setGalleryFilter(filter.value)}
                    style={[styles.galleryFilterButton, selected && styles.galleryFilterButtonActive]}
                  >
                    <Icon size={15} color={selected ? colors.white : portalColors.brown} />
                    <Text style={[styles.galleryFilterText, selected && styles.galleryFilterTextActive]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.ownerGalleryGrid}>
              {visibleGalleryItems.map((item) => (
                <View
                  key={`full-${item.id}`}
                  style={[styles.ownerGalleryGridTile, compact && styles.ownerGalleryGridTileCompact]}
                >
                  <Image source={{ uri: item.url }} resizeMode="cover" style={styles.ownerGalleryImage} />
                  <View style={styles.ownerGalleryBadge}>
                    <Text style={styles.ownerGalleryBadgeText}>{item.source === 'owner' ? 'By owner' : 'Community'}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function PortalMetric({
  icon: Icon,
  iconTone,
  label,
  value,
  delta,
  live,
  compact,
}: {
  icon: PortalIcon;
  iconTone: 'green' | 'blue' | 'orange' | 'amber';
  label: string;
  value: string;
  delta?: string;
  live?: boolean;
  compact?: boolean;
}) {
  const tone = metricTones[iconTone];
  return (
    <View style={[styles.metricCard, compact && styles.metricCardCompact]}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIcon, compact && styles.metricIconCompact, { backgroundColor: tone.background }]}>
          <Icon size={compact ? 20 : 24} color={tone.foreground} />
        </View>
        {delta ? <Text style={styles.deltaBadge}>{delta}</Text> : null}
        {live ? <Text style={styles.liveBadge}>Live</Text> : null}
      </View>
      <View>
        <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.metricValue, compact && styles.metricValueCompact]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function ReservationRow({
  reservation,
  approving,
  updatingAttendance,
  expanded,
  viewedProofIds,
  onApprove,
  onRecordAttendance,
  onOpenPaymentProof,
}: {
  reservation: Reservation;
  approving: boolean;
  updatingAttendance: boolean;
  expanded?: boolean;
  viewedProofIds: Set<string>;
  onApprove: () => void;
  onRecordAttendance: (status: 'checked_in' | 'no_show') => void;
  onOpenPaymentProof: () => void;
}) {
  const isPaymongoReservationRecord = isPaymongoReservation(reservation);
  const canApprove = canManuallyApproveReservation(reservation);
  const gateReason = getApprovalGateReason(reservation, viewedProofIds);
  const canUpdateAttendance = canRecordAttendance(reservation);
  const isNoShow = reservation.status === 'no_show';
  const guestName = getReservationGuestName(reservation);
  const initials = guestName.slice(0, 2).toUpperCase();

  return (
    <View style={styles.reservationRow}>
      <View style={styles.reservationTop}>
        <View style={styles.reservationAvatar}>
          <Text style={styles.reservationAvatarText}>{initials}</Text>
        </View>
        <View style={styles.reservationCopy}>
          <Text style={styles.reservationName} numberOfLines={1}>{guestName}</Text>
          <Text style={styles.reservationMeta} numberOfLines={1}>
            {reservation.spot_name} - {formatReservationDateTime(reservation)} - {formatGuestCount(reservation.guest_count ?? reservation.guests)}
            {reservation.table_id ? ` - ${clubTableDisplayName(reservation.table_id)}` : ''}
          </Text>
        </View>
        <Text
          style={[
            styles.statusBadge,
            canApprove ? styles.pendingStatusBadge : isNoShow ? styles.noShowStatusBadge : styles.approvedStatusBadge,
          ]}
        >
          {canApprove ? 'Pending' : getReservationStatusLabel(reservation.status)}
        </Text>
      </View>
      {expanded ? (
        <View style={styles.reservationDetails}>
          <Detail label="Guest" value={guestName} />
          <Detail label="Guest Email" value={reservation.guest_email || 'Not provided'} />
          <Detail label="Guest Phone" value={reservation.guest_phone || reservation.payer_gcash_number || 'Not provided'} />
          <Detail label="Table" value={reservation.table_id ? clubTableDisplayName(reservation.table_id) : 'Not provided'} />
          <Detail label="Deposit Terms" value={reservation.payment_terms_accepted ? 'Accepted' : 'Not recorded'} />
          <Detail label="Booking ID" value={getReservationBookingId(reservation)} />
          <Detail label="Unique ID" value={getReservationUniqueId(reservation)} />
          <Detail label="Reservation" value={getReservationStatusLabel(reservation.status)} />
          <Detail label="Payment" value={getPaymentStatusLabel(reservation.payment_status)} />
          <Detail label="Amount" value={formatPeso(Number(reservation.reservation_fee || reservation.fee || 0))} />
          <Detail label={isPaymongoReservationRecord ? 'PayMongo Reference' : 'Payment Reference'} value={reservation.payment_reference || 'Not provided'} />
          {isPaymongoReservationRecord ? <Detail label="Gateway" value={getPaymongoMethodLabel(reservation)} /> : null}
        </View>
      ) : null}
      <View style={styles.rowActions}>
        <Pressable
          accessibilityRole="button"
          style={[styles.proofButton, (!reservation.payment_proof_url || isPaymongoReservationRecord) && styles.disabledButton]}
          onPress={onOpenPaymentProof}
          disabled={!reservation.payment_proof_url || isPaymongoReservationRecord}
        >
          <ReceiptText size={15} color={reservation.payment_proof_url && !isPaymongoReservationRecord ? portalColors.primary : portalColors.muted} />
          <Text style={[styles.proofButtonText, (!reservation.payment_proof_url || isPaymongoReservationRecord) && styles.mutedButtonText]}>
            {isPaymongoReservationRecord ? 'Gateway' : 'Proof'}
          </Text>
        </Pressable>
        {canApprove ? (
          <Pressable
            accessibilityRole="button"
            style={[styles.acceptButton, (approving || Boolean(gateReason)) && styles.disabledButton]}
            onPress={onApprove}
            disabled={approving || Boolean(gateReason)}
          >
            <CheckCircle2 size={15} color={colors.white} />
            <Text style={styles.acceptButtonText}>{approving ? 'Approving...' : gateReason ?? 'Accept'}</Text>
          </Pressable>
        ) : null}
        {canUpdateAttendance ? (
          <>
            <Pressable
              accessibilityRole="button"
              style={[styles.arrivedButton, updatingAttendance && styles.disabledButton]}
              onPress={() => onRecordAttendance('checked_in')}
              disabled={updatingAttendance}
            >
              <CheckCircle2 size={15} color={colors.white} />
              <Text style={styles.arrivedButtonText}>{updatingAttendance ? 'Updating...' : 'Guest Arrived'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.noShowButton, updatingAttendance && styles.disabledButton]}
              onPress={() => onRecordAttendance('no_show')}
              disabled={updatingAttendance}
            >
              <TriangleAlert size={15} color={portalColors.danger} />
              <Text style={styles.noShowButtonText}>No Show</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

function PaymentCard({
  reservation,
  approving,
  viewedProofIds,
  onApprove,
  onOpenPaymentProof,
}: {
  reservation: Reservation;
  approving: boolean;
  viewedProofIds: Set<string>;
  onApprove: () => void;
  onOpenPaymentProof: () => void;
}) {
  const isPaymongoReservationRecord = isPaymongoReservation(reservation);
  const canApprove = canManuallyApproveReservation(reservation);
  const gateReason = getApprovalGateReason(reservation, viewedProofIds);
  const guestName = getReservationGuestName(reservation);
  return (
    <View style={styles.paymentCard}>
      <View style={styles.paymentCardTop}>
        <View style={styles.paymentCardCopy}>
          <Text style={styles.paymentCardTitle} numberOfLines={1}>{guestName}</Text>
          <Text style={styles.paymentCardMeta} numberOfLines={1}>{reservation.spot_name} - {formatReservationDateTime(reservation)}</Text>
        </View>
        <Text style={[styles.statusBadge, canApprove ? styles.pendingStatusBadge : styles.approvedStatusBadge]}>
          {getPaymentStatusLabel(reservation.payment_status)}
        </Text>
      </View>
      <View style={styles.reservationDetails}>
        <Detail label="Guest" value={guestName} />
        <Detail label="Guest Email" value={reservation.guest_email || 'Not provided'} />
        <Detail label="Amount" value={formatPeso(Number(reservation.reservation_fee || reservation.fee || 0))} />
        <Detail label={isPaymongoReservationRecord ? 'PayMongo Reference' : 'Payment Reference'} value={reservation.payment_reference || 'Not provided'} />
        <Detail label="Method" value={isPaymongoReservationRecord ? getPaymongoMethodLabel(reservation) : 'Manual GCash'} />
        <Detail label="Payer GCash" value={isPaymongoReservationRecord ? 'Handled by PayMongo' : reservation.payer_gcash_number || 'Not provided'} />
        <Detail label="Screenshot" value={isPaymongoReservationRecord ? 'Not required' : reservation.payment_proof_url ? 'Uploaded' : 'Missing'} />
      </View>
      <View style={styles.rowActions}>
        <Pressable
          accessibilityRole="button"
          style={[styles.proofButton, (!reservation.payment_proof_url || isPaymongoReservationRecord) && styles.disabledButton]}
          onPress={onOpenPaymentProof}
          disabled={!reservation.payment_proof_url || isPaymongoReservationRecord}
        >
          <ReceiptText size={15} color={reservation.payment_proof_url && !isPaymongoReservationRecord ? portalColors.primary : portalColors.muted} />
          <Text style={[styles.proofButtonText, (!reservation.payment_proof_url || isPaymongoReservationRecord) && styles.mutedButtonText]}>
            {isPaymongoReservationRecord ? 'Automated Checkout' : 'View Screenshot'}
          </Text>
        </Pressable>
        {canApprove ? (
          <Pressable
            accessibilityRole="button"
            style={[styles.acceptButton, (approving || Boolean(gateReason)) && styles.disabledButton]}
            onPress={onApprove}
            disabled={approving || Boolean(gateReason)}
          >
            <CheckCircle2 size={15} color={colors.white} />
            <Text style={styles.acceptButtonText}>{approving ? 'Approving...' : gateReason ?? 'Approve'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function OwnerAccessPanel({ accessClaimed, profileEmail }: { accessClaimed: boolean | null; profileEmail: string }) {
  return (
    <View style={styles.accessPanel}>
      <ShieldCheck size={20} color={accessClaimed ? portalColors.success : portalColors.primary} />
      <View style={styles.accessCopy}>
        <Text style={styles.accessTitle}>{accessClaimed ? 'Owner Access Ready' : 'Owner Account Required'}</Text>
        <Text style={styles.accessText}>
          {accessClaimed
            ? 'This account can read and approve reservations for the active venue.'
            : `This owner account is not assigned to a venue. Current session: ${profileEmail}`}
        </Text>
      </View>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function FinanceRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.financeRow}>
      <Text style={styles.financeLabel}>{label}</Text>
      <Text style={styles.financeValue}>{value}</Text>
    </View>
  );
}

function SectionIntro({
  title,
  eyebrow,
  detail,
  onRefresh,
  refreshing,
  compact,
}: {
  title: string;
  eyebrow: string;
  detail: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={styles.sectionIntro}>
      <View style={styles.sectionIntroCopy}>
        <Text style={styles.panelEyebrow}>{eyebrow}</Text>
        <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>{title}</Text>
        <Text style={styles.sectionDetail}>{detail}</Text>
      </View>
      {onRefresh ? (
        <Pressable accessibilityRole="button" style={[styles.headerIconButton, compact && styles.headerIconButtonCompact]} onPress={onRefresh}>
          {refreshing ? <ActivityIndicator size="small" color={portalColors.primary} /> : <RefreshCw size={18} color={portalColors.ink} />}
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyPanel}>
      <ReceiptText size={28} color={portalColors.primary} />
      <Text style={styles.emptyPanelTitle}>{title}</Text>
      <Text style={styles.emptyPanelBody}>{body}</Text>
    </View>
  );
}

function ProfileInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: PortalIcon;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.profileInfo}>
      <Icon size={18} color={portalColors.primary} />
      <View style={styles.profileInfoCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function OwnerLoginGate({
  signedInEmail,
  onSignIn,
  onSwitchAccount,
}: {
  signedInEmail: string | null;
  onSignIn: (email: string, password: string) => Promise<UserProfile>;
  onSwitchAccount: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const hasWrongAccount = Boolean(signedInEmail);

  async function switchAccount() {
    try {
      setSwitching(true);
      await onSwitchAccount();
    } catch (error: any) {
      Alert.alert('Switch failed', error.message ?? 'Please try again.');
    } finally {
      setSwitching(false);
    }
  }

  async function submit() {
    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail || !password) {
      Alert.alert('Missing details', 'Enter the owner email and password.');
      return;
    }
    try {
      setSubmitting(true);
      const signedInProfile = await onSignIn(normalizedEmail, password);
      if (!hasOwnerAccess(signedInProfile)) {
        throw new Error('This is a regular CebSpot user account. Use the dedicated business email created after verification.');
      }
    } catch (error: any) {
      Alert.alert('Owner login failed', error.message ?? 'Please check the owner credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.loginShell} contentContainerStyle={styles.loginShellContent}>
      <View style={styles.loginCard}>
        <View style={styles.loginIcon}>
          <Store size={32} color={portalColors.primary} />
        </View>
        <Text style={styles.loginTitle}>CebSpot Owner</Text>
        <Text style={styles.loginCopy}>Use the dedicated business account CebSpot created after verification</Text>
        {hasWrongAccount ? (
          <>
            <View style={styles.gateNotice}>
              <TriangleAlert size={18} color={colors.danger} />
              <Text style={styles.gateNoticeText}>{signedInEmail} is signed in, but it does not have owner access.</Text>
            </View>
            <Pressable disabled={switching} onPress={switchAccount} style={styles.primaryPortalButton}>
              <Text style={styles.primaryPortalButtonText}>{switching ? 'Switching...' : 'Switch Account'}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.loginField}>
              <Text style={styles.loginLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="owner@example.com"
                placeholderTextColor={portalColors.muted}
                selectionColor={portalColors.primary}
                style={styles.loginInput}
              />
            </View>
            <View style={styles.loginField}>
              <Text style={styles.loginLabel}>Password</Text>
              <PasswordInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter owner password"
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                style={styles.loginPasswordText}
              />
            </View>
            <Pressable disabled={submitting} onPress={submit} style={[styles.primaryPortalButton, submitting && styles.disabledButton]}>
              <Text style={styles.primaryPortalButtonText}>{submitting ? 'Signing In...' : 'Sign In'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const portalColors = {
  background: '#F8FAFB',
  ink: '#07111F',
  muted: '#8A94AA',
  brown: '#574235',
  primary: '#F57C00',
  primaryDark: '#964900',
  sidebar: '#050505',
  sidebarCard: '#101010',
  sidebarMuted: '#9CA3AF',
  success: '#16A34A',
  successSoft: '#EAFBF0',
  blue: '#2563EB',
  blueSoft: '#EAF2FF',
  orangeSoft: '#FFF4E8',
  danger: '#EF4444',
  line: '#EEF1F4',
  surface: '#FFFFFF',
  surfaceLow: '#F2F4F5',
};

const metricTones = {
  green: { background: portalColors.successSoft, foreground: '#00A86B' },
  blue: { background: portalColors.blueSoft, foreground: portalColors.blue },
  orange: { background: portalColors.orangeSoft, foreground: portalColors.primary },
  amber: { background: '#FFF7ED', foreground: portalColors.primaryDark },
};

const styles = StyleSheet.create({
  portalShell: {
    flex: 1,
    backgroundColor: portalColors.background,
  },
  tabletLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  tabletMain: {
    flex: 1,
  },
  tabletMainContent: {
    paddingHorizontal: 42,
    paddingTop: 28,
    paddingBottom: 44,
  },
  phoneShell: {
    flex: 1,
  },
  phoneContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: portalColors.muted,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  sidebar: {
    width: 288,
    backgroundColor: portalColors.sidebar,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  sidebarBrand: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginBottom: spacing.xxl,
  },
  sidebarSpot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  sidebarLogo: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  sidebarSpotCopy: {
    flex: 1,
    minWidth: 0,
  },
  sidebarSpotName: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  sidebarSpotMeta: {
    color: portalColors.sidebarMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  sidebarNav: {
    gap: spacing.md,
  },
  sidebarNavItem: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sidebarNavItemActive: {
    backgroundColor: portalColors.primary,
  },
  sidebarNavText: {
    color: portalColors.sidebarMuted,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  sidebarNavTextActive: {
    color: colors.white,
    fontWeight: '900',
  },
  sidebarFooter: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  sidebarAccount: {
    minHeight: 64,
    borderRadius: radius.xl,
    backgroundColor: portalColors.sidebarCard,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#243447',
  },
  avatarText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  sidebarAccountCopy: {
    flex: 1,
    minWidth: 0,
  },
  sidebarEmail: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  sidebarRole: {
    color: portalColors.sidebarMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  sidebarSignOut: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sidebarSignOutText: {
    color: portalColors.danger,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  portalHeader: {
    minHeight: 72,
    borderBottomWidth: 1,
    borderBottomColor: portalColors.line,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  portalHeaderCompact: {
    minHeight: 48,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerIdentity: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: portalColors.line,
    ...shadow.card,
    shadowOpacity: 0.04,
    elevation: 2,
  },
  headerIconButtonCompact: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
  },
  headerExitButton: {
    minWidth: 72,
    height: 48,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: portalColors.line,
    ...shadow.card,
    shadowOpacity: 0.04,
    elevation: 2,
  },
  headerExitButtonCompact: {
    minWidth: 58,
    height: 38,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  headerExitText: {
    color: portalColors.ink,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  headerExitTextCompact: {
    fontSize: 10,
  },
  trendIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: portalColors.orangeSoft,
  },
  trendIconCompact: {
    display: 'none',
  },
  portalTitle: {
    color: portalColors.ink,
    fontSize: fontSize.xxl,
    lineHeight: 30,
    fontWeight: '900',
  },
  portalTitleCompact: {
    fontSize: fontSize.md,
    lineHeight: 20,
  },
  portalSubtitle: {
    color: portalColors.muted,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  portalSubtitleCompact: {
    fontSize: 10,
    letterSpacing: 1.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    flexShrink: 0,
  },
  headerActionsCompact: {
    gap: spacing.sm,
  },
  searchPill: {
    width: 320,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: portalColors.surfaceLow,
    borderWidth: 1,
    borderColor: portalColors.line,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  searchText: {
    flex: 1,
    color: portalColors.muted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  mobileTabs: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  mobileTab: {
    minHeight: 38,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: portalColors.line,
  },
  mobileTabActive: {
    backgroundColor: portalColors.primary,
    borderColor: portalColors.primary,
  },
  mobileTabText: {
    color: portalColors.muted,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  mobileTabTextActive: {
    color: colors.white,
  },
  viewStack: {
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  metricDeck: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricDeckTablet: {
    flexWrap: 'nowrap',
  },
  metricCard: {
    flex: 1,
    minHeight: 150,
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    padding: spacing.xxl,
    justifyContent: 'space-between',
    ...shadow.card,
    shadowOpacity: 0.05,
  },
  metricCardCompact: {
    flex: 0,
    width: '48%',
    minHeight: 108,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metricIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconCompact: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
  },
  metricLabel: {
    color: portalColors.brown,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: portalColors.ink,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  metricValueCompact: {
    fontSize: 20,
    lineHeight: 25,
    marginTop: spacing.xs,
  },
  deltaBadge: {
    color: portalColors.success,
    backgroundColor: portalColors.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: '900',
  },
  liveBadge: {
    color: portalColors.ink,
    backgroundColor: portalColors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    fontSize: 10,
    fontWeight: '900',
  },
  overviewGrid: {
    gap: spacing.lg,
  },
  overviewGridTablet: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  incomingPanel: {
    flex: 2.1,
    minHeight: 390,
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...shadow.card,
    shadowOpacity: 0.04,
  },
  panelHeader: {
    padding: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  panelHeaderCompact: {
    padding: spacing.lg,
  },
  inlineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  panelTitle: {
    color: portalColors.ink,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  panelTitleCompact: {
    fontSize: fontSize.md,
  },
  panelEyebrow: {
    color: portalColors.brown,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  newBadge: {
    color: colors.white,
    backgroundColor: portalColors.primaryDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  incomingList: {
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  incomingListCompact: {
    paddingHorizontal: spacing.lg,
  },
  emptyState: {
    flex: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    color: portalColors.muted,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  panelFooterButton: {
    marginTop: 'auto',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: portalColors.background,
    borderTopWidth: 1,
    borderTopColor: portalColors.line,
  },
  panelFooterButtonText: {
    color: portalColors.brown,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sideColumn: {
    flex: 1,
    gap: spacing.lg,
  },
  financePanel: {
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    padding: spacing.xxl,
    gap: spacing.lg,
    ...shadow.card,
    shadowOpacity: 0.04,
  },
  financePanelCompact: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  financeEmpty: {
    color: portalColors.muted,
    fontSize: fontSize.md,
    lineHeight: 21,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  financeRows: {
    gap: spacing.md,
  },
  financeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  financeLabel: {
    color: portalColors.muted,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  financeValue: {
    color: portalColors.ink,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  secondaryPortalButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: portalColors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryPortalButtonText: {
    color: portalColors.brown,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  tipPanel: {
    borderRadius: radius.xxl,
    backgroundColor: portalColors.primaryDark,
    padding: spacing.xxl,
    gap: spacing.md,
    overflow: 'hidden',
  },
  tipPanelCompact: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  tipEyebrow: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  tipTitle: {
    color: colors.white,
    fontSize: fontSize.xl,
    lineHeight: 25,
    fontWeight: '900',
  },
  tipTitleCompact: {
    fontSize: fontSize.md,
    lineHeight: 20,
  },
  tipBody: {
    color: colors.white,
    opacity: 0.9,
    fontSize: fontSize.md,
    lineHeight: 21,
    fontWeight: '700',
  },
  tipButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    minHeight: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipButtonText: {
    color: portalColors.primaryDark,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  accessPanel: {
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: portalColors.line,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  accessCopy: {
    flex: 1,
    minWidth: 0,
  },
  accessTitle: {
    color: portalColors.ink,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  accessText: {
    color: portalColors.muted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  sectionIntro: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg,
  },
  sectionIntroCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: portalColors.ink,
    fontSize: fontSize.xxl,
    lineHeight: 31,
    fontWeight: '900',
  },
  sectionTitleCompact: {
    fontSize: fontSize.lg,
    lineHeight: 24,
  },
  sectionDetail: {
    color: portalColors.muted,
    fontSize: fontSize.md,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  listPanel: {
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow.card,
    shadowOpacity: 0.04,
  },
  reservationRow: {
    borderRadius: radius.xl,
    backgroundColor: portalColors.background,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: portalColors.line,
  },
  reservationTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reservationAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: portalColors.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reservationAvatarText: {
    color: portalColors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  reservationCopy: {
    flex: 1,
    minWidth: 0,
  },
  reservationName: {
    color: portalColors.ink,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  reservationMeta: {
    color: portalColors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pendingStatusBadge: {
    color: portalColors.primary,
    backgroundColor: portalColors.orangeSoft,
  },
  approvedStatusBadge: {
    color: portalColors.success,
    backgroundColor: portalColors.successSoft,
  },
  noShowStatusBadge: {
    color: portalColors.danger,
    backgroundColor: '#fff1f2',
  },
  reservationDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  detailItem: {
    minWidth: 132,
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: radius.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    gap: 3,
  },
  detailLabel: {
    color: portalColors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: portalColors.ink,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '900',
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  proofButton: {
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: portalColors.line,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  proofButtonText: {
    color: portalColors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  mutedButtonText: {
    color: portalColors.muted,
  },
  acceptButton: {
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: portalColors.success,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  acceptButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  arrivedButton: {
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: portalColors.success,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  arrivedButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  noShowButton: {
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  noShowButtonText: {
    color: portalColors.danger,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  paymentSummaryDeck: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  paymentCard: {
    borderRadius: radius.xl,
    backgroundColor: portalColors.background,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: portalColors.line,
  },
  paymentCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  paymentCardCopy: {
    flex: 1,
    minWidth: 0,
  },
  paymentCardTitle: {
    color: portalColors.ink,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  paymentCardMeta: {
    color: portalColors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  reviewGrid: {
    gap: spacing.lg,
  },
  reviewScorePanel: {
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.card,
    shadowOpacity: 0.04,
  },
  reviewScorePanelCompact: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  reviewScore: {
    color: portalColors.ink,
    fontSize: 56,
    lineHeight: 62,
    fontWeight: '900',
  },
  reviewScoreCompact: {
    fontSize: 40,
    lineHeight: 46,
  },
  reviewCopy: {
    color: portalColors.muted,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  reviewDetailPanel: {
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    padding: spacing.xxl,
    gap: spacing.md,
    ...shadow.card,
    shadowOpacity: 0.04,
  },
  reviewDetailPanelCompact: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  tablesPanel: {
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    padding: spacing.xxl,
    gap: spacing.xl,
    ...shadow.card,
    shadowOpacity: 0.04,
  },
  tablesPanelCompact: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    gap: spacing.lg,
  },
  pricePanel: {
    minHeight: 132,
    borderRadius: radius.xxl,
    backgroundColor: portalColors.background,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  pricePanelCompact: {
    minHeight: 100,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  fieldLabel: {
    color: portalColors.brown,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  priceInputRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  currencyPrefix: {
    color: portalColors.primary,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  priceInput: {
    flex: 1,
    color: portalColors.ink,
    fontSize: 28,
    fontWeight: '900',
    paddingVertical: spacing.xs,
  },
  priceInputCompact: {
    fontSize: 22,
  },
  tableList: {
    gap: spacing.md,
  },
  tableRow: {
    minHeight: 92,
    borderRadius: radius.xl,
    backgroundColor: portalColors.background,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tableRowCompact: {
    minHeight: 76,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  tableCopy: {
    flex: 1,
    minWidth: 0,
  },
  tableTitle: {
    color: portalColors.ink,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  tableTitleCompact: {
    fontSize: fontSize.md,
  },
  tableMeta: {
    color: portalColors.brown,
    fontSize: fontSize.sm,
    fontWeight: '800',
    marginTop: 3,
  },
  tableStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: portalColors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCount: {
    minWidth: 24,
    textAlign: 'center',
    color: portalColors.ink,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  primaryPortalButton: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: portalColors.primary,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPortalButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  disabledButton: {
    opacity: 0.6,
  },
  profileSummary: {
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  profileSummaryCompact: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  profileLogoLarge: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileLogoLargeCompact: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
  },
  profileLogoImage: {
    width: 78,
    height: 78,
  },
  profileLogoImageCompact: {
    width: 50,
    height: 50,
  },
  profileHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileVenueName: {
    color: portalColors.ink,
    fontSize: fontSize.xxl,
    lineHeight: 30,
    fontWeight: '900',
  },
  profileVenueNameCompact: {
    fontSize: fontSize.lg,
    lineHeight: 22,
  },
  profileVenueMeta: {
    color: portalColors.muted,
    fontSize: fontSize.md,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  profileGrid: {
    gap: spacing.md,
  },
  profileInfo: {
    minHeight: 68,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: portalColors.line,
  },
  profileInfoCopy: {
    flex: 1,
    minWidth: 0,
  },
  ownerGalleryPanel: {
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    padding: spacing.xxl,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: portalColors.line,
    ...shadow.card,
    shadowOpacity: 0.04,
  },
  ownerGalleryPanelCompact: {
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  ownerGalleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  ownerGalleryHeaderCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: spacing.md,
  },
  ownerGalleryHeading: {
    flex: 1,
    minWidth: 0,
  },
  ownerGalleryCount: {
    color: portalColors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  ownerGalleryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  galleryUploadButton: {
    minHeight: 42,
    borderRadius: radius.lg,
    backgroundColor: portalColors.primary,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  galleryUploadButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  gallerySeeAllButton: {
    minHeight: 42,
    borderRadius: radius.lg,
    backgroundColor: portalColors.surfaceLow,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: portalColors.line,
  },
  gallerySeeAllText: {
    color: portalColors.brown,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  ownerGalleryPreview: {
    gap: spacing.md,
    paddingRight: spacing.md,
  },
  ownerGalleryPreviewTile: {
    width: 220,
    height: 150,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: portalColors.surfaceLow,
  },
  ownerGalleryPreviewTileCompact: {
    width: 168,
    height: 118,
    borderRadius: radius.lg,
  },
  ownerGalleryImage: {
    width: '100%',
    height: '100%',
  },
  ownerGalleryBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(5, 5, 5, 0.78)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  ownerGalleryBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  ownerGalleryEmpty: {
    minHeight: 150,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xl,
    backgroundColor: portalColors.surfaceLow,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: portalColors.line,
  },
  ownerGalleryEmptyTitle: {
    color: portalColors.ink,
    fontSize: fontSize.md,
    fontWeight: '900',
    textAlign: 'center',
  },
  ownerGalleryEmptyText: {
    color: portalColors.muted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  ownerGalleryExpanded: {
    gap: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: portalColors.line,
  },
  galleryFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  galleryFilterButton: {
    minHeight: 40,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: portalColors.surfaceLow,
    borderWidth: 1,
    borderColor: portalColors.line,
  },
  galleryFilterButtonActive: {
    backgroundColor: portalColors.primary,
    borderColor: portalColors.primary,
  },
  galleryFilterText: {
    color: portalColors.brown,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  galleryFilterTextActive: {
    color: colors.white,
  },
  ownerGalleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  ownerGalleryGridTile: {
    width: '31.5%',
    minWidth: 190,
    aspectRatio: 1.35,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: portalColors.surfaceLow,
  },
  ownerGalleryGridTileCompact: {
    width: '47.5%',
    minWidth: 0,
    borderRadius: radius.lg,
  },
  emptyPanel: {
    minHeight: 180,
    borderRadius: radius.xl,
    backgroundColor: portalColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyPanelTitle: {
    color: portalColors.ink,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  emptyPanelBody: {
    color: portalColors.muted,
    textAlign: 'center',
    fontSize: fontSize.md,
    lineHeight: 21,
    fontWeight: '700',
  },
  loginShell: {
    flex: 1,
    backgroundColor: '#0E1113',
  },
  loginShellContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'stretch',
    ...shadow.lifted,
  },
  loginIcon: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    backgroundColor: portalColors.orangeSoft,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginTitle: {
    color: portalColors.ink,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  loginCopy: {
    color: portalColors.muted,
    textAlign: 'center',
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
  },
  loginField: {
    gap: spacing.sm,
  },
  loginLabel: {
    color: portalColors.muted,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  loginInput: {
    minHeight: 50,
    borderRadius: radius.lg,
    backgroundColor: portalColors.background,
    borderWidth: 1,
    borderColor: portalColors.line,
    paddingHorizontal: spacing.lg,
    color: portalColors.ink,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  loginPasswordText: {
    color: portalColors.ink,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  gateNotice: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerContainer,
  },
  gateNoticeText: {
    flex: 1,
    color: colors.danger,
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: '800',
  },
});
