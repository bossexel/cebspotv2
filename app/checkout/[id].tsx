import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Camera, CheckCircle2, Clock3, ExternalLink, ShieldCheck, Upload, WalletCards } from 'lucide-react-native';
import { AppButton } from '../../src/components/AppButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors } from '../../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../../src/constants/design';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { paymentProofService } from '../../src/services/paymentProofService';
import { paymongoCheckoutService } from '../../src/services/paymongoCheckoutService';
import { reservationService } from '../../src/services/reservationService';
import { spotService } from '../../src/services/spotService';
import type { NewReservation, Spot } from '../../src/types';
import { checkReservationAvailability } from '../../src/utils/reservations';

const testCebspotPaymentDetails = {
  walletNumber: '0917 555 0198',
  walletName: 'Test Cebspot Restaurant',
  amount: 150,
};

const testCebspotSpotId = '66666666-6666-4666-8666-666666666666';

function isTestCebspotSpot(name: string) {
  const normalized = name.toLowerCase();
  return normalized.includes('test cebspot') || normalized.includes('test cebspot restaurant');
}

function formatPeso(amount: number) {
  return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getHoldSecondsRemaining(holdExpiresAt: number) {
  if (!holdExpiresAt) return 0;

  return Math.max(0, Math.ceil((holdExpiresAt - Date.now()) / 1000));
}

function formatHoldTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    spotName?: string;
    date?: string;
    time?: string;
    timeEnd?: string;
    guests?: string;
    tableId?: string;
    slotId?: string;
    groupSizeType?: string;
    adjustmentAcknowledged?: string;
    adjustmentAcknowledgedAt?: string;
    fee?: string;
    note?: string;
    reservationType?: string;
    paymentRequired?: string;
    holdExpiresAt?: string;
  }>();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [loadingSpot, setLoadingSpot] = useState(true);
  const [loading, setLoading] = useState(false);
  const [payerGcashNumber, setPayerGcashNumber] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<string | null>(null);

  const spotId = params.id;
  const spotName = params.spotName ?? spot?.name ?? 'CebSpot Venue';
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const time = params.time ?? '18:00';
  const timeEnd = params.timeEnd ?? null;
  const guests = Number(params.guests ?? 1);
  const tableId = params.tableId ?? null;
  const slotId = params.slotId ?? null;
  const groupSizeType = params.groupSizeType ?? null;
  const adjustmentAcknowledged = params.adjustmentAcknowledged === 'true';
  const adjustmentAcknowledgedAt = params.adjustmentAcknowledgedAt ?? null;
  const parsedReservationFee = Number(params.fee ?? 0);
  const reservationFee = Number.isFinite(parsedReservationFee) ? parsedReservationFee : 0;
  const note = params.note?.trim() || null;
  const usingTestDetails = isTestCebspotSpot(spotName);
  const directGcashEnabled = usingTestDetails;
  const parsedHoldExpiresAt = Number(params.holdExpiresAt ?? 0);
  const holdExpiresAt = Number.isFinite(parsedHoldExpiresAt) ? parsedHoldExpiresAt : 0;
  const [holdSecondsRemaining, setHoldSecondsRemaining] = useState(() => getHoldSecondsRemaining(holdExpiresAt));
  const holdExpired = holdExpiresAt > 0 && holdSecondsRemaining <= 0;

  const paymentDetails = useMemo(
    () => {
      const fallbackAmount = usingTestDetails ? testCebspotPaymentDetails.amount : 0;
      const configuredAmount = Number(spot?.gcash_amount ?? spot?.reservation_fee ?? reservationFee ?? fallbackAmount);
      const amount = configuredAmount > 0 ? configuredAmount : fallbackAmount;

      return {
        walletNumber: spot?.gcash_wallet_number ?? (usingTestDetails ? testCebspotPaymentDetails.walletNumber : null),
        walletName: spot?.gcash_wallet_name ?? (usingTestDetails ? testCebspotPaymentDetails.walletName : null),
        amount: Math.max(0, Number.isFinite(amount) ? amount : 0),
      };
    },
    [reservationFee, spot, usingTestDetails]
  );
  const total = paymentDetails.amount;
  const hasOwnerPaymentDetails = Boolean(paymentDetails.walletNumber && paymentDetails.walletName);

  useEffect(() => {
    let active = true;
    const unsubscribe = spotId
      ? spotService.subscribeToSpotById(spotId, (nextSpot) => {
          if (active) setSpot(nextSpot);
        })
      : undefined;

    async function loadSpot() {
      if (!spotId) {
        setLoadingSpot(false);
        return;
      }
      try {
        const nextSpot = await spotService.getSpotById(spotId);
        if (active) setSpot(nextSpot);
      } catch (error) {
        console.error('Unable to load checkout spot:', error);
      } finally {
        if (active) setLoadingSpot(false);
      }
    }

    loadSpot();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [spotId]);

  useEffect(() => {
    if (!holdExpiresAt) return;

    setHoldSecondsRemaining(getHoldSecondsRemaining(holdExpiresAt));
    const interval = setInterval(() => {
      setHoldSecondsRemaining(getHoldSecondsRemaining(holdExpiresAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  async function selectPaymentScreenshot() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setPaymentScreenshot(result.assets[0].uri);
    }
  }

  function validateCheckoutBase() {
    if (holdExpired) {
      Alert.alert('Reservation timer expired', 'Your 5-minute table hold expired. Please start the reservation again.', [
        {
          text: 'Choose table',
          onPress: () => router.replace({ pathname: '/reservation/[id]', params: { id: spotId } }),
        },
      ]);
      return false;
    }

    if (!adjustmentAcknowledged) {
      Alert.alert(
        'Acknowledgement needed',
        'Please acknowledge the reservation adjustment conditions before confirming.'
      );
      return false;
    }

    if (!profile) {
      Alert.alert('Authentication required', 'Please sign in again to complete this reservation.');
      return false;
    }

    if (total <= 0) {
      Alert.alert('Missing amount', 'The owner has not set a reservation payment amount for this spot yet.');
      return false;
    }

    return true;
  }

  function validatePaymentDetails() {
    if (!validateCheckoutBase()) return false;

    if (!hasOwnerPaymentDetails) {
      Alert.alert(
        'GCash details unavailable',
        'This spot has not published owner GCash payment details yet. Please contact the venue before booking.'
      );
      return false;
    }

    if (!payerGcashNumber.trim()) {
      Alert.alert('GCash account number required', 'Enter the GCash account number you used for the payment.');
      return false;
    }

    if (!paymentScreenshot) {
      Alert.alert('Payment screenshot required', 'Upload a screenshot of your completed GCash transfer.');
      return false;
    }

    if (!transactionReference.trim()) {
      Alert.alert('Transaction reference required', 'Enter the GCash reference number from your receipt.');
      return false;
    }

    return true;
  }

  async function createPaidReservation(paymentFields: Partial<NewReservation>) {
    if (!profile) throw new Error('Authentication required.');

    const available = await checkReservationAvailability({
      spotId,
      reservationDate: date,
      slotId,
      tableId,
    });
    if (!available) {
      throw new Error('This table was just booked by someone else. Please choose another available slot.');
    }

    const reservationCode = `CEBSPOT-${Date.now()}`;
    return reservationService.createReservation({
      user_id: profile.id,
      spot_id: spotId,
      spot_name: spotName,
      reservation_date: date,
      reservation_time: time,
      reservation_time_start: time,
      reservation_time_end: timeEnd,
      guest_count: guests,
      guests,
      table_id: tableId,
      slot_id: slotId,
      group_size_type: groupSizeType,
      note,
      fee: total,
      reservation_type: 'paid',
      reservation_fee: total,
      payment_required: true,
      status: 'pending_payment',
      payment_status: 'pending',
      payment_method: paymentFields.payment_method ?? 'gcash',
      payment_reference: paymentFields.payment_reference ?? null,
      payment_proof_url: paymentFields.payment_proof_url ?? null,
      payer_gcash_number: paymentFields.payer_gcash_number ?? null,
      refund_status: 'not_applicable',
      adjustment_acknowledged: true,
      adjustment_acknowledged_at: adjustmentAcknowledgedAt ?? new Date().toISOString(),
      qr_code: reservationCode,
    });
  }

  async function confirmDirectPayment() {
    if (!validateCheckoutBase() || !profile) return;

    try {
      setLoading(true);
      const reservation = await createPaidReservation({
        payment_method: 'paymongo_gcash',
        payment_reference: null,
        payment_proof_url: null,
        payer_gcash_number: null,
      });
      const successUrl = ExpoLinking.createURL(`/confirmed/${reservation.id}`, {
        queryParams: { paymentReturn: 'success' },
      });
      const cancelUrl = ExpoLinking.createURL(`/confirmed/${reservation.id}`, {
        queryParams: { paymentReturn: 'cancel' },
      });
      const checkout = await paymongoCheckoutService.createGcashCheckout({
        reservationId: reservation.id,
        successUrl,
        cancelUrl,
      });

      await Linking.openURL(checkout.checkoutUrl);
      router.replace({ pathname: '/confirmed/[id]', params: { id: reservation.id, paymentReturn: 'pending' } });
    } catch (error: any) {
      console.error('PayMongo checkout error:', error);
      Alert.alert('GCash checkout failed', error.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmManualPayment() {
    if (!validatePaymentDetails() || !profile) return;

    try {
      setLoading(true);
      const paymentProofUrl = await paymentProofService.uploadProof(paymentScreenshot as string, profile.id);
      const reservation = await createPaidReservation({
        payment_method: 'gcash',
        payment_reference: transactionReference.trim(),
        payment_proof_url: paymentProofUrl,
        payer_gcash_number: payerGcashNumber.trim(),
      });

      router.replace({ pathname: '/confirmed/[id]', params: { id: reservation.id } });
    } catch (error: any) {
      console.error('Checkout error:', error);
      Alert.alert('Payment confirmation failed', error.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function confirmPayment() {
    if (directGcashEnabled) {
      confirmDirectPayment();
      return;
    }

    confirmManualPayment();
  }

  if (loadingSpot) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer appColors={appColors} scroll>
      <View style={styles.header}>
        <Pressable style={[styles.backButton, { backgroundColor: appColors.white }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: appColors.onSurface }]}>GCash Payment</Text>
          <Text style={[styles.headerSub, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
            {spotName}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {holdExpiresAt > 0 && (
        <View style={[styles.holdTimerCard, holdExpired && styles.holdTimerExpired]}>
          <Clock3 size={20} color={holdExpired ? colors.danger : colors.primary} />
          <View style={styles.holdTimerCopy}>
            <Text style={styles.holdTimerLabel}>TABLE HOLD</Text>
            <Text style={[styles.holdTimerValue, holdExpired && styles.holdTimerExpiredText]}>
              {holdExpired ? 'Expired' : formatHoldTime(holdSecondsRemaining)}
            </Text>
            <Text style={styles.holdTimerNote}>
              {holdExpired
                ? 'Return to the reservation page to choose this table again.'
                : 'Submit your payment details before this hold ends.'}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.heroCard, { backgroundColor: appColors.white }]}>
        <View style={styles.heroIcon}>
          <ShieldCheck size={30} color={colors.white} />
        </View>
        <Text style={[styles.heroTitle, { color: appColors.onSurface }]}>
          {directGcashEnabled ? 'GCash Direct' : 'Secure Transfer'}
        </Text>
        <Text style={[styles.heroCopy, { color: appColors.onSurfaceVariant }]}>
          {directGcashEnabled
            ? 'Continue to the secure PayMongo checkout page and complete the payment with GCash.'
            : 'Send the reservation payment to the owner GCash details below, then submit your proof for owner review.'}
        </Text>
      </View>

      {directGcashEnabled ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Payment Method</Text>
          <View style={[styles.directCheckoutCard, { backgroundColor: appColors.white }]}>
            <View style={styles.directCheckoutIcon}>
              <WalletCards size={28} color={colors.white} />
            </View>
            <View style={styles.directCheckoutCopy}>
              <Text style={[styles.directCheckoutTitle, { color: appColors.onSurface }]}>PayMongo GCash Checkout</Text>
              <Text style={[styles.directCheckoutText, { color: appColors.onSurfaceVariant }]}>
                The amount is locked for this reservation. You will be redirected to GCash through PayMongo to finish the payment.
              </Text>
            </View>
            <View style={[styles.amountBox, { backgroundColor: colors.primary + '10' }]}>
              <Text style={styles.amountLabel}>Amount</Text>
              <Text style={styles.amountValue}>{formatPeso(total)}</Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Owner GCash Details</Text>
            <View style={[styles.gcashCard, { backgroundColor: appColors.white }]}>
              <Text style={styles.gcashBrand}>GCash</Text>

              <View style={styles.noticeStack}>
                <Text style={styles.noticeText}>
                  Transfer the exact reservation amount before confirming your request.
                </Text>
                <Text style={styles.noticeText}>
                  Use the wallet details below, then upload the completed payment receipt for owner verification.
                </Text>
              </View>

              <View style={styles.ownerRows}>
                <View style={styles.ownerRow}>
                  <Text style={[styles.ownerLabel, { color: appColors.onSurfaceVariant }]}>Wallet Number</Text>
                  <Text style={[styles.ownerValue, { color: appColors.onSurface }]}>
                    {paymentDetails.walletNumber ?? 'Not provided'}
                  </Text>
                </View>
                <View style={styles.ownerRow}>
                  <Text style={[styles.ownerLabel, { color: appColors.onSurfaceVariant }]}>Wallet Name</Text>
                  <Text style={[styles.ownerValue, { color: appColors.onSurface }]}>
                    {paymentDetails.walletName ?? 'Not provided'}
                  </Text>
                </View>
              </View>

              <View style={[styles.amountBox, { backgroundColor: colors.primary + '10' }]}>
                <Text style={styles.amountLabel}>Amount</Text>
                <Text style={styles.amountValue}>{formatPeso(total)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Your Payment Details</Text>
            <View style={[styles.formCard, { backgroundColor: appColors.white }]}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: appColors.onSurface }]}>Your GCash Account Number</Text>
                <TextInput
                  value={payerGcashNumber}
                  onChangeText={setPayerGcashNumber}
                  keyboardType="phone-pad"
                  placeholder="09XXXXXXXXX"
                  placeholderTextColor={appColors.onSurfaceVariant + '88'}
                  style={[
                    styles.input,
                    {
                      borderColor: appColors.outlineVariant,
                      color: appColors.onSurface,
                      backgroundColor: appColors.surfaceLow,
                    },
                  ]}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: appColors.onSurface }]}>Payment Screenshot</Text>
                <Pressable
                  style={[styles.uploadBox, { borderColor: appColors.outlineVariant, backgroundColor: appColors.surfaceLow }]}
                  onPress={selectPaymentScreenshot}
                >
                  {paymentScreenshot ? (
                    <Image source={{ uri: paymentScreenshot }} style={styles.proofPreview} resizeMode="cover" />
                  ) : (
                    <View style={styles.uploadEmpty}>
                      <Camera size={22} color={colors.primary} />
                      <Text style={[styles.uploadText, { color: appColors.onSurfaceVariant }]}>Upload receipt image</Text>
                    </View>
                  )}
                  <View style={styles.uploadBadge}>
                    <Upload size={14} color={colors.white} />
                  </View>
                </Pressable>
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: appColors.onSurface }]}>Transaction ID / Reference Number</Text>
                <TextInput
                  value={transactionReference}
                  onChangeText={setTransactionReference}
                  keyboardType="number-pad"
                  placeholder="6 or 13 digits"
                  placeholderTextColor={appColors.onSurfaceVariant + '88'}
                  style={[
                    styles.input,
                    {
                      borderColor: appColors.outlineVariant,
                      color: appColors.onSurface,
                      backgroundColor: appColors.surfaceLow,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </>
      )}

      <View style={styles.section}>
        <View style={[styles.summary, { backgroundColor: appColors.surfaceLow }]}>
          <View style={styles.summaryRow}>
            <WalletCards size={18} color={colors.primary} />
            <View style={styles.summaryCopy}>
              <Text style={[styles.itemName, { color: appColors.onSurface }]}>{spotName}</Text>
              <Text style={[styles.itemSub, { color: appColors.onSurfaceVariant }]}>
                {date} at {time} - {guests} guests
              </Text>
            </View>
            <Text style={styles.summaryAmount}>{formatPeso(total)}</Text>
          </View>
          {!!note && <Text style={[styles.noteText, { color: appColors.onSurfaceVariant }]}>Note: {note}</Text>}
        </View>
      </View>

      <AppButton
        label={
          holdExpired
            ? 'Table Hold Expired'
            : loading
              ? directGcashEnabled
                ? 'Opening GCash'
                : 'Submitting Payment'
              : directGcashEnabled
                ? 'Continue to GCash'
                : 'Confirm Payment Details'
        }
        loading={loading}
        disabled={holdExpired}
        onPress={confirmPayment}
        icon={!loading ? directGcashEnabled ? <ExternalLink size={16} color={colors.white} /> : <CheckCircle2 size={16} color={colors.white} /> : undefined}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  headerCopy: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  headerSub: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: 2,
  },
  headerSpacer: {
    width: 42,
  },
  holdTimerCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '24',
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  holdTimerExpired: {
    borderColor: colors.danger + '40',
    backgroundColor: colors.dangerContainer,
  },
  holdTimerCopy: {
    flex: 1,
  },
  holdTimerLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  holdTimerValue: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginTop: 2,
  },
  holdTimerExpiredText: {
    color: colors.danger,
  },
  holdTimerNote: {
    color: colors.onSurfaceVariant,
    fontSize: fontSize.xs,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 2,
  },
  heroCard: {
    borderRadius: radius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  heroIcon: {
    width: 70,
    height: 70,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroCopy: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '700',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  directCheckoutCard: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    alignItems: 'center',
    ...shadow.card,
  },
  directCheckoutIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directCheckoutCopy: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  directCheckoutTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    textAlign: 'center',
  },
  directCheckoutText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  gcashCard: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  gcashBrand: {
    color: '#0a37c8',
    fontSize: fontSize.display,
    fontWeight: '900',
    textAlign: 'center',
  },
  noticeStack: {
    gap: spacing.sm,
  },
  noticeText: {
    color: colors.white,
    backgroundColor: '#2f7d32',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '800',
  },
  ownerRows: {
    gap: spacing.sm,
  },
  ownerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  ownerLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  ownerValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  amountBox: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountLabel: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  amountValue: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  formCard: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  uploadBox: {
    minHeight: 132,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  uploadEmpty: {
    flex: 1,
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  uploadText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  proofPreview: {
    width: '100%',
    height: 180,
  },
  uploadBadge: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryCopy: {
    flex: 1,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  itemSub: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  summaryAmount: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '900',
    textAlign: 'right',
  },
  noteText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    lineHeight: 17,
  },
});
