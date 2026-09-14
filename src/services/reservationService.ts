import type { SupabaseClient } from '@supabase/supabase-js';
import { makeSampleReservation, sampleSpots } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewReservation, Reservation } from '../types';
import {
  allowsSelfServiceReservationChanges,
  calculateReservationFee,
  getSpotReservationType,
  isTestCebspotRecord,
} from '../utils/reservations';
import { activityService } from './activityService';

const localReservations: Reservation[] = [];

function normalizeReservation(row: any): Reservation {
  const reservationType = getSpotReservationType({
    spot_id: row.spot_id,
    spot_name: row.spot_name,
    fee: row.fee,
    reservation_fee: row.reservation_fee ?? row.fee,
    reservation_type: row.reservation_type,
    payment_required: row.payment_required,
  });
  const reservationFee = reservationType === 'paid' ? calculateReservationFee(row) : 0;
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
    payer_gcash_number: row.payer_gcash_number ?? null,
    guest_name: row.guest_name ?? null,
    guest_email: row.guest_email ?? null,
    guest_phone: row.guest_phone ?? null,
    refund_status: row.refund_status ?? 'not_applicable',
    cancellation_reason: row.cancellation_reason ?? null,
    cancelled_at: row.cancelled_at ?? null,
    adjustment_acknowledged: Boolean(row.adjustment_acknowledged ?? false),
    adjustment_acknowledged_at: row.adjustment_acknowledged_at ?? null,
    payment_terms_accepted: Boolean(row.payment_terms_accepted ?? false),
    payment_terms_accepted_at: row.payment_terms_accepted_at ?? null,
  };
}

function getProviderPaymentReference(payment: any, currentReference?: string | null) {
  const isPaid = payment?.status === 'paid';
  const providerReference = isPaid
    ? payment.provider_payment_id ?? payment.provider_payment_intent_id ?? payment.provider_checkout_session_id
    : payment.provider_checkout_session_id ?? payment.provider_payment_intent_id ?? payment.provider_payment_id;

  return isPaid ? providerReference ?? currentReference ?? null : currentReference ?? providerReference ?? null;
}

async function attachPaymentReferences(reservations: Reservation[], client: SupabaseClient) {
  if (!reservations.length) return reservations;

  try {
    const { data, error } = await client
      .from('reservation_payments')
      .select(
        'reservation_id, status, provider_checkout_session_id, provider_payment_intent_id, provider_payment_id',
      )
      .in(
        'reservation_id',
        reservations.map((reservation) => reservation.id),
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    const paymentsByReservation = new Map<string, any>();
    for (const payment of data ?? []) {
      const existing = paymentsByReservation.get(payment.reservation_id);
      if (!existing || (payment.status === 'paid' && existing.status !== 'paid')) {
        paymentsByReservation.set(payment.reservation_id, payment);
      }
    }

    return reservations.map((reservation) => {
      const payment = paymentsByReservation.get(reservation.id);
      if (!payment) return reservation;

      return {
        ...reservation,
        payment_reference: getProviderPaymentReference(payment, reservation.payment_reference),
      };
    });
  } catch (error) {
    // Keep the owner dashboard usable while an older Supabase schema refreshes.
    console.warn('Unable to reconcile owner payment references:', error);
    return reservations;
  }
}

async function attachGuestDetails(reservations: Reservation[], client: SupabaseClient) {
  if (!reservations.length) return reservations;

  const userIds = [...new Set(reservations.map((reservation) => reservation.user_id).filter(Boolean))];
  if (!userIds.length) return reservations;

  try {
    const { data, error } = await client.from('profiles').select('id, display_name, email').in('id', userIds);
    if (error) throw error;

    const profilesById = new Map((data ?? []).map((profile) => [profile.id, profile]));
    return reservations.map((reservation) => {
      const guestProfile = profilesById.get(reservation.user_id);
      return {
        ...reservation,
        guest_name: reservation.guest_name?.trim() || guestProfile?.display_name?.trim() || guestProfile?.email?.split('@')[0] || 'Guest',
        guest_email: reservation.guest_email ?? guestProfile?.email ?? null,
      };
    });
  } catch (error) {
    console.warn('Unable to load reservation guest names:', error);
    return reservations;
  }
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
    payer_gcash_number,
    refund_status,
    adjustment_acknowledged,
    adjustment_acknowledged_at,
    guest_name,
    guest_email,
    guest_phone,
    payment_terms_accepted,
    payment_terms_accepted_at,
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

async function localActivitiesApprovalLog(reservation: Reservation) {
  await activityService.logActivity({
    user_id: reservation.user_id,
    user_name: 'CebSpot',
    action: 'approved your reservation',
    target_id: reservation.id,
    target_name: reservation.spot_name,
    type: 'reservation_approved',
    content: `Your reservation at ${reservation.spot_name} is now approved.`,
    spot_id: reservation.spot_id,
    spot_name: reservation.spot_name,
  });
}

function isReservationSlotConflict(error: unknown) {
  const maybeError = error as { code?: string; message?: string } | null | undefined;
  return (
    maybeError?.code === '23505' ||
    /reservations_active_table_slot_unique_idx|duplicate key|slot is no longer available|already reserved/i.test(
      maybeError?.message ?? '',
    )
  );
}

function throwReservationSlotConflict() {
  throw new Error('This table was just booked by someone else. Please choose another available slot.');
}

export const reservationService = {
  async createReservation(reservation: NewReservation): Promise<Reservation> {
    const isDirectDemoPayment = reservation.payment_method === 'gcash_direct_demo';
    const reservationToCreate: NewReservation = isTestCebspotRecord(reservation)
      ? {
          ...reservation,
          fee: calculateReservationFee(reservation),
          reservation_type: 'paid',
          reservation_fee: calculateReservationFee(reservation),
          payment_required: true,
          status: reservation.status === 'confirmed' && !isDirectDemoPayment ? 'pending_payment' : reservation.status,
          payment_status: reservation.payment_status === 'not_required' ? 'pending' : reservation.payment_status,
        }
      : reservation;

    if (!hasSupabaseConfig) {
      const created: Reservation = {
        id: `local-res-${Date.now()}`,
        created_at: new Date().toISOString(),
        ...reservationToCreate,
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
      .insert(reservationToCreate)
      .select('*')
      .single();
    if (error && /column|schema cache|payment_required|reservation_type|guest_count|guest_name|guest_email|guest_phone|payment_terms_accepted|note|payment_proof_url|payer_gcash_number/i.test(error.message)) {
      const legacyReservation = toLegacyReservation(reservationToCreate);
      const retry = await supabase.from('reservations').insert(legacyReservation).select('*').single();
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      if (isReservationSlotConflict(error)) throwReservationSlotConflict();
      throw error;
    }

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

    const sampleSpot = sampleSpots.find(
      (spot) => `sample-res-${spot.id}` === id || (id === 'sample-res-cebspot-cafe' && spot.id === '66666666-6666-4666-8666-666666666666'),
    );
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

  async getSpotReservations(spotId: string, client: SupabaseClient = supabase): Promise<Reservation[]> {
    const localForSpot = localReservations.filter((reservation) => reservation.spot_id === spotId);
    if (!hasSupabaseConfig) return localForSpot;

    const { data, error } = await client
      .from('reservations')
      .select('*')
      .eq('spot_id', spotId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const reservations = await attachPaymentReferences((data ?? []).map(normalizeReservation), client);
    return attachGuestDetails(reservations, client);
  },

  subscribeToSpotReservations(
    spotId: string,
    callback: (reservations: Reservation[]) => void,
    client: SupabaseClient = supabase,
  ) {
    if (!hasSupabaseConfig) {
      callback(localReservations.filter((reservation) => reservation.spot_id === spotId));
      return () => undefined;
    }

    const channelName = `spot-reservations-${spotId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `spot_id=eq.${spotId}` },
        async () => {
          callback(await this.getSpotReservations(spotId, client));
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  },

  async approvePaidReservation(id: string, client: SupabaseClient = supabase): Promise<Reservation | null> {
    const local = localReservations.find((reservation) => reservation.id === id);
    const updatedAt = new Date().toISOString();
    if (local) {
      local.status = 'confirmed';
      local.payment_status = 'paid';
      local.updated_at = updatedAt;
      localActivitiesApprovalLog(local).catch((activityError) => {
        console.warn('Reservation approved, but activity logging failed:', activityError);
      });
      return local;
    }

    const { data: approvedData, error: approvalError } = await client.rpc('approve_paid_reservation', {
      reservation_id: id,
    });

    if (!approvalError) {
      const approved = Array.isArray(approvedData) ? approvedData[0] : approvedData;
      return approved ? normalizeReservation(approved) : null;
    }

    const rpcMissing = /approve_paid_reservation|function|schema cache/i.test(approvalError.message ?? '');
    if (!rpcMissing) throw approvalError;

    const { data, error } = await client
      .from('reservations')
      .update({
        status: 'confirmed',
        payment_status: 'paid',
        updated_at: updatedAt,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data ? normalizeReservation(data) : null;
  },

  async recordReservationAttendance(
    id: string,
    attendanceStatus: 'checked_in' | 'no_show',
    client: SupabaseClient = supabase,
  ): Promise<Reservation | null> {
    const local = localReservations.find((reservation) => reservation.id === id);
    if (local) {
      local.status = attendanceStatus;
      local.updated_at = new Date().toISOString();
      return local;
    }

    const { data, error } = await client.rpc('owner_record_reservation_attendance', {
      reservation_id: id,
      attendance_status: attendanceStatus,
    });
    if (error) throw error;

    const updated = Array.isArray(data) ? data[0] : data;
    return updated ? normalizeReservation(updated) : null;
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
      if (!allowsSelfServiceReservationChanges(local)) {
        throw new Error('This spot does not allow self-service cancellation for this reservation.');
      }
      Object.assign(local, getCancellationFields(local, reason));
      return;
    }

    const { error } = await supabase.rpc('cancel_own_free_reservation', {
      target_reservation_id: id,
      cancellation_reason_input: reason?.trim() || null,
    });
    if (error) throw error;
  },

  async voidUnpaidReservation(id: string, reason = 'Payment was not completed.'): Promise<void> {
    const local = localReservations.find((reservation) => reservation.id === id);
    if (local) {
      Object.assign(local, getCancellationFields(local, reason));
      return;
    }

    const { error } = await supabase.rpc('void_unpaid_reservation', {
      target_reservation_id: id,
      cancellation_reason: reason,
    });
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
      if (!allowsSelfServiceReservationChanges(local)) {
        throw new Error('This spot does not allow self-service adjustments for this reservation.');
      }
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

    const { error } = await supabase.rpc('reschedule_own_free_reservation', {
      target_reservation_id: id,
      reservation_date_input: reservationDate,
    });
    if (error) {
      if (isReservationSlotConflict(error)) throwReservationSlotConflict();
      throw error;
    }
  },
};
