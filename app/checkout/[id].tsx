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

const platformFee = 15;

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    spotName?: string;
    date?: string;
    time?: string;
    guests?: string;
    fee?: string;
  }>();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const spotId = params.id;
  const spotName = params.spotName ?? 'CebSpot Venue';
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const time = params.time ?? '18:00';
  const guests = Number(params.guests ?? 1);
  const reservationFee = Number(params.fee ?? 0);
  const reward = Math.floor(reservationFee * 0.05);
  const total = Math.max(0, reservationFee + (reservationFee > 0 ? platformFee : 0) - reward);

  async function confirmPayment() {
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
        guests,
        fee: total,
        status: 'confirmed',
        payment_status: total > 0 ? 'paid' : 'on-site',
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
        <Text style={[styles.heroTitle, { color: appColors.onSurface }]}>Secure your pulse</Text>
        <Text style={[styles.heroCopy, { color: appColors.onSurfaceVariant }]}>
          Demo payment only. Your reservation pass is generated after confirmation.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Order Summary</Text>
        <View style={[styles.summary, { backgroundColor: appColors.surfaceLow }]}>
          <View style={styles.row}>
            <View>
              <Text style={[styles.itemName, { color: appColors.onSurface }]}>{spotName}</Text>
              <Text style={[styles.itemSub, { color: appColors.onSurfaceVariant }]}>
                Reservation fee per booking
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
          <View style={styles.row}>
            <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Platform Fee</Text>
            <Text style={[styles.value, { color: appColors.onSurface }]}>PHP {reservationFee > 0 ? platformFee : 0}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Pulse Reward</Text>
            <Text style={[styles.value, { color: colors.primary }]}>- PHP {reward}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopColor: appColors.outlineVariant }]}>
            <Text style={[styles.totalLabel, { color: appColors.onSurface }]}>Total</Text>
            <Text style={styles.totalValue}>PHP {total}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Payment Method</Text>
        <Pressable style={[styles.paymentCard, { backgroundColor: appColors.white }]}>
          <View style={styles.paymentIcon}>
            <CreditCard size={22} color={colors.primary} />
          </View>
          <View style={styles.paymentText}>
            <Text style={[styles.itemName, { color: appColors.onSurface }]}>Demo Card</Text>
            <Text style={[styles.itemSub, { color: appColors.onSurfaceVariant }]}>4242 4242 4242 4242</Text>
          </View>
          <ChevronRight size={20} color={appColors.onSurfaceVariant} />
        </Pressable>
        <Pressable style={[styles.couponCard, { borderColor: appColors.outlineVariant }]}>
          <Ticket size={18} color={colors.primary} />
          <Text style={[styles.couponText, { color: appColors.onSurfaceVariant }]}>Add voucher or reward code</Text>
        </Pressable>
      </View>

      <AppButton
        label={loading ? 'Processing' : `Confirm Payment - PHP ${total}`}
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
