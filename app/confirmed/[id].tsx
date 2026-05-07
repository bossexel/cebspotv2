import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { ArrowRight, Calendar, CheckCircle2, Download, Share2, Users } from 'lucide-react-native';
import { AppButton } from '../../src/components/AppButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors } from '../../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../../src/constants/design';
import { useTheme } from '../../src/hooks/useTheme';
import { reservationService } from '../../src/services/reservationService';
import type { Reservation } from '../../src/types';

export default function BookingConfirmedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { appColors } = useTheme();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
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

  return (
    <ScreenContainer appColors={confirmationColors} scroll padded>
      <View style={styles.successTop}>
        <View style={styles.successIcon}>
          <CheckCircle2 size={44} color={colors.primary} />
        </View>
        <Text style={styles.title}>Pulse Confirmed</Text>
        <Text style={styles.subtitle}>Your CebSpot pass is ready. Show this when you arrive.</Text>
      </View>

      <View style={styles.ticket}>
        <View style={styles.qrWrap}>
          <QRCode value={reservation.qr_code} size={132} color={colors.primary} backgroundColor={colors.white} />
        </View>
        <Text style={styles.passLabel}>Pass ID</Text>
        <Text style={styles.passId}>{reservation.qr_code}</Text>

        <View style={styles.dash} />

        <View style={styles.detailGrid}>
          <View style={styles.detail}>
            <Text style={styles.detailLabel}>Spot</Text>
            <Text style={styles.detailValue}>{reservation.spot_name}</Text>
          </View>
          <View style={styles.detail}>
            <Calendar size={14} color={colors.primary} />
            <Text style={styles.detailLabel}>Schedule</Text>
            <Text style={styles.detailValue}>
              {reservation.reservation_date}, {reservation.reservation_time}
            </Text>
          </View>
          <View style={styles.detail}>
            <Users size={14} color={colors.primary} />
            <Text style={styles.detailLabel}>Party</Text>
            <Text style={styles.detailValue}>{reservation.guests} guests</Text>
          </View>
          <View style={styles.detail}>
            <Text style={styles.detailLabel}>Paid</Text>
            <Text style={[styles.detailValue, styles.amount]}>PHP {reservation.fee}</Text>
          </View>
        </View>

        <Pressable style={styles.walletButton}>
          <Download size={15} color={colors.primary} />
          <Text style={styles.walletText}>Save to Wallet</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Activity"
          variant="secondary"
          onPress={() => router.replace('/activity')}
          icon={<Share2 size={16} color={colors.primary} />}
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
    fontStyle: 'italic',
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
  qrWrap: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.xl,
    marginBottom: spacing.md,
  },
  passLabel: {
    color: colors.onSurfaceVariant,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  passId: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '900',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  dash: {
    width: '100%',
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    marginVertical: spacing.xl,
  },
  detailGrid: {
    width: '100%',
    gap: spacing.md,
  },
  detail: {
    gap: 3,
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
  walletButton: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  walletText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  actionButton: {
    flex: 1,
  },
});
