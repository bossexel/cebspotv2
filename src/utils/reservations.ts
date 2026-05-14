import type { PaymentStatus, Reservation, ReservationStatus, ReservationType, Spot } from '../types';

export function calculateReservationFee(spot: Pick<Spot, 'reservation_fee'>) {
  return Math.max(0, Number(spot.reservation_fee ?? 0));
}

export function getSpotReservationType(spot: Pick<Spot, 'reservation_fee' | 'reservation_type' | 'payment_required'>): ReservationType {
  if (spot.reservation_type) return spot.reservation_type;
  return spot.payment_required || calculateReservationFee(spot) > 0 ? 'paid' : 'free';
}

export function isPaymentRequired(spot: Pick<Spot, 'reservation_fee' | 'reservation_type' | 'payment_required'>) {
  return getSpotReservationType(spot) === 'paid';
}

export function getReservationTypeLabel(typeOrReservation: ReservationType | Pick<Reservation, 'reservation_type' | 'reservation_fee'>) {
  const type = typeof typeOrReservation === 'string' ? typeOrReservation : typeOrReservation.reservation_type;
  const fee = typeof typeOrReservation === 'string' ? 0 : Number(typeOrReservation.reservation_fee ?? 0);
  return type === 'paid' ? `Reservation Fee: ₱${fee}` : 'Free Reservation';
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

export async function checkReservationAvailability() {
  return true;
}
