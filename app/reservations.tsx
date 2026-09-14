import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays, format, isBefore, startOfDay } from 'date-fns';
import { ArrowLeft, Calendar, Clock, RefreshCw, Users, XCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { clubTableDisplayName } from '../src/constants/clubFloorPlan';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { reservationService } from '../src/services/reservationService';
import type { Reservation } from '../src/types';
import {
  allowsSelfServiceReservationChanges,
  checkReservationAvailability,
  getPaymentStatusLabel,
  getReservationStatusLabel,
  getReservationTypeLabel,
} from '../src/utils/reservations';

const CLOSED_STATUSES = ['cancelled', 'checked_in', 'completed', 'no_show'];

// Status pill colors so the eye can sort reservations by state at a glance
// instead of reading every badge.
function statusTone(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'confirmed':
    case 'rescheduled':
      return { bg: colors.primary, fg: colors.white };
    case 'checked_in':
      return { bg: colors.successContainer, fg: colors.success };
    case 'pending':
      return { bg: '#F5A623', fg: colors.white };
    case 'cancelled':
    case 'no_show':
      return { bg: colors.dangerContainer, fg: colors.danger };
    case 'completed':
      return { bg: '#E4E4E4', fg: '#6B6B6B' };
    default:
      return { bg: colors.primary + '14', fg: colors.primary };
  }
}

export default function ReservationsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { appColors } = useTheme();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleTarget, setRescheduleTarget] = useState<Reservation | null>(null);
  const [selectedRescheduleDate, setSelectedRescheduleDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const rescheduleDates = Array.from({ length: 14 }, (_, index) => addDays(new Date(), index));

  useEffect(() => {
    let unsubscribeReservations: (() => void) | undefined;

    async function load() {
      try {
        if (profile?.id) {
          setReservations(await reservationService.getUserReservations(profile.id));
          unsubscribeReservations = reservationService.subscribeToUserReservations(profile.id, setReservations);
        }
      } catch (error) {
        console.error('Unable to load reservations:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => unsubscribeReservations?.();
  }, [profile?.id]);

  // Split into Upcoming / Past so a long history doesn't bury what's next.
  const { upcoming, past } = useMemo(() => {
    const today = startOfDay(new Date());
    const upcomingList: Reservation[] = [];
    const pastList: Reservation[] = [];
    for (const reservation of reservations) {
      const isClosed = CLOSED_STATUSES.includes(reservation.status);
      const isPastDate = isBefore(startOfDay(new Date(reservation.reservation_date)), today);
      if (isClosed || isPastDate) {
        pastList.push(reservation);
      } else {
        upcomingList.push(reservation);
      }
    }
    upcomingList.sort((a, b) => a.reservation_date.localeCompare(b.reservation_date));
    pastList.sort((a, b) => b.reservation_date.localeCompare(a.reservation_date));
    return { upcoming: upcomingList, past: pastList };
  }, [reservations]);

  function openCancellationSheet(reservation: Reservation) {
    if (!allowsSelfServiceReservationChanges(reservation)) return;
    setCancelTarget(reservation);
    setCancellationReason('');
  }

  function closeCancellationSheet() {
    setCancelTarget(null);
    setCancellationReason('');
  }

  async function confirmCancellation() {
    if (!cancelTarget) return;
    if (!allowsSelfServiceReservationChanges(cancelTarget)) {
      closeCancellationSheet();
      return;
    }
    if (!cancellationReason.trim()) {
      Alert.alert('Reason needed', 'Please share a short cancellation reason.');
      return;
    }

    try {
      const updatedAt = new Date().toISOString();
      await reservationService.cancelReservation(cancelTarget.id, cancellationReason);
      setReservations((current) =>
        current.map((item) =>
          item.id === cancelTarget.id
            ? {
                ...item,
                status: 'cancelled',
                payment_status: 'not_required',
                refund_status: 'not_applicable',
                cancellation_reason: cancellationReason.trim(),
                cancelled_at: updatedAt,
                updated_at: updatedAt,
              }
            : item,
        ),
      );
      closeCancellationSheet();
    } catch (error: any) {
      Alert.alert('Unable to cancel', error.message ?? 'Please try again.');
    }
  }

  function openRescheduleSheet(reservation: Reservation) {
    if (!allowsSelfServiceReservationChanges(reservation)) return;
    setRescheduleTarget(reservation);
    setSelectedRescheduleDate(reservation.reservation_date);
  }

  function closeRescheduleSheet() {
    setRescheduleTarget(null);
  }

  async function confirmReschedule() {
    if (!rescheduleTarget) return;
    if (!allowsSelfServiceReservationChanges(rescheduleTarget)) {
      closeRescheduleSheet();
      return;
    }
    const available = await checkReservationAvailability({
      spotId: rescheduleTarget.spot_id,
      reservationDate: selectedRescheduleDate,
      slotId: rescheduleTarget.slot_id,
      tableId: rescheduleTarget.table_id,
      excludeReservationId: rescheduleTarget.id,
    });
    if (!available) {
      Alert.alert('Unavailable', 'This slot is no longer available. Please choose another schedule.');
      return;
    }

    try {
      await reservationService.rescheduleReservation(
        rescheduleTarget.id,
        selectedRescheduleDate,
        rescheduleTarget.reservation_time,
        {
          reservationTimeEnd: rescheduleTarget.reservation_time_end,
          slotId: rescheduleTarget.slot_id,
          tableId: rescheduleTarget.table_id,
          groupSizeType: rescheduleTarget.group_size_type,
        },
      );
      setReservations((current) =>
        current.map((item) =>
          item.id === rescheduleTarget.id
            ? {
                ...item,
                reservation_date: selectedRescheduleDate,
                status: 'rescheduled',
                updated_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      Alert.alert('Reservation rescheduled', `Your reservation was moved to ${selectedRescheduleDate}.`);
      closeRescheduleSheet();
    } catch (error: any) {
      Alert.alert('Unable to reschedule', error.message ?? 'Please try again.');
    }
  }

  function renderCard(reservation: Reservation) {
    const canModify =
      !CLOSED_STATUSES.includes(reservation.status) && allowsSelfServiceReservationChanges(reservation);
    const tone = statusTone(reservation.status);
    const displayDate = format(new Date(reservation.reservation_date), 'EEE, MMM d');

    return (
      <View key={reservation.id} style={[styles.card, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.spotName, { color: appColors.onSurface }]} numberOfLines={1}>
            {reservation.spot_name}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.statusPillText, { color: tone.fg }]}>{getReservationStatusLabel(reservation.status)}</Text>
          </View>
        </View>

        <Text style={[styles.typeLabel, { color: appColors.onSurfaceVariant }]}>
          {getReservationTypeLabel(reservation)}
        </Text>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Calendar size={14} color={appColors.onSurfaceVariant} />
            <Text style={[styles.detailText, { color: appColors.onSurface }]}>{displayDate}</Text>
          </View>
          <View style={styles.detailItem}>
            <Clock size={14} color={appColors.onSurfaceVariant} />
            <Text style={[styles.detailText, { color: appColors.onSurface }]}>{reservation.reservation_time}</Text>
          </View>
          <View style={styles.detailItem}>
            <Users size={14} color={appColors.onSurfaceVariant} />
            <Text style={[styles.detailText, { color: appColors.onSurface }]}>
              {reservation.guest_count ?? reservation.guests}
            </Text>
          </View>
        </View>

        {reservation.table_id || reservation.payment_required ? (
          <View style={styles.secondaryRow}>
            {reservation.table_id ? (
              <Text style={[styles.secondaryText, { color: appColors.onSurfaceVariant }]}>
                {clubTableDisplayName(reservation.table_id)}
              </Text>
            ) : null}
            {reservation.payment_required ? (
              <Text style={[styles.secondaryText, { color: appColors.onSurfaceVariant }]}>
                Payment · {getPaymentStatusLabel(reservation.payment_status)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {!!reservation.cancellation_reason && (
          <Text style={[styles.reasonText, { color: appColors.onSurfaceVariant }]}>
            Cancelled: {reservation.cancellation_reason}
          </Text>
        )}

        <View style={[styles.divider, { backgroundColor: appColors.outlineVariant }]} />

        <View style={styles.actionsRow}>
          <Pressable style={styles.linkButton} onPress={() => router.push(`/confirmed/${reservation.id}`)}>
            <Text style={[styles.linkButtonText, { color: appColors.onSurface }]}>Details</Text>
          </Pressable>
          {canModify && (
            <View style={styles.inlineActions}>
              <Pressable style={styles.iconTextButton} onPress={() => openRescheduleSheet(reservation)}>
                <RefreshCw size={13} color={colors.primary} />
                <Text style={styles.iconTextButtonLabel}>Reschedule</Text>
              </Pressable>
              <Pressable style={styles.iconTextButton} onPress={() => openCancellationSheet(reservation)}>
                <XCircle size={13} color={colors.danger} />
                <Text style={[styles.iconTextButtonLabel, { color: colors.danger }]}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <ScreenContainer appColors={appColors} showBottomNav scroll>
      <View style={styles.header}>
        <Pressable style={[styles.backButton, { backgroundColor: appColors.surfaceLow }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Reservations</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>Manage your bookings</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
      ) : reservations.length ? (
        <>
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeader, { color: appColors.onSurface }]}>Upcoming</Text>
              <Text style={[styles.sectionCount, { color: appColors.onSurfaceVariant }]}>{upcoming.length}</Text>
            </View>
            {upcoming.length ? (
              <View style={styles.cardStack}>{upcoming.map(renderCard)}</View>
            ) : (
              <Text style={[styles.emptySectionText, { color: appColors.onSurfaceVariant }]}>
                Nothing booked yet. Explore spots to reserve your next visit.
              </Text>
            )}
          </View>

          {past.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeader, { color: appColors.onSurface }]}>Past</Text>
                <Text style={[styles.sectionCount, { color: appColors.onSurfaceVariant }]}>{past.length}</Text>
              </View>
              <View style={styles.cardStack}>{past.map(renderCard)}</View>
            </View>
          )}
        </>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: appColors.surfaceLow }]}>
          <Calendar size={28} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: appColors.onSurface }]}>No bookings yet</Text>
          <Text style={[styles.emptyCopy, { color: appColors.onSurfaceVariant }]}>
            Your confirmed and pending reservations will appear here.
          </Text>
        </View>
      )}

      <Modal visible={Boolean(rescheduleTarget)} transparent animationType="fade" onRequestClose={closeRescheduleSheet}>
        <Pressable style={styles.modalBackdrop} onPress={closeRescheduleSheet}>
          <Pressable style={[styles.modalSheet, { backgroundColor: appColors.surface }]}>
            <Text style={[styles.modalTitle, { color: appColors.onSurface }]}>Adjust Date</Text>
            <Text style={[styles.modalCopy, { color: appColors.onSurfaceVariant }]}>
              Choose a new reservation date. Your current time slot will be kept if availability is still open.
            </Text>
            <View style={styles.rescheduleDateGrid}>
              {rescheduleDates.map((day) => {
                const value = format(day, 'yyyy-MM-dd');
                const selected = value === selectedRescheduleDate;
                return (
                  <Pressable
                    key={value}
                    style={[
                      styles.rescheduleDateChip,
                      {
                        backgroundColor: selected ? colors.primary : appColors.surfaceLow,
                        borderColor: selected ? colors.primary : appColors.outlineVariant,
                      },
                    ]}
                    onPress={() => setSelectedRescheduleDate(value)}
                  >
                    <Text style={[styles.rescheduleDow, { color: selected ? colors.white : appColors.onSurfaceVariant }]}>
                      {format(day, 'EEE')}
                    </Text>
                    <Text style={[styles.rescheduleDay, { color: selected ? colors.white : appColors.onSurface }]}>
                      {format(day, 'd')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalButton, styles.modalGhostButton]} onPress={closeRescheduleSheet}>
                <Text style={styles.modalGhostText}>Keep Current</Text>
              </Pressable>
              <Pressable style={styles.modalButton} onPress={confirmReschedule}>
                <Text style={styles.modalButtonText}>Save Date</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(cancelTarget)} transparent animationType="fade" onRequestClose={closeCancellationSheet}>
        <Pressable style={styles.modalBackdrop} onPress={closeCancellationSheet}>
          <Pressable style={[styles.modalSheet, { backgroundColor: appColors.surface }]}>
            <Text style={[styles.modalTitle, { color: appColors.onSurface }]}>Cancellation Reason</Text>
            <Text style={[styles.modalCopy, { color: appColors.onSurfaceVariant }]}>
              Tell the spot owner why you are cancelling. This helps with refund review when payment is involved.
            </Text>
            <TextInput
              value={cancellationReason}
              onChangeText={setCancellationReason}
              multiline
              placeholder="e.g. Schedule conflict, weather, change of plans..."
              placeholderTextColor={appColors.onSurfaceVariant + '88'}
              style={[
                styles.reasonInput,
                {
                  backgroundColor: appColors.surfaceLow,
                  color: appColors.onSurface,
                },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalButton, styles.modalGhostButton]} onPress={closeCancellationSheet}>
                <Text style={styles.modalGhostText}>Go Back</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.modalDangerButton]} onPress={confirmCancellation}>
                <Text style={styles.modalButtonText}>Cancel Booking</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 42,
  },
  loader: {
    marginVertical: spacing.xxl,
  },

  // Section grouping (Upcoming / Past)
  sectionBlock: {
    marginBottom: spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  sectionHeader: {
    fontSize: fontSize.md,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionCount: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  emptySectionText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    lineHeight: 20,
  },
  cardStack: {
    gap: spacing.md,
  },

  // Card
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  spotName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  typeLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  secondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  secondaryText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  reasonText: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkButton: {
    paddingVertical: 6,
  },
  linkButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textDecorationLine: 'underline',
  },
  inlineActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  iconTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  iconTextButtonLabel: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },

  emptyCard: {
    borderRadius: radius.xxl,
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
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  modalCopy: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '700',
  },
  rescheduleDateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  rescheduleDateChip: {
    width: '22.9%',
    minHeight: 66,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rescheduleDow: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  rescheduleDay: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  reasonInput: {
    minHeight: 126,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  modalDangerButton: {
    backgroundColor: colors.danger,
  },
  modalGhostButton: {
    backgroundColor: colors.primary + '12',
  },
  modalButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalGhostText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
