import { portalColors, metricTones, styles } from '../src/features/owner-dashboard/styles';
import {
  buildOwnerGallery,
  getReviewsRating,
  formatPeso,
  compactPeso,
  isApprovedReservation,
  isPendingPayment,
  isPaymongoReservation,
  getPaymongoMethodLabel,
  canManuallyApproveReservation,
  canRecordAttendance,
  getApprovalGateReason,
  getReservationGuestName,
} from '../src/features/owner-dashboard/model';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  AppState,
  Alert,
  BackHandler,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type FlatListProps,
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
  MessageCircle,
  MoreHorizontal,
  Minus,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
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
import { OwnerTableBookingPolicy } from '../src/components/OwnerTableBookingPolicy';
import { formatPickerTime } from '../src/components/AdjustableTimePicker';
import { PasswordInput } from '../src/components/PasswordInput';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { hasOwnerAccess, normalizeAuthEmail } from '../src/constants/authRoles';
import {
  clubBookableTables,
  clubTableDisplayName,
  normalizeClubTableInventory,
  testCebspotClubSpotId,
} from '../src/constants/clubFloorPlan';
import { colors } from '../src/constants/colors';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { supabase } from '../src/lib/supabase';
import { ownerAccessService } from '../src/services/ownerAccessService';
import { ownerGalleryService } from '../src/services/ownerGalleryService';
import { paymentProofService } from '../src/services/paymentProofService';
import { reservationService } from '../src/services/reservationService';
import { reviewService } from '../src/services/reviewService';
import { spotService } from '../src/services/spotService';
import { venueTableService, type VenueTableAvailability } from '../src/services/venueTableService';
import type { Reservation, Review, ReviewReply, Spot, UserProfile } from '../src/types';
import {
  formatGuestCount,
  formatReservationDateTime,
  getPaymentStatusLabel,
  getReservationBookingId,
  getReservationDisplayRef,
  getReservationStatusLabel,
  getReservationUniqueId,
} from '../src/utils/reservations';
import {
  createEmptyTableInventory,
  getPhysicalTables,
  mergeTableInventoryDraft,
  updatePhysicalTable,
  addPhysicalTable,
  normalizeStoredTableInventory,
  type TableInventory,
  type TableSlotId,
} from '../src/utils/tableInventory';

const cebspotLogo = require('../assets/cebspot-logo.png');

type OwnerTab = 'Overview' | 'Reservations' | 'Payments' | 'Reviews' | 'Tables & Pricing' | 'Spot Profile';
type GalleryFilter = 'all' | 'latest' | 'owner';

const clubTableIds = new Set(clubBookableTables.map((table) => table.tableId));

function isInheritedClubTemplate(spot: Spot) {
  if (spot.id === testCebspotClubSpotId) return false;
  const inventory = normalizeStoredTableInventory(spot.table_inventory);
  return (['sunset', 'prime', 'late'] as TableSlotId[]).every(
    (slotId) => inventory[slotId].length === clubBookableTables.length
      && inventory[slotId].every((table) => clubTableIds.has(table.tableId)),
  );
}

function getSpotTableInventory(spot: Spot | null): TableInventory {
  if (!spot) return createEmptyTableInventory();
  if (spot.id === testCebspotClubSpotId) return normalizeStoredTableInventory(spot.table_inventory);
  if (isInheritedClubTemplate(spot)) return createEmptyTableInventory();
  return normalizeStoredTableInventory(spot.table_inventory);
}

type PortalIcon = React.ComponentType<any>;
type OwnerConfirmation =
  | { kind: 'approve-reservation'; reservation: Reservation }
  | { kind: 'mark-arrived'; reservation: Reservation }
  | { kind: 'mark-no-show'; reservation: Reservation }
  | { kind: 'view-payment-proof'; reservation: Reservation }
  | { kind: 'complete-visit'; reservation: Reservation }
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

function getOwnerConfirmationTitle(confirmation: OwnerConfirmation | null) {
  if (confirmation?.kind === 'complete-visit') return 'Complete this visit?';
  if (confirmation?.kind === 'approve-reservation') return 'Approve this reservation?';
  if (confirmation?.kind === 'mark-arrived') return 'Confirm guest arrival?';
  if (confirmation?.kind === 'mark-no-show') return 'Mark this guest as no-show?';
  if (confirmation?.kind === 'view-payment-proof') return 'Open payment proof?';
  if (confirmation?.kind === 'publish-settings') return 'Publish table changes?';
  return 'Confirm owner action';
}

function getOwnerConfirmationMessage(confirmation: OwnerConfirmation | null) {
  if (confirmation?.kind === 'complete-visit') return `Complete ${getReservationGuestName(confirmation.reservation)}'s visit at ${confirmation.reservation.table_id ? clubTableDisplayName(confirmation.reservation.table_id) : 'their table'}? The table will move to cleaning and stay unavailable until you mark it ready in Tables & Pricing.`;
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
    return `Confirm that these table IDs and capacities match the actual venue. This will save the inventory and set the reservation price to ${formatPeso(confirmation.reservationFee)}. Only our client venue with active online tables can accept reservations.`;
  }
  return 'Please confirm before continuing.';
}

function getOwnerConfirmationActionLabel(
  confirmation: OwnerConfirmation | null,
  savingSettings: boolean,
  approvingReservation: boolean,
  updatingAttendance: boolean,
) {
  if (confirmation?.kind === 'complete-visit') return updatingAttendance ? 'Completing...' : 'Complete visit';
  if (confirmation?.kind === 'approve-reservation') return approvingReservation ? 'Approving...' : 'Approve';
  if (confirmation?.kind === 'mark-arrived') return updatingAttendance ? 'Confirming...' : 'Guest Arrived';
  if (confirmation?.kind === 'mark-no-show') return updatingAttendance ? 'Updating...' : 'Mark No Show';
  if (confirmation?.kind === 'view-payment-proof') return 'Open Proof';
  if (confirmation?.kind === 'publish-settings') return savingSettings ? 'Publishing...' : 'Publish';
  return 'Confirm';
}

export default function OwnerDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { appColors } = useTheme();
  const { profile, loading: authLoading, signIn, logOut } = useAuth();
  const ownerSupabase = supabase;
  const [activeTab, setActiveTab] = useState<OwnerTab>('Overview');
  const [spot, setSpot] = useState<Spot | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewReplies, setReviewReplies] = useState<ReviewReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const dashboardLoading = useRef(false);
  const dashboardLoadVersion = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [accessClaimed, setAccessClaimed] = useState<boolean | null>(null);
  const [managedSpotId, setManagedSpotId] = useState<string | null>(null);
  const [liveTables, setLiveTables] = useState<VenueTableAvailability[]>([]);
  const [liveTablesLoading, setLiveTablesLoading] = useState(true);
  const [liveTablesError, setLiveTablesError] = useState(false);
  const liveTablesRequest = useRef(0);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [attendanceUpdatingId, setAttendanceUpdatingId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutConfirmationOpen, setSignOutConfirmationOpen] = useState(false);
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);
  const [ownerConfirmation, setOwnerConfirmation] = useState<OwnerConfirmation | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [tablePolicySaves, setTablePolicySaves] = useState(0);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [draftFee, setDraftFee] = useState('150');
  const [draftInventory, setDraftInventory] = useState<TableInventory>(createEmptyTableInventory);
  const previousSettings = useRef<{ ownerId: string | undefined; spot: Spot } | null>(null);
  // Gate for manual GCash approval: an owner must open a reservation's payment
  // proof (and, implicitly, check it against their own GCash account) before
  // the Approve action becomes available for that reservation.
  const [viewedProofIds, setViewedProofIds] = useState<Set<string>>(new Set());
  const isOwner = hasOwnerAccess(profile);

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
  const physicalTables = useMemo(() => getPhysicalTables(draftInventory), [draftInventory]);
  const activeTables = physicalTables.filter((table) => !table.isReserved).length;
  const totalTables = physicalTables.length;
  const rating = useMemo(() => getReviewsRating(reviews), [reviews]);

  const refreshLiveTables = useCallback(async () => {
    if (!managedSpotId) return;
    const request = ++liveTablesRequest.current;
    setLiveTablesLoading(true);
    try {
      const tables = await venueTableService.getAvailability(managedSpotId, null, null, ownerSupabase);
      if (request !== liveTablesRequest.current) return;
      setLiveTables(tables);
      setLiveTablesError(false);
    } catch (error) {
      if (request !== liveTablesRequest.current) return;
      console.warn('Unable to verify live venue tables:', error);
      setLiveTablesError(true);
    } finally {
      if (request === liveTablesRequest.current) setLiveTablesLoading(false);
    }
  }, [managedSpotId, ownerSupabase]);

  useEffect(() => {
    setLiveTables([]);
    setLiveTablesError(false);
    if (!managedSpotId || !isOwner) return;
    void refreshLiveTables();
    const unsubscribe = venueTableService.subscribe(managedSpotId, () => void refreshLiveTables(), ownerSupabase);
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refreshLiveTables(); }, 30000);
    const resume = AppState.addEventListener('change', state => { if (state === 'active') void refreshLiveTables(); });
    return () => { liveTablesRequest.current += 1; unsubscribe(); clearInterval(timer); resume.remove(); };
  }, [managedSpotId, isOwner, profile?.id, refreshLiveTables]);

  function applyConfirmedTableChange(change: { tableId: string; state: 'cleaning' | 'free' }) {
    // Called only AFTER an RPC confirms the transition, never on a tap.
    setLiveTables(current => current.map(table => table.tableId === change.tableId ? {
      ...table, state: change.state, walkInVisitId: null,
      walkInPartySize: null,
      // A ready runtime state can still have a due booking. Wait for the server
      // availability refresh before advertising it for online reservations.
      onlineAvailable: false,
      policyLocked: true, // Recheck all existing bookings before unlocking policy.
    } : table));
  }

  async function completeReservationVisit(reservation: Reservation) {
    try {
      setAttendanceUpdatingId(reservation.id);
      await venueTableService.completeReservation(reservation.id, ownerSupabase);
      setReservations(current => current.map(row => row.id === reservation.id ? { ...row, status: 'completed' } : row));
      if (reservation.table_id) applyConfirmedTableChange({ tableId: reservation.table_id, state: 'cleaning' });
      await refreshLiveTables();
      Alert.alert('Visit completed', 'The table is cleaning. Mark it ready in Tables & Pricing after cleaning.');
    } catch (error: any) {
      Alert.alert('Visit not completed', error.message || 'Refresh the reservations and try again.');
    } finally { setAttendanceUpdatingId(null); }
  }

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
      setSignOutConfirmationOpen(true);
      return true;
    });

    return () => subscription.remove();
  }, [isOwner]);

  useEffect(() => {
    if (!spot) return;
    const previous = previousSettings.current;
    previousSettings.current = { ownerId: profile?.id, spot };
    const savedFee = String(Number(spot.gcash_amount ?? spot.reservation_fee ?? 150));
    const savedInventory = getSpotTableInventory(spot);
    if (previous && previous.ownerId === profile?.id && previous.spot.id === spot.id) {
      const previousFee = String(Number(previous.spot.gcash_amount ?? previous.spot.reservation_fee ?? 150));
      setDraftFee(current => current === previousFee ? savedFee : current);
      setDraftInventory(current => mergeTableInventoryDraft(current, getSpotTableInventory(previous.spot), savedInventory));
    } else {
      setDraftFee(savedFee);
      setDraftInventory(savedInventory);
    }
  }, [spot, profile?.id]);

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
      setReviewReplies([]);
      setAccessClaimed(false);
      setManagedSpotId(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (dashboardLoading.current) return;
    dashboardLoading.current = true;
    const loadVersion = ++dashboardLoadVersion.current;
    try {
      setRefreshing(true);
      setLoadError(false);
      const assignedSpotId = await ownerAccessService.getPrimaryManagedSpotId(ownerSupabase);
      if (loadVersion !== dashboardLoadVersion.current) return;
      if (!assignedSpotId) {
        setManagedSpotId(null);
        setAccessClaimed(false);
        setSpot(null);
        setReservations([]);
        setReviews([]);
        setReviewReplies([]);
        return;
      }
      const [nextSpot, nextReservations, nextReviews, nextReviewReplies] = await Promise.all([
        spotService.getSpotById(assignedSpotId, ownerSupabase),
        reservationService.getSpotReservations(assignedSpotId, ownerSupabase),
        reviewService.getReviewsForSpot(assignedSpotId, ownerSupabase),
        reviewService.getRepliesForSpot(assignedSpotId, ownerSupabase),
      ]);
      if (loadVersion !== dashboardLoadVersion.current) return;
      let isolatedSpot = nextSpot;
      if (nextSpot && isInheritedClubTemplate(nextSpot)) {
        try {
          isolatedSpot = await spotService.replaceTableInventory(
            assignedSpotId,
            createEmptyTableInventory(),
            ownerSupabase,
          );
        } catch (error) {
          console.warn('Unable to remove inherited table template from this venue:', error);
        }
      }
      if (loadVersion !== dashboardLoadVersion.current) return;
      setSpot(isolatedSpot);
      setManagedSpotId(assignedSpotId);
      setAccessClaimed(true);
      setReservations(nextReservations);
      setReviews(nextReviews);
      setReviewReplies(nextReviewReplies);
    } catch (error) {
      if (loadVersion !== dashboardLoadVersion.current) return;
      console.error('Unable to load owner dashboard:', error);
      setLoadError(true);
    } finally {
      if (loadVersion === dashboardLoadVersion.current) {
        dashboardLoading.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    if (!isOwner) {
      setSpot(null);
      setReservations([]);
      setReviews([]);
      setReviewReplies([]);
      setAccessClaimed(false);
      setManagedSpotId(null);
      setLoading(false);
      return () => undefined;
    }

    setLoading(true);
    void loadDashboard();
    return () => {
      dashboardLoadVersion.current += 1;
      dashboardLoading.current = false;
    };
  }, [isOwner, profile?.id]);

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
    if (savingSettings || tablePolicySaves > 0) return;
    const nextFee = Number(draftFee);
    if (!draftFee.trim() || !Number.isFinite(nextFee) || nextFee < 0 || nextFee > 999999.99 || Math.abs(nextFee * 100 - Math.round(nextFee * 100)) > 0.00001) {
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
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo access to post venue photos.');
        return;
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
          tableInventory: draftInventory,
        },
        ownerSupabase,
      );
      setSpot(updatedSpot);
      if (updatedSpot.id === testCebspotClubSpotId) {
        const confirmed = await spotService.confirmReservationInventory(updatedSpot, ownerSupabase);
        setSpot(confirmed);
        Alert.alert('Updated', 'Your actual table inventory is confirmed and reservations are enabled.');
      } else {
        Alert.alert('Updated', 'Your settings are saved. This venue remains discovery-only.');
      }
    } catch (error: any) {
      Alert.alert('Update failed', error.message ?? 'Please try again.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function replyToReview(review: Review, body: string) {
    if (!spot || !profile) return false;
    try {
      setSendingReplyId(review.id);
      const created = await reviewService.createReviewReply(
        {
          spot_id: spot.id,
          review_id: review.id,
          parent_reply_id: null,
          user_id: profile.id,
          user_name: profile.display_name || profile.email || 'CebSpot owner',
          user_photo_url: profile.photo_url,
          body,
        },
        ownerSupabase,
      );
      setReviewReplies((current) => [...current, created]);
      return true;
    } catch (error: any) {
      Alert.alert('Reply failed', error.message ?? 'Please try again.');
      return false;
    } finally {
      setSendingReplyId(null);
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
    if (confirmation.kind === 'complete-visit') {
      void completeReservationVisit(confirmation.reservation);
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
          <Text style={styles.loadingText}>{loadError ? 'Unable to load your venue. Please try again.' : 'No venue is assigned to this owner account.'}</Text>
          {loadError && (
            <Pressable accessibilityRole="button" onPress={() => void loadDashboard()} style={styles.primaryPortalButton}>
              <Text style={styles.primaryPortalButtonText}>Retry</Text>
            </Pressable>
          )}
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
    liveTables,
    liveTablesLoading,
    liveTablesError,
    refreshLiveTables,
    onTableReady: async (tableId) => {
      if (!spot) throw new Error('Refresh your venue before marking a table ready.');
      await venueTableService.markReady(spot.id, tableId, ownerSupabase);
      applyConfirmedTableChange({ tableId, state: 'free' });
      void refreshLiveTables();
    },
    onTablePolicySaved: (saved) => { setSpot(saved); void refreshLiveTables(); },
    onTablePolicySavingChange: (saving) => setTablePolicySaves(current => Math.max(0, current + (saving ? 1 : -1))),
    onCompleteReservation: (reservation) => setOwnerConfirmation({ kind: 'complete-visit', reservation }),
    activeTab,
    accessClaimed,
    activeTables,
    approvingId,
    attendanceUpdatingId,
    approvedReservations,
    draftFee,
    physicalTables,
    isClubFloorPlan: spot.id === testCebspotClubSpotId,
    onApproveReservation: requestApproveReservation,
    onRecordAttendance: requestRecordAttendance,
    onOpenPaymentProof: requestOpenPaymentProof,
    onPostOwnerPhotos: postOwnerPhotos,
    onReplyToReview: replyToReview,
    onRefresh: loadDashboard,
    onSaveReservationSettings: requestSaveReservationSettings,
    paidReservations,
    paidTotal,
    paymentReservations,
    pendingPayments,
    profileEmail: profile?.email ?? 'Owner account',
    ownerProfileId: profile?.id ?? '',
    rating,
    refreshing,
    reservationFee,
    reservations,
    reviews,
    reviewReplies,
    savingSettings: savingSettings || tablePolicySaves > 0,
    sendingReplyId,
    setActiveTab,
    setDraftFee,
    onUpdateTable: (tableId, updates) => setDraftInventory((current) => updatePhysicalTable(current, tableId, updates)),
    onAddTable: () => setDraftInventory((current) => addPhysicalTable(current)),
    spot,
    totalTables,
    uploadingPhotos,
    venueName,
    viewedProofIds,
  };

  return (
    <View style={[styles.portalShell, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.dashboardFrame}>
        <View testID="owner-dashboard-chrome" style={styles.dashboardChrome}>
          <PortalHeader
            title={`Good Morning, ${profile?.display_name?.split(' ')[0] || 'Admin'}`}
            subtitle={venueName}
            onSignOut={() => setSignOutConfirmationOpen(true)}
            onRefresh={loadDashboard}
            refreshing={refreshing}
            compact
          />
          <MobileTabs activeTab={activeTab} onTabChange={setActiveTab} />
          {loadError && <Text accessibilityRole="alert" style={styles.loadError}>Refresh failed. Your last loaded data is still shown. Tap refresh to retry.</Text>}
        </View>
        <View testID="owner-dashboard-body" style={styles.dashboardBody}>
          <DashboardContent key={activeTab} {...dashboardProps} />
        </View>
      </View>

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
  liveTables: VenueTableAvailability[];
  liveTablesLoading: boolean;
  liveTablesError: boolean;
  refreshLiveTables: () => Promise<void>;
  onTableReady: (tableId: string) => Promise<void>;
  onTablePolicySaved: (spot: Spot) => void;
  onTablePolicySavingChange: (saving: boolean) => void;
  onCompleteReservation: (reservation: Reservation) => void;
  activeTab: OwnerTab;
  accessClaimed: boolean | null;
  activeTables: number;
  approvingId: string | null;
  attendanceUpdatingId: string | null;
  approvedReservations: Reservation[];
  draftFee: string;
  physicalTables: ReturnType<typeof getPhysicalTables>;
  onUpdateTable: (tableId: string, updates: { capacity?: number; isReserved?: boolean }) => void;
  onAddTable: () => void;
  isClubFloorPlan: boolean;
  onApproveReservation: (reservation: Reservation) => void;
  onRecordAttendance: (reservation: Reservation, status: 'checked_in' | 'no_show') => void;
  onOpenPaymentProof: (reservation: Reservation) => void;
  onPostOwnerPhotos: () => void;
  onReplyToReview: (review: Review, body: string) => Promise<boolean>;
  onRefresh: () => void;
  onSaveReservationSettings: () => void;
  paidReservations: Reservation[];
  paidTotal: number;
  paymentReservations: Reservation[];
  pendingPayments: Reservation[];
  profileEmail: string;
  ownerProfileId: string;
  rating: number;
  refreshing: boolean;
  reservationFee: number;
  reservations: Reservation[];
  reviews: Review[];
  reviewReplies: ReviewReply[];
  savingSettings: boolean;
  sendingReplyId: string | null;
  setActiveTab: (tab: OwnerTab) => void;
  setDraftFee: (value: string) => void;
  spot: Spot | null;
  totalTables: number;
  uploadingPhotos: boolean;
  venueName: string;
  viewedProofIds: Set<string>;
};

function DashboardContent(props: DashboardContentProps) {
  if (props.activeTab === 'Reservations') return <ReservationsView {...props} />;
  if (props.activeTab === 'Payments') return <PaymentsView {...props} />;
  if (props.activeTab === 'Reviews') return <ReviewsView {...props} />;
  if (props.activeTab === 'Tables & Pricing') return <TablesPricingView {...props} />;
  return (
    <ScrollView style={styles.dashboardBody} contentContainerStyle={styles.dashboardContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {props.activeTab === 'Spot Profile' ? <SpotProfileView {...props} /> : <OverviewView {...props} />}
    </ScrollView>
  );
}

function DashboardList<ItemT>(props: FlatListProps<ItemT>) {
  return (
    <FlatList
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      updateCellsBatchingPeriod={32}
      removeClippedSubviews={false}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...props}
      style={[styles.dashboardBody, props.style]}
      contentContainerStyle={[styles.dashboardContent, props.contentContainerStyle]}
      ItemSeparatorComponent={DashboardListSeparator}
    />
  );
}

function DashboardListSeparator() {
  return <View style={styles.dashboardListSeparator} />;
}

function PortalHeader({
  title,
  subtitle,
  onSignOut,
  onRefresh,
  refreshing,
  compact,
}: {
  title: string;
  subtitle: string;
  onSignOut: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  compact?: boolean;
}) {
  return (
      <View style={[styles.portalHeader, compact && styles.portalHeaderCompact]}>
      <View style={styles.headerIdentity}>
        <Pressable
          accessibilityLabel="Sign out of owner dashboard"
          accessibilityRole="button"
          style={[styles.headerExitButton, compact && styles.headerExitButtonCompact]}
          onPress={onSignOut}
        >
          <LogOut size={compact ? 16 : 18} color={portalColors.ink} />
          <Text style={[styles.headerExitText, compact && styles.headerExitTextCompact]}>Sign Out</Text>
        </Pressable>
        <View style={[styles.trendIcon, compact && styles.trendIconCompact]}>
          <TrendingUp size={18} color={portalColors.primaryDark} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.portalTitle, compact && styles.portalTitleCompact]} numberOfLines={2}>{title}</Text>
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

const MobileTabs = React.memo(function MobileTabs({ activeTab, onTabChange }: { activeTab: OwnerTab; onTabChange: (tab: OwnerTab) => void }) {
  const rail = useRef<ScrollView>(null);
  const tabLayouts = useRef<Partial<Record<OwnerTab, { x: number; width: number }>>>({});
  const [railWidth, setRailWidth] = useState(0);
  const revealSelected = () => {
    const layout = tabLayouts.current[activeTab];
    if (layout && railWidth) rail.current?.scrollTo({ x: Math.max(0, layout.x - (railWidth - layout.width) / 2), animated: true });
  };
  useEffect(revealSelected, [activeTab, railWidth]);
  return (
    <ScrollView
      ref={rail}
      testID="owner-tab-rail"
      horizontal
      style={styles.mobileTabRail}
      onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.mobileTabs}
    >
      {ownerTabs.map((tab) => {
        const selected = tab.label === activeTab;
        const Icon = tab.icon;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            aria-selected={selected}
            testID={`owner-tab-${tab.label}`}
            key={tab.label}
            onLayout={(event) => {
              tabLayouts.current[tab.label] = event.nativeEvent.layout;
              if (selected) revealSelected();
            }}
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
});

function OverviewView(props: DashboardContentProps) {
  const incoming = props.reservations.slice(0, 3);
  const compact = true;

  return (
    <View style={styles.viewStack}>
      <View style={styles.metricDeck}>
        <PortalMetric icon={WalletCards} iconTone="green" label="Total Revenue" value={formatPeso(props.paidTotal)} delta="+12.5%" compact={compact} />
        <PortalMetric icon={CalendarDays} iconTone="blue" label="Reservations" value={String(props.reservations.length)} delta="+4.2%" compact={compact} />
        <PortalMetric icon={Star} iconTone="orange" label="Verified Rating" value={props.reviews.length ? props.rating.toFixed(1) : 'No ratings'} compact={compact} />
        <PortalMetric icon={Users} iconTone="amber" label="Active Tables" value={`${props.activeTables}/${props.totalTables}`} live compact={compact} />
      </View>

      <View style={styles.overviewGrid}>
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
                  onComplete={() => props.onCompleteReservation(reservation)}
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
    <DashboardList
      testID="owner-reservations-list"
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      data={props.reservations}
      extraData={props}
      keyExtractor={(reservation) => reservation.id}
      ListHeaderComponent={
      <SectionIntro
        title="Reservations"
        eyebrow="Live Queue"
        detail={`${props.pendingPayments.length} pending payments, ${props.approvedReservations.length} approved`}
        onRefresh={props.onRefresh}
        refreshing={props.refreshing}
        compact
      />
      }
      renderItem={({ item: reservation }) => (
            <ReservationRow
              reservation={reservation}
              expanded
              approving={props.approvingId === reservation.id}
              updatingAttendance={props.attendanceUpdatingId === reservation.id}
              viewedProofIds={props.viewedProofIds}
              onApprove={() => props.onApproveReservation(reservation)}
              onRecordAttendance={(status) => props.onRecordAttendance(reservation, status)}
              onComplete={() => props.onCompleteReservation(reservation)}
              onOpenPaymentProof={() => props.onOpenPaymentProof(reservation)}
            />
      )}
      ListEmptyComponent={<EmptyPanel title="No Reservations" body="Reservations from guests will appear here." />}
    />
  );
}

function PaymentsView(props: DashboardContentProps) {
  const compact = true;
  return (
    <DashboardList
      testID="owner-payments-list"
      data={props.paymentReservations}
      extraData={props}
      keyExtractor={(reservation) => reservation.id}
      ListHeaderComponent={
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
      </View>
      }
      renderItem={({ item: reservation }) => (
            <PaymentCard
              reservation={reservation}
              approving={props.approvingId === reservation.id}
              viewedProofIds={props.viewedProofIds}
              onApprove={() => props.onApproveReservation(reservation)}
              onOpenPaymentProof={() => props.onOpenPaymentProof(reservation)}
            />
      )}
      ListEmptyComponent={<EmptyPanel title="No Payments Recorded" body="Submitted payment references and screenshots will appear here." />}
    />
  );
}

function formatReviewDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReviewsView(props: DashboardContentProps) {
  const compact = true;
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const repliesByReview = useMemo(
    () => props.reviewReplies.reduce<Record<string, ReviewReply[]>>((grouped, reply) => {
      grouped[reply.review_id] = [...(grouped[reply.review_id] ?? []), reply];
      return grouped;
    }, {}),
    [props.reviewReplies],
  );

  async function sendReply(review: Review) {
    const body = replyDrafts[review.id]?.trim() ?? '';
    if (!body) return;
    const sent = await props.onReplyToReview(review, body);
    if (sent) setReplyDrafts((current) => ({ ...current, [review.id]: '' }));
  }

  return (
    <DashboardList
      testID="owner-reviews-list"
      data={props.reviews}
      extraData={{ props, replyDrafts }}
      keyExtractor={(review) => review.id}
      ListHeaderComponent={
      <View style={styles.viewStack}>
      <SectionIntro
        title="Reviews"
        eyebrow="Guest feedback"
        detail={`${props.reviews.length} ${props.reviews.length === 1 ? 'review' : 'reviews'} for ${props.venueName}`}
        onRefresh={props.onRefresh}
        refreshing={props.refreshing}
        compact={compact}
      />
      <View style={styles.reviewGrid}>
        <View style={[styles.reviewScorePanel, compact && styles.reviewScorePanelCompact]}>
          <Star size={compact ? 28 : 36} color={portalColors.primary} />
          <Text style={[styles.reviewScore, compact && styles.reviewScoreCompact]}>
            {props.reviews.length ? props.rating.toFixed(1) : '—'}
          </Text>
          <Text style={styles.reviewCopy}>{props.reviews.length ? 'Average rating' : 'No ratings yet'}</Text>
        </View>
        <View style={[styles.reviewDetailPanel, compact && styles.reviewDetailPanelCompact]}>
          <Text style={[styles.panelTitle, compact && styles.panelTitleCompact]}>Recent Feedback</Text>
          <Text style={styles.reviewPolicyCopy}>Reviews cannot be removed by spot owners. Reply to guest feedback here.</Text>
        </View>
      </View>

      </View>
      }
      renderItem={({ item: review }) => {
            const replies = repliesByReview[review.id] ?? [];
            const draft = replyDrafts[review.id] ?? '';
            const sending = props.sendingReplyId === review.id;
            return (
              <View key={review.id} style={styles.ownerReviewCard}>
                <View style={styles.ownerReviewHeader}>
                  <View style={styles.ownerReviewAvatar}>
                    {review.user_photo_url ? (
                      <Image source={{ uri: review.user_photo_url }} style={styles.ownerReviewAvatarImage} />
                    ) : (
                      <Text style={styles.ownerReviewAvatarText}>{(review.user_name || 'G').charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={styles.ownerReviewIdentity}>
                    <Text style={styles.ownerReviewName}>{review.user_name || 'CebSpot guest'}</Text>
                    <Text style={styles.ownerReviewDate}>{formatReviewDate(review.created_at)}</Text>
                  </View>
                  <View style={styles.ownerReviewStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={14}
                        color={star <= Math.round(review.rating) ? portalColors.primary : portalColors.muted}
                        fill={star <= Math.round(review.rating) ? portalColors.primary : 'transparent'}
                      />
                    ))}
                  </View>
                </View>
                <Text style={styles.ownerReviewComment}>{review.comment?.trim() || 'Rating only'}</Text>

                {replies.length ? (
                  <View style={styles.ownerReplyThread}>
                    {replies.map((reply) => (
                      <View key={reply.id} style={styles.ownerReplyBubble}>
                        <View style={styles.ownerReplyHeading}>
                          <MessageCircle size={13} color={portalColors.primary} />
                          <Text style={styles.ownerReplyName}>
                            {reply.user_id === props.ownerProfileId ? 'Owner reply' : reply.user_name || 'CebSpot user'}
                          </Text>
                          <Text style={styles.ownerReplyDate}>{formatReviewDate(reply.created_at)}</Text>
                        </View>
                        <Text style={styles.ownerReplyBody}>{reply.body}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.ownerReplyComposer}>
                  <TextInput
                    value={draft}
                    onChangeText={(value) => setReplyDrafts((current) => ({ ...current, [review.id]: value }))}
                    editable={!sending}
                    multiline
                    maxLength={500}
                    placeholder="Reply as the spot owner"
                    placeholderTextColor={portalColors.muted}
                    selectionColor={portalColors.primary}
                    style={styles.ownerReplyInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Reply to ${review.user_name || 'guest review'}`}
                    disabled={sending || !draft.trim()}
                    onPress={() => void sendReply(review)}
                    style={[styles.ownerReplySend, (sending || !draft.trim()) && styles.disabledButton]}
                  >
                    {sending ? <ActivityIndicator size="small" color={colors.white} /> : <Send size={16} color={colors.white} />}
                    <Text style={styles.ownerReplySendText}>{sending ? 'Sending' : 'Reply'}</Text>
                  </Pressable>
                </View>
              </View>
            );
      }}
      ListEmptyComponent={<EmptyPanel title="No Reviews Yet" body="Guest ratings and comments for this spot will appear here." />}
    />
  );
}

function TablesPricingView(props: DashboardContentProps) {
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const numColumns = width >= 1350 ? 4 : width >= 900 ? 3 : 2;
  const [tableSearch, setTableSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<'all' | 'online' | 'walk-ins' | 'out-of-service'>('all');
  const clubSlotLabels: Record<TableSlotId, { label: string; time: string }> = {
    sunset: { label: 'Early Night', time: '20:00 - 22:30' },
    prime: { label: 'Prime', time: '23:00 - 01:30' },
    late: { label: 'Late Night', time: '02:00 - 04:00' },
  };
  const filterOptions: Array<{ id: typeof tableFilter; label: string; count: number }> = [
    { id: 'all', label: 'All tables', count: props.physicalTables.length },
    { id: 'online', label: 'Online + walk-ins', count: props.physicalTables.filter((table) => !table.isReserved && (table.bookingPolicy || 'online_and_walk_ins') === 'online_and_walk_ins').length },
    { id: 'walk-ins', label: 'Walk-ins only', count: props.physicalTables.filter((table) => !table.isReserved && table.bookingPolicy === 'walk_in_only').length },
    { id: 'out-of-service', label: 'Out of service', count: props.physicalTables.filter((table) => table.isReserved).length },
  ];
  const visibleTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    return props.physicalTables.filter((table) => {
      const policy = table.bookingPolicy || 'online_and_walk_ins';
      const matchesQuery = !query
        || table.tableId.toLowerCase().includes(query)
        || clubTableDisplayName(table.tableId).toLowerCase().includes(query);
      const matchesFilter = tableFilter === 'all'
        || (tableFilter === 'online' && !table.isReserved && policy === 'online_and_walk_ins')
        || (tableFilter === 'walk-ins' && !table.isReserved && policy === 'walk_in_only')
        || (tableFilter === 'out-of-service' && table.isReserved);
      return matchesQuery && matchesFilter;
    });
  }, [props.physicalTables, tableFilter, tableSearch]);

  const renderTableCard = ({ item: table }: { item: (typeof props.physicalTables)[number] }) => (
    <View style={[styles.tableCard, compact && styles.tableCardCompact]}>
      <View style={styles.tableCardHeading}>
        <View style={styles.tableCopy}>
          <Text style={[styles.tableTitle, compact && styles.tableTitleCompact]}>{clubTableDisplayName(table.tableId)}</Text>
          <Text style={styles.tableMeta}>{table.capacity} guests maximum</Text>
        </View>
        <View style={[styles.tableModeBadge, table.isReserved ? styles.tableModeBadgeMuted : table.bookingPolicy === 'walk_in_only' ? styles.tableModeBadgeWalkIn : styles.tableModeBadgeOnline]}>
          <Text style={[styles.tableModeBadgeText, table.isReserved ? styles.tableModeBadgeTextMuted : table.bookingPolicy === 'walk_in_only' ? styles.tableModeBadgeTextWalkIn : styles.tableModeBadgeTextOnline]}>
            {table.isReserved ? 'Out of service' : table.bookingPolicy === 'walk_in_only' ? 'Walk-ins only' : 'Online + walk-ins'}
          </Text>
        </View>
      </View>
      <View style={styles.tableCardCapacityRow}>
        <Text style={styles.tableCardSectionLabel}>SEATING CAPACITY</Text>
        <View style={styles.tableStepper}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Decrease capacity for ${table.tableId}`} accessibilityState={{ disabled: props.savingSettings || table.capacity <= 1 }} disabled={props.savingSettings || table.capacity <= 1} onPress={() => props.onUpdateTable(table.tableId, { capacity: table.capacity - 1 })} style={[styles.stepButton, (props.savingSettings || table.capacity <= 1) && styles.disabledButton]}>
            <Minus size={18} color={portalColors.primary} />
          </Pressable>
          <Text style={styles.tableCount}>{table.capacity}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Increase capacity for ${table.tableId}`} accessibilityState={{ disabled: props.savingSettings || table.capacity >= 100 }} disabled={props.savingSettings || table.capacity >= 100} onPress={() => props.onUpdateTable(table.tableId, { capacity: table.capacity + 1 })} style={[styles.stepButton, (props.savingSettings || table.capacity >= 100) && styles.disabledButton]}>
            <Plus size={18} color={portalColors.primary} />
          </Pressable>
        </View>
      </View>
      <Pressable accessibilityRole="switch" accessibilityLabel={`Enable table ${table.tableId} for service`} accessibilityState={{ checked: !table.isReserved, disabled: props.savingSettings }} disabled={props.savingSettings} onPress={() => props.onUpdateTable(table.tableId, { isReserved: !table.isReserved })} style={[styles.tableAvailability, styles.tableServiceControl, table.isReserved && styles.tableServiceControlOff, props.savingSettings && styles.disabledButton]}>
        <View style={[styles.tableServiceDot, !table.isReserved && styles.tableServiceDotOn]} />
        <Text style={styles.tableServiceText}>{table.isReserved ? 'Out of service' : 'In service'}</Text>
      </Pressable>
      {props.spot ? (
        <View style={styles.tablePolicyControl}>
          <Text style={styles.tableCardSectionLabel}>BOOKING POLICY</Text>
          <OwnerTableBookingPolicy
            spotId={props.spot.id}
            tableId={table.tableId}
            policy={table.bookingPolicy || 'online_and_walk_ins'}
            liveTable={props.liveTables.find((live) => live.tableId === table.tableId)}
            unavailable={props.liveTablesLoading || props.liveTablesError || props.savingSettings}
            onSaved={props.onTablePolicySaved}
            onSavingChange={props.onTablePolicySavingChange}
            onReady={() => props.onTableReady(table.tableId)}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <View testID="owner-tables-list" style={[styles.dashboardBody, styles.dashboardContent, styles.tablesPricingScreen]}>
      <SectionIntro
        title="Tables & Pricing"
        eyebrow={props.isClubFloorPlan ? 'Club floor plan' : 'Reservation setup'}
        detail={props.isClubFloorPlan ? 'The mapped tables publish to guest booking screens.' : 'Only tables configured for this spot appear here.'}
        compact={compact}
      />
      <View style={[styles.tablesPanel, compact && styles.tablesPanelCompact, styles.tablesPanelExpanded]}>
        <View style={[styles.pricingCards, !compact && styles.pricingCardsWide]}>
          <View style={[styles.pricePanel, compact && styles.pricePanelCompact, styles.pricePanelTight]}>
            <Text style={styles.fieldLabel}>Reservation Price</Text>
            <View style={styles.priceInputRow}>
              <Text style={styles.currencyPrefix}>PHP</Text>
              <TextInput
                value={props.draftFee}
                accessibilityLabel="Reservation price in pesos"
                editable={!props.savingSettings}
                onChangeText={props.setDraftFee}
                keyboardType="numeric"
                placeholder="150"
                placeholderTextColor={portalColors.muted}
                selectionColor={portalColors.primary}
                style={[styles.priceInput, compact && styles.priceInputCompact]}
              />
            </View>
            <Text style={styles.tableMeta}>One fee for each online reservation across all tables and times.</Text>
          </View>
          <View style={[styles.pricePanel, compact && styles.pricePanelCompact, styles.pricePanelTight]}>
            <Text style={styles.fieldLabel}>Experience Slot</Text>
            <View style={styles.experienceSlotSummary}>
              <Clock3 size={18} color={portalColors.primary} />
              <Text style={styles.experienceSlotSummaryText}>Guests choose their preferred arrival time. The exact time appears on each reservation.</Text>
            </View>
          </View>
        </View>

        <View style={styles.tableBrowser}>
          <View style={styles.tableBrowserHeading}>
            <View style={styles.tableBrowserTitleGroup}>
              <Text style={styles.tableBrowserTitle}>Your tables</Text>
              <Text style={styles.tableBrowserMeta}>{props.physicalTables.length} total · {props.physicalTables.filter((table) => !table.isReserved).length} in service</Text>
            </View>
            {props.liveTablesLoading ? (
              <View style={styles.tableLiveStatus}><ActivityIndicator size="small" color={portalColors.primary} /><Text style={styles.tableBrowserMeta}>Checking live status</Text></View>
            ) : null}
          </View>
          <View style={styles.tableSearchRow}>
            <Search size={18} color={portalColors.muted} />
            <TextInput
              value={tableSearch}
              onChangeText={setTableSearch}
              accessibilityLabel="Search tables by name or number"
              placeholder="Find a table by name or number"
              placeholderTextColor={portalColors.muted}
              selectionColor={portalColors.primary}
              style={styles.tableSearchInput}
              returnKeyType="search"
            />
            {tableSearch.length > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear table search" onPress={() => setTableSearch('')} style={styles.clearTableSearch}>
                <Text style={styles.clearTableSearchText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.tableFilterRow}>
            {filterOptions.map((option) => {
              const selected = tableFilter === option.id;
              return (
                <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setTableFilter(option.id)} style={[styles.tableFilterChip, selected && styles.tableFilterChipSelected]}>
                  <Text style={[styles.tableFilterText, selected && styles.tableFilterTextSelected]}>{option.label}</Text>
                  <Text style={[styles.tableFilterCount, selected && styles.tableFilterCountSelected]}>{option.count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {props.liveTablesError ? <Text accessibilityRole="alert" style={styles.tableLiveError}>Live table status could not be checked. Refresh before changing table availability.</Text> : null}
          <FlatList
            key={`table-grid-${numColumns}`}
            testID="owner-physical-table-grid"
            data={visibleTables}
            extraData={props}
            numColumns={numColumns}
            columnWrapperStyle={numColumns > 1 ? styles.tableGridRow : undefined}
            keyExtractor={(table) => table.tableId}
            renderItem={renderTableCard}
            style={styles.tableGridList}
            contentContainerStyle={styles.tableGridContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            ListEmptyComponent={props.physicalTables.length === 0
              ? <EmptyPanel title="No Tables Configured" body="Add your first table, then publish the reservation settings." />
              : <EmptyPanel title="No Matching Tables" body="Try a different name or change the filter." />}
          />
        </View>
      </View>
      <View style={styles.tableFooterActions}>
        {!props.isClubFloorPlan ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Add a table" disabled={props.savingSettings} onPress={props.onAddTable} style={[styles.tableAvailability, props.savingSettings && styles.disabledButton]}>
            <Plus size={18} color={portalColors.primary} /><Text style={styles.tableMeta}>Add table</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Publish table and reservation settings"
          accessibilityState={{ disabled: props.savingSettings, busy: props.savingSettings }}
          style={[styles.primaryPortalButton, styles.publishTableSettingsButton, props.savingSettings && styles.disabledButton]}
          disabled={props.savingSettings}
          onPress={props.onSaveReservationSettings}
        >
          <Text style={styles.primaryPortalButtonText}>
            {props.savingSettings ? 'Publishing...' : props.isClubFloorPlan ? 'Publish Price & Floor Plan' : 'Publish Reservation Settings'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SpotProfileView(props: DashboardContentProps) {
  const spot = props.spot;
  const compact = true;
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
  onComplete,
  onOpenPaymentProof,
}: {
  reservation: Reservation;
  approving: boolean;
  updatingAttendance: boolean;
  expanded?: boolean;
  viewedProofIds: Set<string>;
  onApprove: () => void;
  onRecordAttendance: (status: 'checked_in' | 'no_show') => void;
  onComplete: () => void;
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
          <Detail label="Arrival time" value={reservation.reservation_time ? formatPickerTime(reservation.reservation_time) : 'Not provided'} />
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
        {reservation.status === 'checked_in' && <Pressable accessibilityRole="button"
          accessibilityLabel={`Complete visit for ${guestName}`} disabled={updatingAttendance}
          onPress={onComplete} style={[styles.arrivedButton, updatingAttendance && styles.disabledButton]}>
          <Text style={styles.arrivedButtonText}>{updatingAttendance ? 'Completing...' : 'Complete visit'}</Text>
        </Pressable>}
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
