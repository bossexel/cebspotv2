import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDays, format } from 'date-fns';
import { ArrowLeft, Calendar, Clock, Info, Minus, Plus, Users } from 'lucide-react-native';
import { AppButton } from '../../src/components/AppButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors } from '../../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../../src/constants/design';
import { useTheme } from '../../src/hooks/useTheme';
import { spotService } from '../../src/services/spotService';
import type { Spot } from '../../src/types';

const timeSlots = ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

export default function ReservationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { appColors } = useTheme();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('18:00');
  const [guests, setGuests] = useState(2);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(new Date(), index)), []);

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        setSpot(await spotService.getSpotById(id));
      } catch (error) {
        console.error('Unable to load reservation spot:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  if (loading || !spot) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={colors.primary} size="large" />
          ) : (
            <Text style={[styles.title, { color: appColors.onSurface }]}>Spot not found</Text>
          )}
        </View>
      </ScreenContainer>
    );
  }

  function continueFlow() {
    if (!spot) return;
    router.push({
      pathname: '/checkout/[id]',
      params: {
        id: spot.id,
        spotName: spot.name,
        date,
        time,
        guests: String(guests),
        fee: String(spot.reservation_fee),
      },
    });
  }

  return (
    <ScreenContainer appColors={appColors} scroll>
      <View style={styles.header}>
        <Pressable style={[styles.backButton, { backgroundColor: appColors.white }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: appColors.onSurface }]}>Reservation</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.spotCard, { backgroundColor: appColors.surfaceLow }]}>
        <Text style={[styles.spotName, { color: appColors.onSurface }]}>{spot.name}</Text>
        <Text style={[styles.spotAddress, { color: appColors.onSurfaceVariant }]}>{spot.address}</Text>
      </View>

      <View style={[styles.panel, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.fieldHeader}>
          <Calendar size={16} color={colors.primary} />
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Pick a Date</Text>
        </View>
        <View style={styles.dateRow}>
          {dates.map((day) => {
            const value = format(day, 'yyyy-MM-dd');
            const selected = value === date;
            return (
              <Pressable
                key={value}
                onPress={() => setDate(value)}
                style={[
                  styles.dateChip,
                  {
                    backgroundColor: selected ? colors.primary : appColors.white,
                    borderColor: selected ? colors.primary : appColors.outlineVariant,
                  },
                ]}
              >
                <Text style={[styles.dateDow, { color: selected ? colors.white : appColors.onSurfaceVariant }]}>
                  {format(day, 'EEE')}
                </Text>
                <Text style={[styles.dateDay, { color: selected ? colors.white : appColors.onSurface }]}>
                  {format(day, 'd')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.fieldHeader}>
          <Clock size={16} color={colors.primary} />
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Time Slot</Text>
        </View>
        <View style={styles.timeGrid}>
          {timeSlots.map((slot) => {
            const selected = slot === time;
            return (
              <Pressable
                key={slot}
                onPress={() => setTime(slot)}
                style={[
                  styles.timeChip,
                  {
                    backgroundColor: selected ? colors.primary : appColors.white,
                    borderColor: selected ? colors.primary : appColors.outlineVariant,
                  },
                ]}
              >
                <Text style={[styles.timeText, { color: selected ? colors.white : appColors.onSurface }]}>
                  {slot}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.fieldHeader}>
          <Users size={16} color={colors.primary} />
          <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Guests</Text>
        </View>
        <View style={[styles.stepper, { backgroundColor: appColors.white }]}>
          <Pressable style={styles.stepButton} onPress={() => setGuests(Math.max(1, guests - 1))}>
            <Minus size={18} color={appColors.onSurface} />
          </Pressable>
          <Text style={styles.guestCount}>{guests}</Text>
          <Pressable style={styles.stepButton} onPress={() => setGuests(guests + 1)}>
            <Plus size={18} color={appColors.onSurface} />
          </Pressable>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.primary + '10' }]}>
          <Info size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: appColors.onSurfaceVariant }]}>
            Reservation fee is per booking and will be deducted from your total bill at the venue.
          </Text>
        </View>
      </View>

      <View style={[styles.summary, { backgroundColor: appColors.white }]}>
        <Text style={[styles.summaryLabel, { color: appColors.onSurfaceVariant }]}>Reservation Fee</Text>
        <Text style={styles.summaryValue}>PHP {spot.reservation_fee}</Text>
      </View>

      <AppButton label={spot.reservation_fee > 0 ? 'Proceed to Payment' : 'Confirm Reservation'} onPress={continueFlow} />
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
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  headerSpacer: {
    width: 42,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  spotCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  spotName: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  spotAddress: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  panel: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateChip: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDow: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dateDay: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginTop: 2,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timeChip: {
    width: '31.5%',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  timeText: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  stepper: {
    minHeight: 62,
    borderRadius: radius.xl,
    padding: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepButton: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
  },
  guestCount: {
    color: colors.primary,
    fontSize: fontSize.xxl,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  infoCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
  },
  summary: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  summaryValue: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: '900',
    fontStyle: 'italic',
  },
});
