import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, BellRing, Calendar, CheckCircle2, Users } from 'lucide-react-native';
import { AppButton } from '../../src/components/AppButton';
import { ReservationTermsCard } from '../../src/components/ReservationTermsCard';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors } from '../../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../../src/constants/design';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { reservationService } from '../../src/services/reservationService';
import type { Reservation } from '../../src/types';
import {
  formatGuestCount,
  formatReservationDateTime,
  getPaymentStatusLabel,
  getReservationBookingId,
  getReservationStatusLabel,
  getReservationTypeLabel,
  getReservationUniqueId,
} from '../../src/utils/reservations';

function formatAccountName(name?: string | null, email?: string | null) {
  const value = name?.trim() || email?.split('@')[0] || 'Not provided';
  return value === 'Not provided' ? value : value.toUpperCase();
}

function DetailRow({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailLabelRow}>
        {icon}
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={[styles.detailValue, accent && styles.amount]}>{value}</Text>
    </View>
  );
}

export default function BookingConfirmedScreen() {
  const { id } = useLocalSearchParams<{ id: string; paymentReturn?: string }>();
  const router = useRouter();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTerms, setShowTerms] = useState(true);
  const confirmationColors = { ...colors, surface: colors.primary };

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        setReservation(await reservationService.getReservationById(id));
      } catch (error) {
        console.error('Unable to load reservation:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  useEffect(() => {
    const shouldRefreshPayment =
      id && reservation?.payment_method === 'paymongo_gcash' && reservation.payment_status === 'pending';
    if (!shouldRefreshPayment) return;

    const interval = setInterval(async () => {
      try {
        const latest = await reservationService.getReservationById(id);
        if (latest) setReservation(latest);
      } catch (error) {
        console.error('Unable to refresh reservation payment:', error);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [id, reservation?.payment_method, reservation?.payment_status]);

  if (loading || !reservation) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={colors.primary} size="large" />
          ) : (
            <>
              <Text style={[styles.missing, { color: appColors.onSurface }]}>Reservation not found</Text>
              <AppButton label="Back to Explore" onPress={() => router.replace('/')} />
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const requiresPayment = reservation.payment_required || reservation.reservation_type === 'paid';
  const isPaid = reservation.payment_status === 'paid';
  const isPaymongoGcash = reservation.payment_method === 'paymongo_gcash';
  const hasSubmittedPayment = Boolean(reservation.payment_reference || reservation.payment_proof_url || isPaymongoGcash);
  const customerName = formatAccountName(profile?.display_name, profile?.email);
  const customerEmail = profile?.email || 'Not provided';
  const customerPhone = reservation.payer_gcash_number || 'Not provided';
  const tableNumber = reservation.table_id || 'Not provided';
  const bookingId = getReservationBookingId(reservation);
  const uniqueId = getReservationUniqueId(reservation);
  const guestCount = formatGuestCount(reservation.guest_count ?? reservation.guests);
  const dateTime = formatReservationDateTime(reservation);
  const title = requiresPayment
    ? isPaid
      ? 'Reservation Confirmed'
      : isPaymongoGcash
      ? 'Payment Processing'
      : hasSubmittedPayment
      ? 'Payment Under Review'
      : 'Reservation Pending Payment'
    : 'Reservation Confirmed';
  const subtitle = requiresPayment
    ? isPaid
      ? 'Your payment was confirmed. Your reservation details are ready.'
      : isPaymongoGcash
      ? 'Finish the GCash checkout. This page will update once PayMongo confirms the payment.'
      : hasSubmittedPayment
      ? 'Your GCash details were submitted. The spot owner will confirm the payment before final approval.'
      : 'Your reservation has been created. Please complete the reservation fee payment to secure your booking.'
    : 'Your booking is confirmed. Keep these reservation details for your visit.';

  return (
    <ScreenContainer appColors={confirmationColors} scroll padded>
      <View style={styles.successTop}>
        <View style={styles.successIcon}>
          <CheckCircle2 size={44} color={colors.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.ticket}>
        <View style={styles.detailGrid}>
          <DetailRow label="Spot" value={reservation.spot_name} />
          <DetailRow label="Status" value={getReservationStatusLabel(reservation.status)} />

          <View style={styles.sectionDivider} />
          <Text style={styles.sectionTitle}>Personal Details</Text>
          <DetailRow label="Name" value={customerName} />
          <DetailRow label="E-mail" value={customerEmail} />
          <DetailRow label="Phone" value={customerPhone} />

          <View style={styles.sectionDivider} />
          <Text style={styles.sectionTitle}>Booking Details</Text>
          <DetailRow label="Date & Time" value={dateTime} icon={<Calendar size={14} color={colors.primary} />} />
          <DetailRow label="Table" value={tableNumber} />
          <DetailRow label="Party" value={guestCount} icon={<Users size={14} color={colors.primary} />} />
          <DetailRow label="Booking ID" value={bookingId} />
          <DetailRow label="Unique ID" value={uniqueId} />

          <View style={styles.sectionDivider} />
          <DetailRow label="Reservation Type" value={getReservationTypeLabel(reservation)} accent />
          <DetailRow label="Payment" value={getPaymentStatusLabel(reservation.payment_status)} accent={requiresPayment} />
          {requiresPayment && (
            <View style={styles.paymentNotice}>
              <Text style={styles.paymentNoticeText}>
                {isPaid
                  ? 'Payment confirmed. Your reservation is ready for verification at the venue.'
                  : isPaymongoGcash
                  ? 'Complete the PayMongo GCash checkout. CebSpot will confirm this reservation automatically after PayMongo reports the payment as paid.'
                  : hasSubmittedPayment
                  ? 'Payment proof submitted. Your reservation will remain pending until the owner verifies the GCash transfer.'
                  : 'Please pay the reservation fee directly to the spot owner or cashier. Your reservation will remain pending until confirmed.'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {showTerms && (
        <ReservationTermsCard appColors={appColors} onContinue={() => setShowTerms(false)} />
      )}

      <View style={styles.actions}>
        <AppButton
          label="Reservations"
          variant="secondary"
          onPress={() => router.replace('/reservations')}
          icon={<BellRing size={16} color={colors.primary} />}
          style={styles.actionButton}
        />
        <AppButton
          label="Explore"
          onPress={() => router.replace('/')}
          icon={<ArrowRight size={16} color={colors.white} />}
          style={styles.actionButton}
        />
      </View>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  missing: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  successTop: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  successIcon: {
    width: 78,
    height: 78,
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadow.lifted,
  },
  title: {
    color: colors.white,
    fontSize: fontSize.display,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.white,
    opacity: 0.82,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  ticket: {
    backgroundColor: colors.white,
    borderRadius: 38,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.lifted,
  },
  detailGrid: {
    width: '100%',
    gap: spacing.md,
  },
  detail: {
    gap: 3,
  },
  detailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailLabel: {
    color: colors.onSurfaceVariant,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  detailValue: {
    color: colors.onSurface,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  amount: {
    color: colors.primary,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.outlineVariant + '66',
    marginVertical: spacing.xs,
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: spacing.xs,
  },
  paymentNotice: {
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.primary + '10',
  },
  paymentNoticeText: {
    color: colors.onSurfaceVariant,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
