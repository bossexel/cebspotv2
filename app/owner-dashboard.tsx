import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  ExternalLink,
  LogOut,
  Minus,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Store,
  TriangleAlert,
  WalletCards,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { OWNER_EMAIL, hasOwnerAccess, normalizeAuthEmail } from '../src/constants/authRoles';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useScopedAuth } from '../src/hooks/useScopedAuth';
import { useTheme } from '../src/hooks/useTheme';
import { ownerAccessService } from '../src/services/ownerAccessService';
import { paymentProofService } from '../src/services/paymentProofService';
import { reservationService } from '../src/services/reservationService';
import { spotService } from '../src/services/spotService';
import type { Reservation, Spot } from '../src/types';
import {
  formatGuestCount,
  formatReservationDateTime,
  getPaymentStatusLabel,
  getReservationBookingId,
  getReservationStatusLabel,
  getReservationUniqueId,
} from '../src/utils/reservations';
import {
  addTableToInventory,
  getTableInventoryTotals,
  normalizeTableInventory,
  removeTableFromInventory,
  type TableInventory,
  type TableSlotId,
} from '../src/utils/tableInventory';

const testCebspotSpotId = '66666666-6666-4666-8666-666666666666';
const ownerPortalUrl =
  process.env.EXPO_PUBLIC_OWNER_PORTAL_URL ??
  (Platform.OS === 'web' ? '/owner-portal/' : 'http://localhost:8081/owner-portal/');

function formatPeso(amount: number) {
  return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OwnerDashboardScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const { client: ownerSupabase, profile, isSignedIn, loading: authLoading, signIn, logOut } = useScopedAuth('owner');
  const [spot, setSpot] = useState<Spot | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessClaimed, setAccessClaimed] = useState<boolean | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [draftFee, setDraftFee] = useState('150');
  const [draftInventory, setDraftInventory] = useState<TableInventory>(() => normalizeTableInventory(null));
  const isOwner = hasOwnerAccess(profile);

  const pendingPayments = useMemo(
    () => reservations.filter((reservation) => reservation.payment_required && reservation.payment_status === 'pending'),
    [reservations],
  );
  const approvedReservations = useMemo(
    () => reservations.filter((reservation) => reservation.status === 'confirmed' || reservation.payment_status === 'paid'),
    [reservations],
  );
  const paidTotal = useMemo(
    () => approvedReservations.reduce((sum, reservation) => sum + Number(reservation.reservation_fee || reservation.fee || 0), 0),
    [approvedReservations],
  );
  const latestPayment = pendingPayments[0] ?? reservations.find((reservation) => reservation.payment_required) ?? null;
  const tableSummaries = useMemo(() => getTableInventoryTotals(draftInventory), [draftInventory]);

  useEffect(() => {
    if (!spot) return;
    setDraftFee(String(Number(spot.gcash_amount ?? spot.reservation_fee ?? 150)));
    setDraftInventory(normalizeTableInventory(spot.table_inventory));
  }, [spot?.gcash_amount, spot?.reservation_fee, spot?.table_inventory]);

  async function openOwnerPortal() {
    if (Platform.OS === 'web') {
      window.location.href = ownerPortalUrl;
      return;
    }
    await Linking.openURL(ownerPortalUrl);
  }

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await logOut();
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
      setAccessClaimed(false);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setRefreshing(true);
      setAccessClaimed(await ownerAccessService.claimTestCebspotOwnerAccess(ownerSupabase));
      const [nextSpot, nextReservations] = await Promise.all([
        spotService.getSpotById(testCebspotSpotId, ownerSupabase),
        reservationService.getSpotReservations(testCebspotSpotId, ownerSupabase),
      ]);
      setSpot(nextSpot);
      setReservations(nextReservations);
    } catch (error) {
      console.error('Unable to load owner dashboard:', error);
      setAccessClaimed(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let unsubscribeReservations: (() => void) | undefined;
    let unsubscribeSpot: (() => void) | undefined;
    if (!isOwner) {
      setSpot(null);
      setReservations([]);
      setAccessClaimed(false);
      setLoading(false);
      return () => undefined;
    }

    unsubscribeSpot = spotService.subscribeToSpotById(
      testCebspotSpotId,
      (nextSpot) => {
        if (nextSpot) setSpot(nextSpot);
      },
      ownerSupabase,
    );

    loadDashboard().then(() => {
      unsubscribeReservations = reservationService.subscribeToSpotReservations(testCebspotSpotId, setReservations, ownerSupabase);
    });

    return () => {
      unsubscribeReservations?.();
      unsubscribeSpot?.();
    };
  }, [isOwner, ownerSupabase]);

  function changeTableCount(slotId: TableSlotId, direction: 1 | -1) {
    setDraftInventory((current) =>
      direction > 0 ? addTableToInventory(current, slotId) : removeTableFromInventory(current, slotId),
    );
  }

  async function saveReservationSettings() {
    const nextFee = Number(draftFee);
    if (!Number.isFinite(nextFee) || nextFee < 0) {
      Alert.alert('Invalid price', 'Enter a valid reservation amount.');
      return;
    }

    try {
      setSavingSettings(true);
      const updatedSpot = await spotService.updateReservationSettings(
        testCebspotSpotId,
        {
          reservationFee: nextFee,
          tableInventory: normalizeTableInventory(draftInventory),
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

  async function openPaymentProof(reservation: Reservation) {
    if (!reservation.payment_proof_url) {
      Alert.alert('No screenshot', 'This reservation does not have an uploaded payment screenshot.');
      return;
    }

    try {
      const proofUrl = await paymentProofService.getProofUrl(reservation.payment_proof_url, ownerSupabase);
      await Linking.openURL(proofUrl);
    } catch (error: any) {
      Alert.alert('Unable to open proof', error.message ?? 'Please try again.');
    }
  }

  if (authLoading) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: appColors.onSurfaceVariant }]}>Checking owner session...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!isOwner) {
    return (
      <OwnerLoginGate
        appColors={appColors}
        signedInEmail={profile?.email ?? null}
        onSignIn={signIn}
        onSwitchAccount={logOut}
      />
    );
  }

  if (loading) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: appColors.onSurfaceVariant }]}>Loading Test Cebspot account...</Text>
        </View>
      </ScreenContainer>
    );
  }

  const venueName = spot?.name ?? 'Test Cebspot Restaurant';
  const reservationFee = Number(spot?.gcash_amount ?? spot?.reservation_fee ?? 150);

  return (
    <ScreenContainer appColors={appColors} scroll>
      <View style={styles.header}>
        <Pressable style={[styles.backButton, { backgroundColor: appColors.surfaceLow }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Store Owner</Text>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Owner Dashboard</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
            Test Cebspot Restaurant is the owner account for the paid reservation flow.
          </Text>
        </View>
      </View>

      <View style={[styles.accountCard, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.accountTop}>
          <View style={styles.storeIcon}>
            <Store size={28} color={colors.white} />
          </View>
          <View style={styles.accountCopy}>
            <Text style={[styles.accountName, { color: appColors.onSurface }]}>{venueName}</Text>
            <Text style={[styles.accountMeta, { color: appColors.onSurfaceVariant }]}>
              {spot?.category ?? 'Restaurant'} - {spot?.address ?? 'Barangay Apas, Cebu City'}
            </Text>
            <Text style={[styles.ownerMeta, { color: appColors.onSurfaceVariant }]}>
              Owner account: {profile?.display_name || profile?.email || 'Sign in to claim access'}
              {profile?.role ? ` (${profile.role})` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <MetricCard label="Pending Payment" value={String(pendingPayments.length)} appColors={appColors} />
          <MetricCard label="Approved" value={String(approvedReservations.length)} appColors={appColors} />
          <MetricCard label="Paid Total" value={formatPeso(paidTotal)} appColors={appColors} />
        </View>

        <View style={[styles.gcashPanel, { backgroundColor: appColors.white }]}>
          <WalletCards size={18} color={colors.primary} />
          <View style={styles.panelCopy}>
            <Text style={[styles.panelTitle, { color: appColors.onSurface }]}>GCash Receiver</Text>
            <Text style={[styles.panelText, { color: appColors.onSurfaceVariant }]}>
              {spot?.gcash_wallet_name ?? 'Test Cebspot Restaurant'} - {spot?.gcash_wallet_number ?? '0917 555 0198'}
            </Text>
          </View>
          <Text style={styles.feeText}>{formatPeso(reservationFee)}</Text>
        </View>
      </View>

      <View style={[styles.settingsCard, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.settingsHeader}>
          <View>
            <Text style={[styles.settingsTitle, { color: appColors.onSurface }]}>Tables & Pricing</Text>
            <Text style={[styles.settingsSub, { color: appColors.onSurfaceVariant }]}>
              Updates publish to guest booking and checkout screens.
            </Text>
          </View>
          <Text style={styles.liveBadge}>Live</Text>
        </View>

        <View style={[styles.priceEditor, { backgroundColor: appColors.white }]}>
          <Text style={[styles.priceLabel, { color: appColors.onSurfaceVariant }]}>Reservation Price</Text>
          <View style={styles.priceInputRow}>
            <Text style={styles.currencyPrefix}>PHP</Text>
            <TextInput
              value={draftFee}
              onChangeText={setDraftFee}
              keyboardType="numeric"
              placeholder="150"
              placeholderTextColor={appColors.onSurfaceVariant + '88'}
              style={[styles.priceInput, { color: appColors.onSurface }]}
            />
          </View>
        </View>

        <View style={styles.tableList}>
          {tableSummaries.map((slot) => (
            <View key={slot.slotId} style={[styles.tableRow, { backgroundColor: appColors.white }]}>
              <View style={styles.tableCopy}>
                <Text style={[styles.tableTitle, { color: appColors.onSurface }]}>{slot.label}</Text>
                <Text style={[styles.tableMeta, { color: appColors.onSurfaceVariant }]}>
                  {slot.time} - {slot.openCount} open - {slot.capacity} seats
                </Text>
              </View>
              <View style={styles.tableStepper}>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.stepButton, { backgroundColor: appColors.surfaceLow }]}
                  onPress={() => changeTableCount(slot.slotId, -1)}
                >
                  <Minus size={16} color={colors.primary} />
                </Pressable>
                <Text style={[styles.tableCount, { color: appColors.onSurface }]}>{slot.tableCount}</Text>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.stepButton, { backgroundColor: appColors.surfaceLow }]}
                  onPress={() => changeTableCount(slot.slotId, 1)}
                >
                  <Plus size={16} color={colors.primary} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          style={[styles.saveSettingsButton, savingSettings && styles.disabledButton]}
          disabled={savingSettings}
          onPress={saveReservationSettings}
        >
          <Text style={styles.saveSettingsText}>{savingSettings ? 'Publishing...' : 'Publish Tables & Price'}</Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.statusPanel,
          { backgroundColor: accessClaimed ? colors.successContainer : colors.primary + '12' },
        ]}
      >
        <ShieldCheck size={20} color={accessClaimed ? colors.success : colors.primary} />
        <View style={styles.panelCopy}>
          <Text style={[styles.noteTitle, { color: appColors.onSurface }]}>
            {accessClaimed ? 'Test Owner Access Ready' : isSignedIn ? 'Owner Account Required' : 'Test Owner Access Pending'}
          </Text>
          <Text style={[styles.panelText, { color: appColors.onSurfaceVariant }]}>
            {accessClaimed
              ? 'This signed-in account can read and approve Test Cebspot reservations for the test spot.'
              : isSignedIn
                ? `Sign out and use ${OWNER_EMAIL} to manage Test Cebspot reservations.`
                : `Sign in as ${OWNER_EMAIL} to manage Test Cebspot reservations.`}
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Owner Notifications</Text>
          <Text style={[styles.sectionSub, { color: appColors.onSurfaceVariant }]}>
            Paid reservation submissions appear here for review.
          </Text>
        </View>
        <Pressable style={[styles.iconButton, { backgroundColor: appColors.surfaceLow }]} onPress={loadDashboard}>
          <RefreshCw size={17} color={refreshing ? colors.primaryContainer : colors.primary} />
        </Pressable>
      </View>

      {latestPayment ? (
        <PaymentNotificationCard
          reservation={latestPayment}
          appColors={appColors}
          approving={approvingId === latestPayment.id}
          onApprove={() => approveReservation(latestPayment)}
          onViewProof={() => openPaymentProof(latestPayment)}
        />
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: appColors.surfaceLow }]}>
          <BellRing size={28} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: appColors.onSurface }]}>Waiting for payment</Text>
          <Text style={[styles.emptyCopy, { color: appColors.onSurfaceVariant }]}>
            Once a guest submits their GCash reference number and screenshot, the restaurant owner will see it here.
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <View style={[styles.approvalActionsPanel, { backgroundColor: appColors.surfaceLow }]}>
          <Text style={[styles.actionPanelTitle, { color: appColors.onSurface }]}>Reservation Approval Actions</Text>
          <Text style={[styles.actionPanelSub, { color: appColors.onSurfaceVariant }]}>
            Verify the GCash details, then approve the reservation from here.
          </Text>

          {pendingPayments.length ? (
            <View style={styles.approvalActionList}>
              {pendingPayments.map((reservation) => (
                <View key={reservation.id} style={[styles.approvalActionCard, { backgroundColor: appColors.white }]}>
                  <View style={styles.approvalActionTop}>
                    <View style={styles.panelCopy}>
                      <Text style={[styles.approvalActionTitle, { color: appColors.onSurface }]} numberOfLines={1}>
                        {reservation.spot_name}
                      </Text>
                      <Text style={[styles.panelText, { color: appColors.onSurfaceVariant }]}>
                        {formatReservationDateTime(reservation)} - {formatGuestCount(reservation.guest_count ?? reservation.guests)}
                      </Text>
                    </View>
                    <Text style={styles.pendingBadge}>Needs Approval</Text>
                  </View>

                  <View style={styles.approvalActionDetails}>
                    <Detail label="Booking ID" value={getReservationBookingId(reservation)} appColors={appColors} />
                    <Detail label="Unique ID" value={getReservationUniqueId(reservation)} appColors={appColors} />
                    <Detail label="Amount" value={formatPeso(Number(reservation.reservation_fee || reservation.fee || 0))} appColors={appColors} />
                    <Detail label="Reference" value={reservation.payment_reference || 'Not provided'} appColors={appColors} />
                    <Detail label="Payer GCash" value={reservation.payer_gcash_number || 'Not provided'} appColors={appColors} />
                    <Detail label="Screenshot" value={reservation.payment_proof_url ? 'Uploaded' : 'Missing'} appColors={appColors} />
                  </View>

                  <View style={styles.approvalButtonRow}>
                    <Pressable
                      style={[styles.proofButton, styles.approvalProofButton, !reservation.payment_proof_url && styles.disabledButton]}
                      onPress={() => openPaymentProof(reservation)}
                      disabled={!reservation.payment_proof_url}
                    >
                      <ReceiptText size={15} color={reservation.payment_proof_url ? colors.primary : appColors.onSurfaceVariant} />
                      <Text
                        style={[
                          styles.proofButtonText,
                          { color: reservation.payment_proof_url ? colors.primary : appColors.onSurfaceVariant },
                        ]}
                      >
                        View Proof
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.approveButton, styles.approvalConfirmButton]}
                      onPress={() => approveReservation(reservation)}
                      disabled={approvingId === reservation.id}
                    >
                      <CheckCircle2 size={16} color={colors.white} />
                      <Text style={styles.approveText}>
                        {approvingId === reservation.id ? 'Approving...' : 'Approve / Confirm Reservation'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.noApprovalCard, { backgroundColor: appColors.white }]}>
              <CheckCircle2 size={18} color={colors.success} />
              <Text style={[styles.noApprovalText, { color: appColors.onSurfaceVariant }]}>
                No pending paid reservations need approval right now.
              </Text>
            </View>
          )}
        </View>

        <Pressable style={styles.primaryButton} onPress={openOwnerPortal}>
          <ExternalLink size={16} color={colors.white} />
          <Text style={styles.primaryButtonText}>Open Web Portal</Text>
        </Pressable>
        <Pressable style={[styles.secondaryButton, { borderColor: appColors.outlineVariant }]} onPress={() => router.push('/owner-access')}>
          <Text style={styles.secondaryButtonText}>Owner Access Request</Text>
        </Pressable>
        {isSignedIn && (
          <Pressable
            style={[styles.signOutButton, { borderColor: appColors.outlineVariant }]}
            onPress={handleSignOut}
            disabled={signingOut}
          >
            <LogOut size={16} color={colors.danger} />
            <Text style={styles.signOutText}>{signingOut ? 'Signing Out...' : 'Sign Out'}</Text>
          </Pressable>
        )}
      </View>
    </ScreenContainer>
  );
}

function OwnerLoginGate({
  appColors,
  signedInEmail,
  onSignIn,
  onSwitchAccount,
}: {
  appColors: typeof colors;
  signedInEmail: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSwitchAccount: () => Promise<void>;
}) {
  const [email, setEmail] = useState(OWNER_EMAIL);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const hasWrongAccount = Boolean(signedInEmail && normalizeAuthEmail(signedInEmail) !== OWNER_EMAIL);

  async function switchAccount() {
    try {
      setSwitching(true);
      await onSwitchAccount();
    } catch (error: any) {
      Alert.alert('Sign out failed', error.message ?? 'Please try again.');
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
    if (normalizedEmail !== OWNER_EMAIL) {
      Alert.alert('Owner only', `Use the Test Cebspot owner account: ${OWNER_EMAIL}`);
      return;
    }

    try {
      setSubmitting(true);
      await onSignIn(normalizedEmail, password);
    } catch (error: any) {
      Alert.alert('Owner login failed', error.message ?? 'Please check the owner credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer appColors={appColors}>
      <View style={styles.gateScreen}>
        <View style={[styles.gateCard, { backgroundColor: appColors.surfaceLow, borderColor: appColors.outlineVariant + '66' }]}>
          <View style={styles.gateIcon}>
            <Store size={30} color={colors.white} />
          </View>
          <Text style={[styles.gateTitle, { color: appColors.onSurface }]}>CebSpot Owner</Text>
          <Text style={[styles.gateCopy, { color: appColors.onSurfaceVariant }]}>
            Sign in with the Test Cebspot owner account to manage reservations.
          </Text>

          {hasWrongAccount ? (
            <>
              <View style={styles.gateNotice}>
                <TriangleAlert size={18} color={colors.danger} />
                <Text style={styles.gateNoticeText}>
                  {signedInEmail} is signed in, but it does not have owner access.
                </Text>
              </View>
              <Pressable disabled={switching} onPress={switchAccount} style={styles.gateButton}>
                <Text style={styles.gateButtonText}>{switching ? 'Switching...' : 'Switch Account'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Owner email"
                placeholderTextColor={appColors.onSurfaceVariant}
                style={[styles.gateInput, { color: appColors.onSurface, backgroundColor: appColors.white }]}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Password"
                placeholderTextColor={appColors.onSurfaceVariant}
                style={[styles.gateInput, { color: appColors.onSurface, backgroundColor: appColors.white }]}
              />
              <Pressable disabled={submitting} onPress={submit} style={styles.gateButton}>
                <Text style={styles.gateButtonText}>{submitting ? 'Signing In...' : 'Sign In'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

function MetricCard({ label, value, appColors }: { label: string; value: string; appColors: typeof colors }) {
  return (
    <View style={[styles.metricCard, { backgroundColor: appColors.white }]}>
      <Text style={[styles.metricLabel, { color: appColors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: appColors.onSurface }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function PaymentNotificationCard({
  reservation,
  appColors,
  approving,
  onApprove,
  onViewProof,
}: {
  reservation: Reservation;
  appColors: typeof colors;
  approving: boolean;
  onApprove: () => void;
  onViewProof: () => void;
}) {
  const canApprove = reservation.payment_status !== 'paid' && reservation.status !== 'confirmed';

  return (
    <View style={[styles.notificationCard, { backgroundColor: appColors.white }]}>
      <View style={styles.notificationTop}>
        <View style={styles.notificationIcon}>
          <ReceiptText size={22} color={colors.white} />
        </View>
        <View style={styles.panelCopy}>
          <Text style={[styles.notificationTitle, { color: appColors.onSurface }]}>Payment Submitted</Text>
          <Text style={[styles.panelText, { color: appColors.onSurfaceVariant }]}>
            {formatReservationDateTime(reservation)} - {formatGuestCount(reservation.guest_count ?? reservation.guests)}
          </Text>
        </View>
        <Text style={canApprove ? styles.pendingBadge : styles.approvedBadge}>
          {canApprove ? 'Review' : 'Approved'}
        </Text>
      </View>

      <View style={styles.detailGrid}>
        <Detail label="Reservation" value={getReservationStatusLabel(reservation.status)} appColors={appColors} />
        <Detail label="Payment" value={getPaymentStatusLabel(reservation.payment_status)} appColors={appColors} />
        <Detail label="Booking ID" value={getReservationBookingId(reservation)} appColors={appColors} />
        <Detail label="Unique ID" value={getReservationUniqueId(reservation)} appColors={appColors} />
        <Detail label="Amount" value={formatPeso(Number(reservation.reservation_fee || reservation.fee || 0))} appColors={appColors} />
        <Detail label="Reference" value={reservation.payment_reference || 'Not provided'} appColors={appColors} />
        <Detail label="Payer GCash" value={reservation.payer_gcash_number || 'Not provided'} appColors={appColors} />
        <Detail label="Screenshot" value={reservation.payment_proof_url ? 'Uploaded' : 'Missing'} appColors={appColors} />
      </View>

      <Pressable
        style={[styles.proofButton, !reservation.payment_proof_url && styles.disabledButton]}
        onPress={onViewProof}
        disabled={!reservation.payment_proof_url}
      >
        <ReceiptText size={15} color={reservation.payment_proof_url ? colors.primary : appColors.onSurfaceVariant} />
        <Text style={[styles.proofButtonText, { color: reservation.payment_proof_url ? colors.primary : appColors.onSurfaceVariant }]}>
          View Payment Screenshot
        </Text>
      </Pressable>

      {canApprove ? (
        <Pressable style={styles.approveButton} onPress={onApprove} disabled={approving}>
          <CheckCircle2 size={16} color={colors.white} />
          <Text style={styles.approveText}>{approving ? 'Approving...' : 'Approve / Confirm Reservation'}</Text>
        </Pressable>
      ) : (
        <View style={styles.approvedPanel}>
          <CheckCircle2 size={17} color={colors.success} />
          <Text style={styles.approvedText}>The guest will see this reservation as approved in their notifications.</Text>
        </View>
      )}
    </View>
  );
}

function Detail({ label, value, appColors }: { label: string; value: string; appColors: typeof colors }) {
  return (
    <View style={styles.detailItem}>
      <Text style={[styles.detailLabel, { color: appColors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: appColors.onSurface }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  gateScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  gateCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.card,
  },
  gateIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  gateTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
  },
  gateCopy: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '700',
  },
  gateInput: {
    minHeight: 52,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '66',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  gateButton: {
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  gateButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
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
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '700',
  },
  accountCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  accountTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  storeIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  accountMeta: {
    marginTop: 3,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  ownerMeta: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '800',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    minHeight: 84,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  gcashPanel: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  panelCopy: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  panelText: {
    marginTop: 2,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
  },
  feeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  settingsCard: {
    marginTop: spacing.xl,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  settingsTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  settingsSub: {
    marginTop: 2,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
  },
  liveBadge: {
    color: colors.success,
    backgroundColor: colors.successContainer,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  priceEditor: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  priceLabel: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  priceInputRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  currencyPrefix: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  priceInput: {
    flex: 1,
    fontSize: fontSize.xl,
    fontWeight: '900',
    paddingVertical: spacing.xs,
  },
  tableList: {
    gap: spacing.sm,
  },
  tableRow: {
    minHeight: 74,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  tableCopy: {
    flex: 1,
    minWidth: 0,
  },
  tableTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  tableMeta: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  tableStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCount: {
    minWidth: 22,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  saveSettingsButton: {
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  saveSettingsText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  disabledButton: {
    opacity: 0.6,
  },
  statusPanel: {
    marginTop: spacing.xl,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  noteTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  sectionSub: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  emptyCopy: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '700',
  },
  notificationCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  notificationTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  pendingBadge: {
    color: colors.primary,
    backgroundColor: colors.primary + '12',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  approvedBadge: {
    color: colors.success,
    backgroundColor: colors.successContainer,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  detailItem: {
    width: '48%',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    padding: spacing.md,
    gap: 3,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '900',
  },
  proofButton: {
    minHeight: 46,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  proofButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  approveButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  approveText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  approvedPanel: {
    borderRadius: radius.lg,
    backgroundColor: colors.successContainer,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  approvedText: {
    flex: 1,
    color: colors.success,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  approvalActionsPanel: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  actionPanelTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  actionPanelSub: {
    marginTop: 2,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
  },
  approvalActionList: {
    gap: spacing.md,
  },
  approvalActionCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  approvalActionTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  approvalActionTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  approvalActionDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  approvalButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  approvalProofButton: {
    flex: 0.8,
  },
  approvalConfirmButton: {
    flex: 1.2,
  },
  noApprovalCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  noApprovalText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  secondaryButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  signOutButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  signOutText: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
