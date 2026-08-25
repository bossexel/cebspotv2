import type { PaymentStatus, Reservation, ReservationStatus, ReservationType, Spot } from '../types';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

export const testCebspotSpotId = '66666666-6666-4666-8666-666666666666';
export const testCebspotReservationFee = 150;

type ReservationPricingSource = Partial<
  Pick<Spot, 'id' | 'name' | 'reservation_fee' | 'reservation_type' | 'payment_required' | 'gcash_amount' | 'gcash_wallet_name'>
> &
  Partial<
    Pick<
      Reservation,
      'spot_id' | 'spot_name' | 'fee' | 'reservation_fee' | 'reservation_type' | 'payment_required'
    >
  >;

export function isTestCebspotRecord(record?: ReservationPricingSource | null) {
  if (!record) return false;
  const normalizedName = `${record.name ?? ''} ${record.spot_name ?? ''} ${record.gcash_wallet_name ?? ''}`.toLowerCase();
  return (
    record.id === testCebspotSpotId ||
    record.spot_id === testCebspotSpotId ||
    normalizedName.includes('test cebspot') ||
    normalizedName.includes('cebspot cafe')
  );
}

export function calculateReservationFee(record: Pick<Spot, 'reservation_fee'> | ReservationPricingSource) {
  const source = record as ReservationPricingSource;
  const amount = Math.max(0, Number(source.reservation_fee ?? 0), Number(source.gcash_amount ?? 0), Number(source.fee ?? 0));
  return amount > 0 ? amount : isTestCebspotRecord(record as ReservationPricingSource) ? testCebspotReservationFee : 0;
}

export function getSpotReservationType(
  spot: Pick<Spot, 'reservation_fee' | 'reservation_type' | 'payment_required'> | ReservationPricingSource,
): ReservationType {
  if (isTestCebspotRecord(spot as ReservationPricingSource)) return 'paid';
  if ((spot as ReservationPricingSource).reservation_type === 'paid') return 'paid';
  return (spot as ReservationPricingSource).payment_required || calculateReservationFee(spot) > 0 ? 'paid' : 'free';
}

export function isPaymentRequired(
  spot: Pick<Spot, 'reservation_fee' | 'reservation_type' | 'payment_required'> | ReservationPricingSource,
) {
  return getSpotReservationType(spot) === 'paid';
}

export function getReservationTypeLabel(typeOrReservation: ReservationType | ReservationPricingSource) {
  const type = typeof typeOrReservation === 'string' ? typeOrReservation : getSpotReservationType(typeOrReservation);
  const fee = typeof typeOrReservation === 'string' ? 0 : calculateReservationFee(typeOrReservation);
  return type === 'paid' ? `Reservation Fee: PHP ${fee}` : 'Free Reservation';
}

function hashReservationId(value: string) {
  return value.split('').reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 10000, 0);
}

export function getReservationBookingId(reservation: Pick<Reservation, 'id'>) {
  const digits = reservation.id.replace(/\D/g, '');
  const numericId = digits ? digits.slice(-4) : String(hashReservationId(reservation.id));
  return numericId.padStart(4, '0');
}

export function getReservationUniqueId(reservation: Pick<Reservation, 'id' | 'qr_code' | 'created_at'>) {
  const qrDigits = reservation.qr_code?.match(/(\d{8,})$/)?.[1];
  if (qrDigits) return qrDigits;

  const createdAt = new Date(reservation.created_at).getTime();
  if (!Number.isNaN(createdAt)) return String(Math.floor(createdAt / 1000));

  return reservation.id.replace(/-/g, '').slice(-10).toUpperCase();
}

export function getReservationDisplayRef(reservation: Pick<Reservation, 'id' | 'qr_code' | 'created_at'>) {
  return `CEBSPOT-${getReservationBookingId(reservation)}-${getReservationUniqueId(reservation)}`;
}

export function formatGuestCount(count?: number | null) {
  const guests = Math.max(1, Number(count ?? 1) || 1);
  return `${guests} ${guests === 1 ? 'Guest' : 'Guests'}`;
}

export function formatReservationDateTime(reservation: Pick<Reservation, 'reservation_date' | 'reservation_time'>) {
  const timeMatch = String(reservation.reservation_time ?? '').match(/^(\d{1,2}):(\d{2})/);
  const hour = Number(timeMatch?.[1] ?? 0);
  const minute = Number(timeMatch?.[2] ?? 0);
  const date = new Date(`${reservation.reservation_date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);

  if (Number.isNaN(date.getTime())) {
    return `${reservation.reservation_date}${reservation.reservation_time ? ` • ${reservation.reservation_time}` : ''}`;
  }

  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${formattedDate} • ${formattedTime}`;
}

export function getPaymentStatusLabel(status?: PaymentStatus | string | null) {
  switch (status) {
    case 'not_required':
      return 'Not Required';
    case 'pending':
      return 'Pending';
    case 'paid':
      return 'Paid';
    case 'failed':
      return 'Failed';
    case 'refund_pending':
      return 'Refund Review';
    case 'refunded':
      return 'Refunded';
    case 'non_refundable':
      return 'Non-refundable';
    default:
      return 'Pending';
  }
}

export function getReservationStatusLabel(status?: ReservationStatus | string | null) {
  switch (status) {
    case 'pending_payment':
      return 'Pending Payment';
    case 'confirmed':
      return 'Confirmed';
    case 'cancelled':
      return 'Cancelled';
    case 'rescheduled':
      return 'Rescheduled';
    case 'completed':
      return 'Completed';
    case 'no_show':
      return 'No Show';
    case 'pending':
    default:
      return 'Pending';
  }
}

export type ReservationAvailabilityInput = {
  spotId?: string | null;
  reservationDate?: string | null;
  slotId?: string | null;
  tableId?: string | null;
  excludeReservationId?: string | null;
};

let reservationAvailabilityRpcWarningShown = false;

export async function checkReservationAvailability(input: ReservationAvailabilityInput = {}) {
  const { spotId, reservationDate, slotId, tableId, excludeReservationId } = input;

  if (!hasSupabaseConfig || !spotId || !reservationDate || !slotId || !tableId) {
    return true;
  }

  const { data, error } = await supabase.rpc('check_reservation_slot_available', {
    target_spot_id: spotId,
    target_reservation_date: reservationDate,
    target_slot_id: slotId,
    target_table_id: tableId,
    excluded_reservation_id: excludeReservationId ?? null,
  });

  if (!error) return Boolean(data);

  const rpcMissing = /check_reservation_slot_available|function|schema cache/i.test(error.message ?? '');
  if (!rpcMissing) throw error;

  if (!reservationAvailabilityRpcWarningShown) {
    reservationAvailabilityRpcWarningShown = true;
    console.warn('Reservation availability RPC is missing. Run the latest supabase-schema.sql to enforce table locking.');
  }
  return true;
}
