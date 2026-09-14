import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, CheckCircle2, Clock3, ExternalLink, Upload, WalletCards } from 'lucide-react-native';
import { AppButton } from '../../src/components/AppButton';
import { ConfirmationModal } from '../../src/components/ConfirmationModal';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { clubTableDisplayName } from '../../src/constants/clubFloorPlan';
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
  walletName: 'Test Cebspot Club',
  amount: 150,
};

const testCebspotSpotId = '66666666-6666-4666-8666-666666666666';
const paymongoGcashEnabled = process.env.EXPO_PUBLIC_PAYMONGO_GCASH_ENABLED === 'true';
const paymongoQrphEnabled = process.env.EXPO_PUBLIC_PAYMONGO_QRPH_ENABLED !== 'false';

type PaymentMode = 'qrph' | 'gcash_direct' | 'manual_gcash';

const depositTerms = 'By continuing with your booking, you agree and understand you must provide a 50%, non refundable down payment immediately after making a reservation to secure and guarantee booking. Guests not arriving at their assigned show up time will forfeit their table and deposit.';

function isTestCebspotSpot(name: string) {
  return name.toLowerCase().includes('test cebspot');
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
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [guestPhone, setGuestPhone] = useState('');
  const [paymentTermsAccepted, setPaymentTermsAccepted] = useState(false);
  const [payerGcashNumber, setPayerGcashNumber] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<string | null>(null);
  const [paymentConfirmationOpen, setPaymentConfirmationOpen] = useState(false);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);

  const spotId = params.id;
  const spotName = params.spotName ?? spot?.name ?? 'CebSpot Venue';
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const time = params.time ?? '18:00';
  const timeEnd = params.timeEnd ?? null;
  const guests = Number(params.guests ?? 1);
  const tableId = params.tableId ?? null;
  const tableDisplayName = tableId ? clubTableDisplayName(tableId) : 'Table not selected';
  const slotId = params.slotId ?? null;
  const groupSizeType = params.groupSizeType ?? null;
  const adjustmentAcknowledged = params.adjustmentAcknowledged === 'true';
  const adjustmentAcknowledgedAt = params.adjustmentAcknowledgedAt ?? null;
  const parsedReservationFee = Number(params.fee ?? 0);
  const reservationFee = Number.isFinite(parsedReservationFee) ? parsedReservationFee : 0;
  const note = params.note?.trim() || null;
  const usingTestDetails = isTestCebspotSpot(spotName);
  const parsedHoldExpiresAt = Number(params.holdExpiresAt ?? 0);
  const holdExpiresAt = Number.isFinite(parsedHoldExpiresAt) ? parsedHoldExpiresAt : 0;
  const [holdSecondsRemaining, setHoldSecondsRemaining] = useState(() => getHoldSecondsRemaining(holdExpiresAt));
  const holdExpired = holdExpiresAt > 0 && holdSecondsRemaining <= 0;
  const customerName = useMemo(() => {
    const legalName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    return legalName || profile?.display_name?.trim() || profile?.email?.split('@')[0] || 'Profile name unavailable';
  }, [profile?.display_name, profile?.email, profile?.first_name, profile?.last_name]);
  const customerEmail = profile?.email?.trim() || 'Profile email unavailable';
  const normalizedGuestPhone = guestPhone.replace(/[^0-9+]/g, '');
  const contactDetailsComplete = Boolean(
    profile && customerName !== 'Profile name unavailable' && customerEmail !== 'Profile email unavailable' && normalizedGuestPhone.replace(/\D/g, '').length >= 10,
  );
  const paymentAccessGranted = contactDetailsComplete && paymentTermsAccepted;

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
  const qrphEnabled =
    paymongoQrphEnabled &&
    total >= 1 &&
    (usingTestDetails || params.paymentRequired === 'true' || params.reservationType === 'paid');
  const gcashDirectEnabled = paymongoGcashEnabled && usingTestDetails;
  const isQrphPayment = paymentMode === 'qrph' && qrphEnabled;
  const isGcashDirectPayment = paymentMode === 'gcash_direct' && gcashDirectEnabled;
  const isAutomatedPayment = isQrphPayment || isGcashDirectPayment;

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

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (loading) return true;
      setExitConfirmationOpen(true);
      return true;
    });

    return () => subscription.remove();
  }, [loading]);

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

    if (!contactDetailsComplete) {
      Alert.alert('Phone number required', 'Enter a valid phone number so the spot can verify and contact you about this booking.');
      return false;
    }

    if (!paymentTermsAccepted) {
      Alert.alert('Terms required', 'Read and accept the deposit and no-show terms before choosing a payment method.');
      return false;
    }

    if (!paymentMode) {
      Alert.alert('Payment method required', 'Choose how you want to pay the reservation deposit.');
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
      throw new Error('This table was just booked by someone else. Please return to the floor plan and choose another table.');
    }

    const reservationCode = `CEBSPOT-${Date.now()}`;
    return reservationService.createReservation({
      user_id: profile.id,
      guest_name: customerName,
      guest_email: customerEmail,
      guest_phone: normalizedGuestPhone,
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
      payment_terms_accepted: true,
      payment_terms_accepted_at: new Date().toISOString(),
      qr_code: reservationCode,
    });
  }

  async function confirmDirectPayment() {
    if (!validateCheckoutBase() || !profile) return;

    let createdReservationId: string | null = null;
    try {
      setLoading(true);
      const reservation = await createPaidReservation({
        payment_method: 'paymongo_gcash',
        payment_reference: null,
        payment_proof_url: null,
        payer_gcash_number: null,
      });
      createdReservationId = reservation.id;
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
      console.error('PayMongo GCash checkout error:', error);
      if (createdReservationId) {
        try {
          await reservationService.voidUnpaidReservation(createdReservationId, 'PayMongo checkout was not completed.');
        } catch (voidError) {
          console.error('Unable to void failed GCash checkout reservation:', voidError);
        }
      }
      Alert.alert('GCash checkout failed', error.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmQrphPayment() {
    if (!validateCheckoutBase() || !profile) return;

    let createdReservationId: string | null = null;
    try {
      setLoading(true);
      const reservation = await createPaidReservation({
        payment_method: 'paymongo_qrph',
        payment_reference: null,
        payment_proof_url: null,
        payer_gcash_number: null,
      });
      createdReservationId = reservation.id;
      const successUrl = ExpoLinking.createURL(`/confirmed/${reservation.id}`, {
        queryParams: { paymentReturn: 'success' },
      });
      const cancelUrl = ExpoLinking.createURL(`/confirmed/${reservation.id}`, {
        queryParams: { paymentReturn: 'cancel' },
      });
      const checkout = await paymongoCheckoutService.createQrphCheckout({
        reservationId: reservation.id,
        successUrl,
        cancelUrl,
      });

      await Linking.openURL(checkout.checkoutUrl);
      router.replace({ pathname: '/confirmed/[id]', params: { id: reservation.id, paymentReturn: 'pending' } });
    } catch (error: any) {
      console.error('PayMongo checkout error:', error);
      if (createdReservationId) {
        try {
          await reservationService.voidUnpaidReservation(createdReservationId, 'PayMongo checkout was not completed.');
        } catch (voidError) {
          console.error('Unable to void failed QR Ph checkout reservation:', voidError);
        }
      }
      Alert.alert('QR Ph checkout failed', error.message ?? 'Please try again.');
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
    if (isGcashDirectPayment) {
      confirmDirectPayment();
      return;
    }

    if (isQrphPayment) {
      confirmQrphPayment();
      return;
    }

    confirmManualPayment();
  }

  function requestPaymentConfirmation() {
    if (loading) return;

    const valid = isAutomatedPayment ? validateCheckoutBase() : validatePaymentDetails();
    if (valid) setPaymentConfirmationOpen(true);
  }

  function confirmPaymentFromModal() {
    setPaymentConfirmationOpen(false);
    confirmPayment();
  }

  function requestExit() {
    if (loading) return;
    setExitConfirmationOpen(true);
  }

  function exitCheckout() {
    setExitConfirmationOpen(false);
    router.back();
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
    <>
      <ScreenContainer appColors={appColors} scroll>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Exit checkout"
          accessibilityRole="button"
          disabled={loading}
          style={[styles.backButton, { backgroundColor: appColors.surfaceRaised }, loading && styles.disabledButton]}
          onPress={requestExit}
        >
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: appColors.onSurface }]}>Reservation Payment</Text>
          <Text style={[styles.headerSub, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
            {spotName}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {holdExpiresAt > 0 && (
        <View
          style={[
            styles.holdTimerCard,
            {
              backgroundColor: holdExpired ? appColors.dangerContainer : appColors.surfaceRaised,
              borderColor: holdExpired ? appColors.danger + '66' : colors.primary + '24',
            },
          ]}
        >
          <Clock3 size={20} color={holdExpired ? colors.danger : colors.primary} />
          <View style={styles.holdTimerCopy}>
            <Text style={[styles.holdTimerLabel, { color: appColors.onSurfaceVariant }]}>TABLE HOLD</Text>
            <Text style={[styles.holdTimerValue, holdExpired && styles.holdTimerExpiredText]}>
              {holdExpired ? 'Expired' : formatHoldTime(holdSecondsRemaining)}
            </Text>
            <Text style={[styles.holdTimerNote, { color: appColors.onSurfaceVariant }]}>
              {holdExpired
                ? 'Return to the reservation page to choose this table again.'
                : 'Submit your payment details before this hold ends.'}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.checkoutDetailsStack}>
        <View style={[styles.checkoutDetailsCard, { backgroundColor: appColors.surfaceRaised }]}>
          <Text style={[styles.bookingReferenceLabel, { color: appColors.onSurfaceVariant }]}>PERSONAL INFORMATION</Text>
          <View style={styles.checkoutDetailRow}>
            <Text style={[styles.checkoutDetailLabel, { color: appColors.onSurfaceVariant }]}>Full name</Text>
            <Text style={[styles.checkoutDetailValue, { color: appColors.onSurface }]}>{customerName}</Text>
          </View>
          <View style={styles.checkoutDetailRow}>
            <Text style={[styles.checkoutDetailLabel, { color: appColors.onSurfaceVariant }]}>Email</Text>
            <Text style={[styles.checkoutDetailValue, { color: appColors.onSurface }]}>{customerEmail}</Text>
          </View>
          <View style={styles.checkoutPhoneField}>
            <Text style={[styles.checkoutDetailLabel, { color: appColors.onSurfaceVariant }]}>Phone</Text>
            <TextInput
              value={guestPhone}
              onChangeText={setGuestPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={18}
              placeholder="09XXXXXXXXX"
              placeholderTextColor={appColors.onSurfaceVariant + '88'}
              style={[
                styles.input,
                {
                  borderColor: guestPhone && !contactDetailsComplete ? colors.danger : appColors.outlineVariant,
                  color: appColors.onSurface,
                  backgroundColor: appColors.surfaceLow,
                },
              ]}
            />
            <Text style={[styles.checkoutFieldHelp, { color: appColors.onSurfaceVariant }]}>Used by the spot to verify and contact you about this reservation.</Text>
          </View>
        </View>

        <View style={[styles.checkoutDetailsCard, { backgroundColor: appColors.surfaceRaised }]}>
          <Text style={[styles.bookingReferenceLabel, { color: appColors.onSurfaceVariant }]}>BOOKING DETAILS</Text>
          {[
            ['Spot', spotName],
            ['Date', date],
            ['Show-up time', `${time}${timeEnd ? ` - ${timeEnd}` : ''}`],
            ['Table', tableDisplayName],
            ['Party size', `${guests} ${guests === 1 ? 'guest' : 'guests'}`],
            ['Required deposit', formatPeso(total)],
          ].map(([label, value]) => (
            <View key={label} style={styles.checkoutDetailRow}>
              <Text style={[styles.checkoutDetailLabel, { color: appColors.onSurfaceVariant }]}>{label}</Text>
              <Text style={[styles.checkoutDetailValue, { color: appColors.onSurface }]}>{value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.termsAcceptanceCard, { backgroundColor: appColors.surfaceRaised }]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="Accept reservation terms and conditions"
          accessibilityState={{ checked: paymentTermsAccepted, disabled: !contactDetailsComplete }}
          disabled={!contactDetailsComplete}
          hitSlop={8}
          onPress={() => setPaymentTermsAccepted((current) => !current)}
          style={[
            styles.termsCheckbox,
            paymentTermsAccepted && styles.termsCheckboxChecked,
            !contactDetailsComplete && styles.termsCheckboxDisabled,
          ]}
        >
          {paymentTermsAccepted ? <Check size={16} color={colors.white} strokeWidth={3} /> : null}
        </Pressable>
        <View style={styles.termsAcceptanceCopy}>
          <Text style={[styles.termsAcceptanceText, { color: appColors.onSurface }]}>I have read and accept reservation</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Read reservation terms and conditions" onPress={() => setTermsModalOpen(true)}>
            <Text style={[styles.termsLink, { color: appColors.onSurfaceVariant }]}>Terms and Conditions</Text>
          </Pressable>
          {!contactDetailsComplete ? (
            <Text style={styles.termsRequirement}>Enter your phone number before accepting.</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Payment Method</Text>
        {!paymentAccessGranted ? (
          <Text style={[styles.paymentLockedText, { color: appColors.onSurfaceVariant }]}>Complete your information and accept the agreement to unlock payment methods.</Text>
        ) : null}
        <View style={styles.paymentMethodGrid}>
          <Pressable
            accessibilityLabel="Manual GCash payment"
            accessibilityRole="button"
            accessibilityState={{ selected: paymentMode === 'manual_gcash', disabled: !paymentAccessGranted }}
            style={[
              styles.paymentMethodCard,
              !paymentAccessGranted && styles.paymentMethodCardDisabled,
              { backgroundColor: appColors.surfaceRaised, borderColor: paymentMode === 'manual_gcash' ? colors.primary : appColors.outlineVariant },
            ]}
            onPress={() => paymentAccessGranted && setPaymentMode('manual_gcash')}
            disabled={!paymentAccessGranted}
          >
            <Image source={require('../../assets/payments/gcash-logo.png')} style={styles.paymentMethodLogo} resizeMode="contain" />
            <Text style={[styles.paymentMethodName, { color: appColors.onSurface }]}>GCash</Text>
            <Text style={[styles.paymentMethodDescription, { color: appColors.onSurfaceVariant }]}>Manual</Text>
          </Pressable>

          {paymongoGcashEnabled ? (
            <Pressable
              accessibilityLabel="GCash Direct payment"
              accessibilityRole="button"
              accessibilityState={{ selected: paymentMode === 'gcash_direct', disabled: !paymentAccessGranted || !gcashDirectEnabled }}
              style={[
                styles.paymentMethodCard,
                (!paymentAccessGranted || !gcashDirectEnabled) && styles.paymentMethodCardDisabled,
                { backgroundColor: appColors.surfaceRaised, borderColor: paymentMode === 'gcash_direct' ? colors.primary : appColors.outlineVariant },
              ]}
              onPress={() => paymentAccessGranted && gcashDirectEnabled && setPaymentMode('gcash_direct')}
              disabled={!paymentAccessGranted || !gcashDirectEnabled}
            >
              <Image source={require('../../assets/payments/gcash-direct.png')} style={styles.paymentMethodLogo} resizeMode="contain" />
              <Text style={[styles.paymentMethodName, { color: appColors.onSurface }]}>GCash</Text>
              <Text style={[styles.paymentMethodDescription, { color: appColors.onSurfaceVariant }]}>Direct</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityLabel="QR Ph payment"
            accessibilityRole="button"
            accessibilityState={{ selected: paymentMode === 'qrph', disabled: !paymentAccessGranted || !qrphEnabled }}
            style={[
              styles.paymentMethodCard,
              (!paymentAccessGranted || !qrphEnabled) && styles.paymentMethodCardDisabled,
              { backgroundColor: appColors.surfaceRaised, borderColor: paymentMode === 'qrph' ? colors.primary : appColors.outlineVariant },
            ]}
            onPress={() => paymentAccessGranted && qrphEnabled && setPaymentMode('qrph')}
            disabled={!paymentAccessGranted || !qrphEnabled}
          >
            <Image source={require('../../assets/payments/qrph-logo.png')} style={styles.paymentMethodLogo} resizeMode="contain" />
            <Text style={[styles.paymentMethodName, { color: appColors.onSurface }]}>QR Ph</Text>
            <Text style={[styles.paymentMethodDescription, { color: appColors.onSurfaceVariant }]}>Scan to pay</Text>
          </Pressable>
        </View>
      </View>

      {!paymentAccessGranted || !paymentMode ? (
        <View style={[styles.paymentWaitingCard, { backgroundColor: appColors.surfaceLow }]}>
          <WalletCards size={24} color={appColors.onSurfaceVariant} />
          <Text style={[styles.paymentWaitingText, { color: appColors.onSurfaceVariant }]}>
            {paymentAccessGranted ? 'Choose a payment method to continue.' : 'Payment options will appear after the required acknowledgement.'}
          </Text>
        </View>
      ) : isAutomatedPayment ? (
        <View style={styles.section}>
          <View style={[styles.directCheckoutCard, { backgroundColor: appColors.surfaceRaised }]}>
            <View style={styles.directCheckoutIcon}>
              <WalletCards size={28} color={colors.white} />
            </View>
            <View style={styles.directCheckoutCopy}>
              <Text style={[styles.directCheckoutTitle, { color: appColors.onSurface }]}>
                {isQrphPayment ? 'PayMongo QR Ph Checkout' : 'PayMongo GCash Checkout'}
              </Text>
              <Text style={[styles.directCheckoutText, { color: appColors.onSurfaceVariant }]}>
                {isQrphPayment
                  ? 'The amount is locked for this reservation. You will be redirected to PayMongo to scan the QR Ph code and finish the payment.'
                  : 'The amount is locked for this reservation. You will be redirected to GCash through PayMongo to finish the payment.'}
              </Text>
            </View>
            <View style={[styles.amountBox, styles.directAmountBox, { backgroundColor: colors.primary + '10' }]}>
              <Text style={styles.directAmountLabel}>Total</Text>
              <Text style={styles.directAmountValue}>{formatPeso(total)}</Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Owner GCash Details</Text>
            <View style={[styles.gcashCard, { backgroundColor: appColors.surfaceRaised }]}>
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
            <View style={[styles.formCard, { backgroundColor: appColors.surfaceRaised }]}>
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
            : !contactDetailsComplete
              ? 'Complete Personal Information'
              : !paymentTermsAccepted
                ? 'Accept Deposit Terms'
                : !paymentMode
                  ? 'Choose a Payment Method'
            : loading
              ? isAutomatedPayment
                ? isQrphPayment ? 'Opening QR Ph' : 'Opening GCash'
                : 'Submitting Payment'
              : isAutomatedPayment
                ? isQrphPayment ? 'Continue to QR Ph' : 'Continue to GCash'
                : 'Confirm Payment Details'
        }
        loading={loading}
        disabled={holdExpired || !paymentAccessGranted || !paymentMode}
        onPress={requestPaymentConfirmation}
        icon={!loading && paymentMode ? isAutomatedPayment ? <ExternalLink size={16} color={colors.white} /> : <CheckCircle2 size={16} color={colors.white} /> : undefined}
      />
      </ScreenContainer>

      <ConfirmationModal
        visible={termsModalOpen}
        title="Reservation Terms and Conditions"
        message={depositTerms}
        onRequestClose={() => setTermsModalOpen(false)}
        actions={[
          {
            label: 'Close',
            variant: 'primary',
            onPress: () => setTermsModalOpen(false),
          },
        ]}
      />

      <ConfirmationModal
        visible={paymentConfirmationOpen}
        title={isAutomatedPayment ? 'Continue to payment?' : 'Confirm booking and payment?'}
        message={
          isAutomatedPayment
            ? `You are about to reserve ${spotName} for ${date} at ${time}. The table will be held while you complete the ${isQrphPayment ? 'QR Ph' : 'GCash'} payment.`
            : `Your booking and payment details will be submitted to ${spotName} for manual verification. Please confirm that the information and payment proof are correct.`
        }
        onRequestClose={() => setPaymentConfirmationOpen(false)}
        actions={[
          {
            label: 'Review again',
            onPress: () => setPaymentConfirmationOpen(false),
          },
          {
            label: isAutomatedPayment ? 'Continue to payment' : 'Confirm booking',
            variant: 'primary',
            onPress: confirmPaymentFromModal,
          },
        ]}
      />

      <ConfirmationModal
        visible={exitConfirmationOpen}
        title="Cancel this process?"
        message="Are you sure you want to exit? Doing so will automatically cancel this process and release the table for people who are waiting or want to reserve it."
        onRequestClose={() => setExitConfirmationOpen(false)}
        actions={[
          {
            label: 'Stay here',
            onPress: () => setExitConfirmationOpen(false),
          },
          {
            label: 'Exit and cancel',
            variant: 'destructive',
            onPress: exitCheckout,
          },
        ]}
      />
    </>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  holdTimerExpired: {
  },
  holdTimerCopy: {
    flex: 1,
  },
  holdTimerLabel: {
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
    fontSize: fontSize.xs,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 2,
  },
  checkoutDetailsStack: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  checkoutDetailsCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    ...shadow.card,
  },
  bookingReferenceLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  checkoutDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  checkoutDetailLabel: {
    flex: 0.42,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  checkoutDetailValue: {
    flex: 0.58,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textAlign: 'right',
  },
  checkoutPhoneField: {
    gap: spacing.xs,
  },
  checkoutFieldHelp: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
  },
  termsAcceptanceCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  termsCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsCheckboxChecked: {
    backgroundColor: colors.primary,
  },
  termsCheckboxDisabled: {
    opacity: 0.45,
  },
  termsAcceptanceCopy: {
    flex: 1,
  },
  termsAcceptanceText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '600',
  },
  termsLink: {
    alignSelf: 'flex-start',
    fontSize: fontSize.sm,
    lineHeight: 21,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  termsRequirement: {
    color: colors.danger,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  paymentLockedText: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  paymentWaitingCard: {
    minHeight: 100,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  paymentWaitingText: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  paymentMethodGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  paymentMethodCard: {
    flex: 1,
    minHeight: 118,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    ...shadow.card,
  },
  disabledButton: {
    opacity: 0.5,
  },
  paymentMethodCardDisabled: {
    opacity: 0.48,
  },
  paymentMethodLogo: {
    width: 78,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    marginBottom: spacing.xs,
  },
  paymentMethodName: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    textAlign: 'center',
  },
  paymentMethodDescription: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textAlign: 'center',
  },
  directCheckoutCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.card,
  },
  directCheckoutIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directCheckoutCopy: {
    flex: 1,
    gap: 2,
    alignItems: 'flex-start',
  },
  directCheckoutTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
    textAlign: 'left',
  },
  directCheckoutText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'left',
  },
  directAmountBox: {
    minWidth: 82,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  directAmountLabel: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  directAmountValue: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '900',
    marginTop: 1,
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
