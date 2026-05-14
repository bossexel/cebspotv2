import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays, format } from 'date-fns';
import { ArrowLeft, Calendar, RefreshCw, Users, XCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { reservationService } from '../src/services/reservationService';
import type { Reservation } from '../src/types';
import {
  checkReservationAvailability,
  getPaymentStatusLabel,
  getReservationStatusLabel,
  getReservationTypeLabel,
} from '../src/utils/reservations';

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

  function openCancellationSheet(reservation: Reservation) {
    setCancelTarget(reservation);
    setCancellationReason('');
  }

  function closeCancellationSheet() {
    setCancelTarget(null);
    setCancellationReason('');
  }

  async function confirmCancellation() {
    if (!cancelTarget) return;
    if (!cancellationReason.trim()) {
      Alert.alert('Reason needed', 'Please share a short cancellation reason.');
      return;
    }

    try {
      const updatedAt = new Date().toISOString();
      const paidReservation = cancelTarget.payment_required || cancelTarget.reservation_type === 'paid';
      const paidAlready = cancelTarget.payment_status === 'paid';
      await reservationService.cancelReservation(cancelTarget.id, cancellationReason);
      setReservations((current) =>
        current.map((item) =>
          item.id === cancelTarget.id
            ? {
                ...item,
                status: 'cancelled',
                payment_status: paidAlready ? 'refund_pending' : paidReservation ? 'pending' : 'not_required',
                refund_status: paidAlready ? 'pending_review' : 'not_applicable',
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
    setRescheduleTarget(reservation);
    setSelectedRescheduleDate(reservation.reservation_date);
  }

  function closeRescheduleSheet() {
    setRescheduleTarget(null);
  }

  async function confirmReschedule() {
    if (!rescheduleTarget) return;
    const available = await checkReservationAvailability();
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
        <View style={styles.reservationsSection}>
          {reservations.map((reservation) => {
            const canModify = !['cancelled', 'completed', 'no_show'].includes(reservation.status);
            return (
              <View key={reservation.id} style={[styles.reservationCard, { backgroundColor: appColors.surfaceLow }]}>
                <View style={styles.reservationTop}>
                  <View style={styles.reservationIcon}>
                    <Calendar size={18} color={colors.primary} />
                  </View>
                  <View style={styles.reservationCopy}>
                    <Text style={[styles.reservationName, { color: appColors.onSurface }]}>{reservation.spot_name}</Text>
                    <Text style={[styles.reservationMeta, { color: appColors.onSurfaceVariant }]}>
                      {reservation.reservation_date}, {reservation.reservation_time} - {reservation.guest_count ?? reservation.guests} guests
                    </Text>
                  </View>
                </View>
                <View style={styles.reservationBadges}>
                  <Text style={styles.statusBadge}>{getReservationStatusLabel(reservation.status)}</Text>
                  <Text style={styles.typeBadge}>{getReservationTypeLabel(reservation)}</Text>
                  {reservation.payment_required && (
                    <Text style={styles.paymentBadge}>Payment: {getPaymentStatusLabel(reservation.payment_status)}</Text>
                  )}
                </View>
                {!!reservation.cancellation_reason && (
                  <Text style={[styles.reasonText, { color: appColors.onSurfaceVariant }]}>
                    Reason: {reservation.cancellation_reason}
                  </Text>
                )}
                {canModify && (
                  <View style={styles.reservationActions}>
                    <Pressable style={styles.miniButton} onPress={() => openRescheduleSheet(reservation)}>
                      <RefreshCw size={13} color={colors.primary} />
                      <Text style={styles.miniButtonText}>Reschedule</Text>
                    </Pressable>
                    <Pressable style={[styles.miniButton, styles.cancelButton]} onPress={() => openCancellationSheet(reservation)}>
                      <XCircle size={13} color={colors.danger} />
                      <Text style={[styles.miniButtonText, { color: colors.danger }]}>Cancel</Text>
                    </Pressable>
                  </View>
                )}
                <Pressable style={styles.viewButton} onPress={() => router.push(`/confirmed/${reservation.id}`)}>
                  <Text style={styles.viewText}>View Pass</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
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
    fontStyle: 'italic',
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
  reservationsSection: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  reservationCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow.card,
  },
  reservationTop: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  reservationIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reservationCopy: {
    flex: 1,
  },
  reservationName: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  reservationMeta: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  reservationBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusBadge: {
    color: colors.white,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  typeBadge: {
    color: colors.primary,
    backgroundColor: colors.primary + '12',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  paymentBadge: {
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  reasonText: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
  },
  reservationActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  miniButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '10',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  cancelButton: {
    backgroundColor: colors.dangerContainer,
  },
  miniButtonText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  viewButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  viewText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
    fontStyle: 'italic',
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
