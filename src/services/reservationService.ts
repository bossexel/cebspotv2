import { makeSampleReservation, sampleSpots } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewReservation, Reservation } from '../types';
import { getSpotReservationType } from '../utils/reservations';
import { activityService } from './activityService';

const localReservations: Reservation[] = [];

function normalizeReservation(row: any): Reservation {
  const reservationType = getSpotReservationType({
    reservation_fee: row.reservation_fee ?? row.fee,
    reservation_type: row.reservation_type,
    payment_required: row.payment_required,
  });
  const reservationFee = reservationType === 'paid' ? Number(row.reservation_fee ?? row.fee ?? 0) : 0;
  const paymentStatus =
    row.payment_status === 'on-site'
      ? 'not_required'
      : row.payment_status === 'unpaid'
        ? 'pending'
        : row.payment_status ?? (reservationType === 'paid' ? 'pending' : 'not_required');

  return {
    ...row,
    guest_count: Number(row.guest_count ?? row.guests ?? 1),
    guests: Number(row.guests ?? row.guest_count ?? 1),
    note: row.note ?? null,
    fee: Number(row.fee ?? reservationFee),
    reservation_type: reservationType,
    reservation_fee: reservationFee,
    payment_required: reservationType === 'paid',
    status: row.status ?? (reservationType === 'paid' ? 'pending_payment' : 'confirmed'),
    payment_status: paymentStatus,
    payment_method: row.payment_method ?? null,
    payment_reference: row.payment_reference ?? null,
    payment_proof_url: row.payment_proof_url ?? null,
    refund_status: row.refund_status ?? 'not_applicable',
    cancellation_reason: row.cancellation_reason ?? null,
    cancelled_at: row.cancelled_at ?? null,
    adjustment_acknowledged: Boolean(row.adjustment_acknowledged ?? false),
    adjustment_acknowledged_at: row.adjustment_acknowledged_at ?? null,
  };
}

function toLegacyReservation(reservation: NewReservation) {
  const {
    guest_count,
    note,
    reservation_type,
    reservation_fee,
    payment_required,
    payment_method,
    payment_reference,
    table_id,
    slot_id,
    group_size_type,
    reservation_time_start,
    reservation_time_end,
    payment_proof_url,
    refund_status,
    adjustment_acknowledged,
    adjustment_acknowledged_at,
    ...legacy
  } = reservation;

  return {
    ...legacy,
    guests: legacy.guests ?? guest_count ?? 1,
    fee: legacy.fee ?? reservation_fee ?? 0,
    status: reservation_type === 'paid' && legacy.status === 'pending_payment' ? 'pending' : legacy.status,
    payment_status:
      reservation.payment_status === 'not_required'
        ? 'on-site'
        : reservation.payment_status === 'pending'
          ? 'unpaid'
          : reservation.payment_status,
  };
}

function getCancellationFields(reservation: Reservation, reason?: string) {
  const updatedAt = new Date().toISOString();
  const cancellationReason = reason?.trim() || null;
  const paidReservation = reservation.payment_required || reservation.reservation_type === 'paid';

  if (!paidReservation) {
    return {
      status: 'cancelled' as const,
      payment_status: 'not_required' as const,
      refund_status: 'not_applicable' as const,
      cancellation_reason: cancellationReason,
      cancelled_at: updatedAt,
      updated_at: updatedAt,
    };
  }

  if (reservation.payment_status === 'paid') {
    return {
      status: 'cancelled' as const,
      payment_status: 'refund_pending' as const,
      refund_status: 'pending_review' as const,
      cancellation_reason: cancellationReason,
      cancelled_at: updatedAt,
      updated_at: updatedAt,
    };
  }

  return {
    status: 'cancelled' as const,
    payment_status: 'pending' as const,
    refund_status: 'not_applicable' as const,
    cancellation_reason: cancellationReason,
    cancelled_at: updatedAt,
    updated_at: updatedAt,
  };
}

export const reservationService = {
  async createReservation(reservation: NewReservation): Promise<Reservation> {
    if (!hasSupabaseConfig) {
      const created: Reservation = {
        id: `local-res-${Date.now()}`,
        created_at: new Date().toISOString(),
        ...reservation,
      };
      localReservations.unshift(created);
      await activityService.logActivity({
        user_id: created.user_id,
        user_name: 'Demo Explorer',
        action: 'reserved',
        target_id: created.spot_id,
        target_name: created.spot_name,
        type: 'reservation',
        spot_id: created.spot_id,
        spot_name: created.spot_name,
      });
      return created;
    }

    let { data, error } = await supabase
      .from('reservations')
      .insert(reservation)
      .select('*')
      .single();
    if (error && /column|schema cache|payment_required|reservation_type|guest_count|note/i.test(error.message)) {
      const legacyReservation = toLegacyReservation(reservation);
      const retry = await supabase.from('reservations').insert(legacyReservation).select('*').single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;

    const created = normalizeReservation(data);
    try {
      await activityService.logActivity({
        user_id: created.user_id,
        user_name: 'Explorer',
        action: 'reserved',
        target_id: created.spot_id,
        target_name: created.spot_name,
        type: 'reservation',
        spot_id: created.spot_id,
        spot_name: created.spot_name,
      });
    } catch (activityError) {
      console.warn('Reservation saved, but activity logging failed:', activityError);
    }

    return created;
  },

  async getReservationById(id: string): Promise<Reservation | null> {
    const local = localReservations.find((reservation) => reservation.id === id);
    if (local) return local;

    const sampleSpot = sampleSpots.find((spot) => `sample-res-${spot.id}` === id);
    if (sampleSpot) return makeSampleReservation(sampleSpot);

    const { data, error } = await supabase.from('reservations').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? normalizeReservation(data) : null;
  },

  async getUserReservations(userId: string): Promise<Reservation[]> {
    if (!hasSupabaseConfig) {
      return localReservations.filter((reservation) => reservation.user_id === userId);
    }

    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(normalizeReservation);
  },

  subscribeToUserReservations(userId: string, callback: (reservations: Reservation[]) => void) {
    if (!hasSupabaseConfig) {
      callback(localReservations.filter((reservation) => reservation.user_id === userId));
      return () => undefined;
    }

    const channelName = `reservations-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `user_id=eq.${userId}` },
        async () => {
          callback(await this.getUserReservations(userId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  async cancelReservation(id: string, reason?: string): Promise<void> {
    const local = localReservations.find((reservation) => reservation.id === id);
    if (local) {
      Object.assign(local, getCancellationFields(local, reason));
      return;
    }

    const existing = await this.getReservationById(id);
    const cancellationFields = existing
      ? getCancellationFields(existing, reason)
      : {
          status: 'cancelled' as const,
          payment_status: 'pending' as const,
          refund_status: 'not_applicable' as const,
          cancellation_reason: reason?.trim() || null,
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

    let { error } = await supabase.from('reservations').update(cancellationFields).eq('id', id);
    if (error && /column|schema cache|refund_status|cancellation_reason|cancelled_at/i.test(error.message)) {
      const { refund_status, cancellation_reason, cancelled_at, ...legacyFields } = cancellationFields;
      const retry = await supabase.from('reservations').update(legacyFields).eq('id', id);
      error = retry.error;
    }
    if (error) throw error;
  },

  async rescheduleReservation(
    id: string,
    reservationDate: string,
    reservationTime: string,
    options?: {
      reservationTimeEnd?: string | null;
      slotId?: string | null;
      tableId?: string | null;
      groupSizeType?: string | null;
    },
  ): Promise<void> {
    const local = localReservations.find((reservation) => reservation.id === id);
    if (local) {
      local.reservation_date = reservationDate;
      local.reservation_time = reservationTime;
      local.reservation_time_start = reservationTime;
      local.reservation_time_end = options?.reservationTimeEnd ?? local.reservation_time_end ?? null;
      local.slot_id = options?.slotId ?? local.slot_id ?? null;
      local.table_id = options?.tableId ?? local.table_id ?? null;
      local.group_size_type = options?.groupSizeType ?? local.group_size_type ?? null;
      local.status = 'rescheduled';
      local.updated_at = new Date().toISOString();
      return;
    }

    const updateFields = {
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      reservation_time_start: reservationTime,
      reservation_time_end: options?.reservationTimeEnd ?? null,
      slot_id: options?.slotId ?? null,
      table_id: options?.tableId ?? null,
      group_size_type: options?.groupSizeType ?? null,
      status: 'rescheduled' as const,
      updated_at: new Date().toISOString(),
    };

    let { error } = await supabase
      .from('reservations')
      .update(updateFields)
      .eq('id', id);
    if (error && /column|schema cache|reservation_time_start|reservation_time_end|slot_id|table_id|group_size_type/i.test(error.message)) {
      const {
        reservation_time_start,
        reservation_time_end,
        slot_id,
        table_id,
        group_size_type,
        ...legacyFields
      } = updateFields;
      const retry = await supabase.from('reservations').update(legacyFields).eq('id', id);
      error = retry.error;
    }
    if (error) throw error;
  },
};
