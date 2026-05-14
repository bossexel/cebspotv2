import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, CreditCard, ShieldCheck, Ticket } from 'lucide-react-native';
import { AppButton } from '../../src/components/AppButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors } from '../../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../../src/constants/design';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { reservationService } from '../../src/services/reservationService';

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
  }>();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const spotId = params.id;
  const spotName = params.spotName ?? 'CebSpot Venue';
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const time = params.time ?? '18:00';
  const timeEnd = params.timeEnd ?? null;
  const guests = Number(params.guests ?? 1);
  const tableId = params.tableId ?? null;
  const slotId = params.slotId ?? null;
  const groupSizeType = params.groupSizeType ?? null;
  const adjustmentAcknowledged = params.adjustmentAcknowledged === 'true';
  const adjustmentAcknowledgedAt = params.adjustmentAcknowledgedAt ?? null;
  const reservationFee = Number(params.fee ?? 0);
  const note = params.note?.trim() || null;
  const total = Math.max(0, reservationFee);

  async function confirmPayment() {
    if (!adjustmentAcknowledged) {
      Alert.alert(
        'Acknowledgement needed',
        'Please acknowledge the reservation adjustment conditions before confirming.'
      );
      return;
    }

    if (!profile) {
      Alert.alert('Authentication required', 'Please sign in again to complete this reservation.');
      return;
    }

    try {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 900));

      const qrCode = `CEBSPOT-${spotId}-${Date.now()}`;
      const reservation = await reservationService.createReservation({
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
        reservation_fee: reservationFee,
        payment_required: true,
        status: 'pending_payment',
        payment_status: 'pending',
        payment_method: 'direct_to_venue',
        payment_reference: null,
        payment_proof_url: null,
        refund_status: 'not_applicable',
        adjustment_acknowledged: true,
        adjustment_acknowledged_at: adjustmentAcknowledgedAt ?? new Date().toISOString(),
        qr_code: qrCode,
      });

      router.replace({ pathname: '/confirmed/[id]', params: { id: reservation.id } });
    } catch (error: any) {
      console.error('Checkout error:', error);
      Alert.alert('Payment failed', error.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer appColors={appColors} scroll>
      <View style={styles.header}>
        <Pressable style={[styles.backButton, { backgroundColor: appColors.white }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: appColors.onSurface }]}>Checkout</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.heroCard, { backgroundColor: appColors.white }]}>
        <View style={styles.heroIcon}>
          <ShieldCheck size={30} color={colors.white} />
        </View>
        <Text style={[styles.heroTitle, { color: appColors.onSurface }]}> Secure Your Spot</Text>
        <Text style={[styles.heroCopy, { color: appColors.onSurfaceVariant }]}>
          Please pay the reservation fee directly to the spot owner or cashier. Your reservation will remain pending until confirmed.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Order Summary</Text>
        <View style={[styles.summary, { backgroundColor: appColors.surfaceLow }]}>
          <View style={styles.row}>
            <View>
              <Text style={[styles.itemName, { color: appColors.onSurface }]}>{spotName}</Text>
              <Text style={[styles.itemSub, { color: appColors.onSurfaceVariant }]}>
                Fixed reservation fee
              </Text>
            </View>
            <Text style={[styles.value, { color: appColors.onSurface }]}>PHP {reservationFee}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Schedule</Text>
            <Text style={[styles.value, { color: appColors.onSurface }]}>{date} at {time}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Guests</Text>
            <Text style={[styles.value, { color: appColors.onSurface }]}>{guests}</Text>
          </View>
          {!!note && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Note</Text>
              <Text style={[styles.value, { color: appColors.onSurface }]}>{note}</Text>
            </View>
          )}
          <View style={[styles.totalRow, { borderTopColor: appColors.outlineVariant }]}>
            <Text style={[styles.totalLabel, { color: appColors.onSurface }]}>Reservation Fee</Text>
            <Text style={styles.totalValue}>PHP {total}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Payment Instructions</Text>
        <Pressable style={[styles.paymentCard, { backgroundColor: appColors.white }]}>
          <View style={styles.paymentIcon}>
            <CreditCard size={22} color={colors.primary} />
          </View>
          <View style={styles.paymentText}>
            <Text style={[styles.itemName, { color: appColors.onSurface }]}>Pay Directly at Venue</Text>
            <Text style={[styles.itemSub, { color: appColors.onSurfaceVariant }]}>
              Your payment status will be pending until the owner or cashier confirms it.
            </Text>
          </View>
          <ChevronRight size={20} color={appColors.onSurfaceVariant} />
        </Pressable>
        <Pressable style={[styles.couponCard, { borderColor: appColors.outlineVariant }]}>
          <Ticket size={18} color={colors.primary} />
          <Text style={[styles.couponText, { color: appColors.onSurfaceVariant }]}>Add voucher or reward code</Text>
        </Pressable>
      </View>

      <AppButton
        label={loading ? 'Processing' : `Create Reservation - PHP ${total}`}
        loading={loading}
        onPress={confirmPayment}
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
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  headerSpacer: {
    width: 42,
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
    fontStyle: 'italic',
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
  summary: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
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
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  value: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    textAlign: 'right',
  },
  totalRow: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  totalValue: {
    color: colors.primary,
    fontSize: fontSize.xxl,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  paymentCard: {
    minHeight: 78,
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.card,
  },
  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  paymentText: {
    flex: 1,
  },
  couponCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  couponText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
});
