import { makeSampleReservation, sampleSpots } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewReservation, Reservation } from '../types';
import { activityService } from './activityService';

const localReservations: Reservation[] = [];

function normalizeReservation(row: any): Reservation {
  return {
    ...row,
    guests: Number(row.guests),
    fee: Number(row.fee ?? 0),
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

    const { data, error } = await supabase
      .from('reservations')
      .insert(reservation)
      .select('*')
      .single();
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

    const channel = supabase
      .channel(`reservations-${userId}`)
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
};
