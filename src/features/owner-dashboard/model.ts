import type { Reservation, Review, Spot } from '../../types';

export type OwnerGalleryItem = {
  id: string;
  url: string;
  source: 'owner' | 'community';
  createdAt: string;
};

export function getReviewsRating(reviews: Review[]) {
  const ratedReviews = reviews.filter((review) => Number(review.rating) > 0);
  if (!ratedReviews.length) return 0;
  return ratedReviews.reduce((sum, review) => sum + Number(review.rating), 0) / ratedReviews.length;
}

function ownerPhotoDate(url: string, fallback: string) {
  try {
    const match = decodeURIComponent(url).match(/owner-gallery[^/]*\/[^/]*\/(\d{13})-/);
    return match ? new Date(Number(match[1])).toISOString() : fallback;
  } catch {
    return fallback;
  }
}

export function buildOwnerGallery(spot: Spot | null, reviews: Review[]) {
  if (!spot) return [];

  const items: OwnerGalleryItem[] = [];
  const seen = new Set<string>();
  const ownerFallback = spot.created_at || spot.updated_at || new Date(0).toISOString();

  for (const [index, rawUrl] of (spot.images ?? []).entries()) {
    const url = rawUrl?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    items.push({
      id: `owner-${index}-${url}`,
      url,
      source: 'owner',
      createdAt: ownerPhotoDate(url, ownerFallback),
    });
  }

  for (const review of reviews) {
    for (const [index, rawUrl] of (review.media_urls ?? []).entries()) {
      if (review.media_types?.[index] === 'video') continue;
      const url = rawUrl?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push({
        id: `community-${review.id}-${index}`,
        url,
        source: 'community',
        createdAt: review.created_at,
      });
    }
  }

  return items;
}

export function formatPeso(amount: number) {
  return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function compactPeso(amount: number) {
  return `PHP ${amount.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

export function isApprovedReservation(reservation: Reservation) {
  return ['confirmed', 'checked_in', 'completed'].includes(reservation.status);
}

export function isPendingPayment(reservation: Reservation) {
  return reservation.payment_required && reservation.payment_status === 'pending';
}

export function isPaymongoReservation(reservation: Reservation) {
  return reservation.payment_method === 'paymongo_gcash' || reservation.payment_method === 'paymongo_qrph';
}

export function getPaymongoMethodLabel(reservation: Reservation) {
  return reservation.payment_method === 'paymongo_qrph' ? 'PayMongo QR Ph' : 'PayMongo GCash';
}

function isAlreadySettled(reservation: Reservation) {
  return reservation.payment_status === 'paid' || ['confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'].includes(reservation.status);
}

// PayMongo confirms automatically through its webhook; owners approve manual payments.
export function canManuallyApproveReservation(reservation: Reservation) {
  return reservation.payment_required && !isPaymongoReservation(reservation) && !isAlreadySettled(reservation);
}

export function canRejectManualPayment(reservation: Reservation) {
  return reservation.payment_required && reservation.payment_method === 'gcash'
    && ['pending','pending_payment','rescheduled'].includes(reservation.status)
    && ['pending','unpaid','failed'].includes(reservation.payment_status)
    && Boolean(reservation.proof_submitted_at && reservation.payment_proof_url?.trim() && reservation.payment_reference?.trim())
    && !reservation.paid_at && !reservation.approved_by && reservation.financial_resolution !== 'resolution_required'
    && !['pending_review','approved'].includes(reservation.refund_status ?? '');
}

export function canRecordAttendance(reservation: Reservation) {
  if (['checked_in', 'completed', 'cancelled', 'no_show'].includes(reservation.status)) return false;
  if (reservation.payment_required && reservation.payment_status !== 'paid') return false;
  return ['pending', 'confirmed', 'rescheduled'].includes(reservation.status);
}

// Proof must be reviewed before approval. A reference is required when no proof exists.
export function getApprovalGateReason(reservation: Reservation, viewedProofIds: Set<string>): string | null {
  if (!canManuallyApproveReservation(reservation)) return null;
  const hasProof = Boolean(reservation.payment_proof_url);
  if (hasProof && !viewedProofIds.has(reservation.id)) {
    return 'Review proof first';
  }
  if (!hasProof && !reservation.payment_reference?.trim()) {
    return 'No proof or reference yet';
  }
  return null;
}

export function getReservationGuestName(reservation: Reservation) {
  return reservation.guest_name?.trim() || reservation.guest_email?.trim() || `Guest ${reservation.user_id.slice(0, 8)}`;
}
