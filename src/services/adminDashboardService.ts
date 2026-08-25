import type { SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { makeSampleReservation, sampleActivities, sampleReviews, sampleSpots } from '../constants/sampleData';
import type { Activity, OwnerAccessRequest, Reservation, Spot, SpotEditSuggestion, SpotSubmission, UserProfile } from '../types';

export type AdminMetricSnapshot = {
  totalSpots: number;
  publicSpots: number;
  reservableSpots: number;
  spotsToday: number;
  totalReservations: number;
  reservationsToday: number;
  reservations30d: number;
  confirmedReservations: number;
  estimatedRevenue: number;
  activeOwners: number;
  totalUsers: number;
  reportsFiled: number;
  pendingOwnerRequests: number;
  pendingSpotSubmissions: number;
};

export type AdminProgressItem = {
  label: string;
  value: number;
  copy?: string;
};

export type AdminDailyInsight = {
  key: string;
  label: string;
  reservations: number;
  reservationBar: number;
  newSpots: number;
  newSpotBar: number;
  estimatedRevenue: number;
  totalSpots: number;
  activeOwners: number;
  reportsFiled: number;
};

export type AdminListingRow = {
  id: string;
  name: string;
  category: string;
  barangay: string;
  status: string;
  date: string;
  image: string;
};

export type AdminPulseRow = {
  id: string;
  action: string;
  user: string;
  location: string;
  value: string;
  status: string;
};

export type AdminReportSource = 'review_report' | 'spot_edit_suggestion';

export type AdminReportCoordinate = {
  latitude: number;
  longitude: number;
};

export type AdminReportReviewContext = {
  id: string;
  author: string;
  rating: number | null;
  comment: string;
  date: string;
  flagged?: boolean;
  mediaUrls?: string[];
};

export type AdminReportRow = {
  id: string;
  source: AdminReportSource;
  createdAt?: string | null;
  type: string;
  spotId?: string | null;
  reviewId?: string | null;
  field?: string | null;
  currentValue?: string | null;
  suggestedValue?: string | null;
  currentCoordinate?: AdminReportCoordinate | null;
  suggestedCoordinate?: AdminReportCoordinate | null;
  spot: string;
  area: string;
  reporter: string;
  date: string;
  description: string;
  reviewAuthor?: string | null;
  reviewRating?: number | null;
  reviewComment?: string | null;
  reviewDate?: string | null;
  reviewMediaUrls?: string[] | null;
  reviewThread?: AdminReportReviewContext[];
  note?: string | null;
  expanded?: boolean;
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  location: string;
  joined: string;
  avatar: string;
};

export type AdminOwnerRequestRow = {
  id: string;
  applicant: string;
  initials: string;
  email: string;
  spot: string;
  category: string;
  barangay: string;
  applied: string;
  status: string;
  message?: string | null;
  adminNotes?: string | null;
  expanded?: boolean;
};

export type AdminSpotSubmissionRow = {
  id: string;
  name: string;
  category: string;
  barangay: string;
  submitted: string;
  status: string;
  image: string;
  voteCount: number;
  searchCount: number;
  similarSubmissionCount: number;
  popularityScore: number;
  description?: string | null;
};

export type AdminDashboardData = {
  source: 'live' | 'sample';
  generatedAt: string;
  metrics: AdminMetricSnapshot;
  reservationsBars: number[];
  reservationBarLabels: string[];
  newSpotBars: number[];
  newSpotBarLabels: string[];
  dailyInsights: AdminDailyInsight[];
  categories: AdminProgressItem[];
  barangays: AdminProgressItem[];
  recentListings: AdminListingRow[];
  livePulse: AdminPulseRow[];
  reports: AdminReportRow[];
  users: AdminUserRow[];
  ownerRequests: AdminOwnerRequestRow[];
  pendingSubmissions: AdminSpotSubmissionRow[];
  errors: string[];
};

const fallbackSpotImage =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=240';

function numberValue(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgo(days: number) {
  const date = startOfToday();
  date.setDate(date.getDate() - days);
  return date;
}

function formatShortDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(value: number) {
  return `P ${Math.round(value).toLocaleString('en-US')}`;
}

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || 'CebSpot User').trim();
  const words = source.includes('@') ? [source.charAt(0)] : source.split(/\s+/).slice(0, 2);
  return words.map((word) => word.charAt(0).toUpperCase()).join('') || 'CU';
}

function getBarangay(address?: string | null) {
  const fallback = 'Cebu City';
  if (!address) return fallback;
  const barangayMatch = address.match(/Barangay\s+([^,]+)/i);
  if (barangayMatch?.[1]) return barangayMatch[1].trim();
  const firstPart = address.split(',')[0]?.trim();
  return firstPart || fallback;
}

function toStatusLabel(value?: string | null) {
  if (!value) return 'Pending';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function toAdminReportType(reason?: string | null) {
  const lower = (reason ?? '').toLowerCase();
  if (/hate|harass|bully|porn|nudity|offensive|child|minor/.test(lower)) return 'Offensive Content';
  if (/wrong|incorrect|inaccurate|misleading|address|location|map|pin|website|contact|opening|description|category/.test(lower)) {
    return 'Wrong Info';
  }
  if (/fake|fraud|scam|spam/.test(lower)) return 'Fake Review';
  return 'Spot Issue';
}

function parseReportCoordinate(value?: string | null): AdminReportCoordinate | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const latitude = Number(parsed?.latitude);
    const longitude = Number(parsed?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function normalizeReviewThread(value: unknown): AdminReportReviewContext[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    id: String(item.id),
    author: item.author ?? item.user_name ?? 'CebSpot user',
    rating: item.rating == null ? null : numberValue(item.rating),
    comment: item.comment ?? '',
    date: item.date ?? formatShortDate(item.created_at),
    flagged: Boolean(item.flagged),
    mediaUrls: stringArray(item.mediaUrls ?? item.media_urls),
  }));
}

function normalizeDailyInsights(rows: any[] = []): AdminDailyInsight[] {
  const reservationBars = toPercentSeries(rows.map((row) => numberValue(row.reservations ?? row.reservation_count)));
  const newSpotBars = toPercentSeries(rows.map((row) => numberValue(row.newSpots ?? row.new_spots ?? row.spot_count)));

  return rows.map((row, index) => ({
    key: String(row.key ?? row.day ?? row.date ?? index),
    label: row.label ?? '-',
    reservations: numberValue(row.reservations ?? row.reservation_count),
    reservationBar: numberValue(row.reservationBar ?? row.reservation_bar ?? reservationBars[index]),
    newSpots: numberValue(row.newSpots ?? row.new_spots ?? row.spot_count),
    newSpotBar: numberValue(row.newSpotBar ?? row.new_spot_bar ?? newSpotBars[index]),
    estimatedRevenue: numberValue(row.estimatedRevenue ?? row.estimated_revenue),
    totalSpots: numberValue(row.totalSpots ?? row.total_spots),
    activeOwners: numberValue(row.activeOwners ?? row.active_owners),
    reportsFiled: numberValue(row.reportsFiled ?? row.reports_filed),
  }));
}

function normalizeAdminReportRows(rows: any[] = []): AdminReportRow[] {
  return rows.map((row, index) => {
    const source: AdminReportSource = row.source === 'spot_edit_suggestion' ? 'spot_edit_suggestion' : 'review_report';
    const currentValue = row.currentValue ?? row.current_value ?? null;
    const suggestedValue = row.suggestedValue ?? row.suggested_value ?? null;
    return {
      id: String(row.id),
      source,
      createdAt: row.createdAt ?? row.created_at ?? null,
      type: row.type ?? 'Spot Issue',
      spotId: row.spotId ?? row.spot_id ?? null,
      reviewId: row.reviewId ?? row.review_id ?? null,
      field: row.field ?? null,
      currentValue,
      suggestedValue,
      currentCoordinate: parseReportCoordinate(currentValue),
      suggestedCoordinate: parseReportCoordinate(suggestedValue),
      spot: row.spot ?? 'Reported spot',
      area: row.area ?? 'Cebu City',
      reporter: row.reporter ?? 'AN',
      date: row.date ?? '-',
      description: row.description ?? 'A community member flagged this item.',
      reviewAuthor: row.reviewAuthor ?? row.review_author ?? null,
      reviewRating: row.reviewRating == null && row.review_rating == null ? null : numberValue(row.reviewRating ?? row.review_rating),
      reviewComment: row.reviewComment ?? row.review_comment ?? null,
      reviewDate: row.reviewDate ?? row.review_date ?? null,
      reviewMediaUrls: stringArray(row.reviewMediaUrls ?? row.review_media_urls),
      reviewThread: normalizeReviewThread(row.reviewThread ?? row.review_thread),
      note: row.note ?? null,
      expanded: Boolean(row.expanded ?? index === 0),
    };
  });
}

function formatSuggestionDescription(suggestion: SpotEditSuggestion) {
  const field = suggestion.field || 'Spot detail';
  const note = suggestion.note?.trim();
  if (/location|map|pin/i.test(field)) {
    return note ? `Suggested a corrected map pin. Note: ${note}` : 'Suggested a corrected map pin.';
  }
  const value = suggestion.suggested_value?.trim();
  const base = value ? `Suggested ${field}: ${value}` : `Suggested an update for ${field}.`;
  return note ? `${base} Note: ${note}` : base;
}

function normalizeSpot(row: any): Spot {
  return {
    ...row,
    latitude: numberValue(row.latitude),
    longitude: numberValue(row.longitude),
    rating: row.rating == null ? null : numberValue(row.rating),
    review_count: numberValue(row.review_count),
    reservation_fee: numberValue(row.reservation_fee),
    is_public: Boolean(row.is_public),
    is_reservable: Boolean(row.is_reservable),
    images: Array.isArray(row.images) ? row.images : [],
  };
}

function normalizeReservation(row: any): Reservation {
  return {
    ...row,
    guest_count: numberValue(row.guest_count ?? row.guests ?? 1),
    guests: numberValue(row.guests ?? row.guest_count ?? 1),
    fee: numberValue(row.fee),
    reservation_fee: numberValue(row.reservation_fee ?? row.fee),
    payment_required: Boolean(row.payment_required),
    reservation_type: row.reservation_type ?? 'free',
    status: row.status ?? 'pending',
    payment_status: row.payment_status ?? 'not_required',
  };
}

function toPercentSeries(counts: number[]) {
  const max = Math.max(...counts, 1);
  return counts.map((count) => Math.max(count ? 18 : 6, Math.round((count / max) * 100)));
}

function buildDailySeries(rows: Array<{ created_at?: string | null }>, days = 10) {
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = daysAgo(days - index - 1);
    return {
      key: date.toISOString().slice(0, 10),
      count: 0,
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  });

  rows.forEach((row) => {
    const key = row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : '';
    const bucket = buckets.find((item) => item.key === key);
    if (bucket) bucket.count += 1;
  });

  return {
    bars: toPercentSeries(buckets.map((bucket) => bucket.count)),
    labels: [buckets[0]?.label ?? '', buckets[Math.floor(days / 2)]?.label ?? '', buckets[days - 1]?.label ?? ''],
  };
}

function getDateKey(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function isOnOrBefore(value: string | null | undefined, target: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date <= target;
}

function isPaidReservation(reservation: Reservation) {
  return ['confirmed', 'completed'].includes(reservation.status) && reservation.payment_status === 'paid';
}

function buildDailyInsights(input: {
  spots: Spot[];
  reservations: Reservation[];
  users: UserProfile[];
  reports: AdminReportRow[];
}, days = 10): AdminDailyInsight[] {
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = daysAgo(days - index - 1);
    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    return {
      key: dayStart.toISOString().slice(0, 10),
      label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayEnd,
      reservations: 0,
      newSpots: 0,
      estimatedRevenue: 0,
      totalSpots: 0,
      activeOwners: 0,
      reportsFiled: 0,
    };
  });

  input.reservations.forEach((reservation) => {
    const bucket = buckets.find((item) => item.key === getDateKey(reservation.created_at));
    if (!bucket) return;
    bucket.reservations += 1;
    if (isPaidReservation(reservation)) {
      bucket.estimatedRevenue += numberValue(reservation.reservation_fee || reservation.fee);
    }
  });

  input.spots.forEach((spot) => {
    const bucket = buckets.find((item) => item.key === getDateKey(spot.created_at));
    if (bucket) bucket.newSpots += 1;
  });

  input.reports.forEach((report) => {
    const bucket = buckets.find((item) => item.key === getDateKey(report.createdAt));
    if (bucket) bucket.reportsFiled += 1;
  });

  const reservationBars = toPercentSeries(buckets.map((bucket) => bucket.reservations));
  const newSpotBars = toPercentSeries(buckets.map((bucket) => bucket.newSpots));

  return buckets.map((bucket, index) => ({
    key: bucket.key,
    label: bucket.label,
    reservations: bucket.reservations,
    reservationBar: reservationBars[index],
    newSpots: bucket.newSpots,
    newSpotBar: newSpotBars[index],
    estimatedRevenue: bucket.estimatedRevenue,
    totalSpots: input.spots.filter((spot) => isOnOrBefore(spot.created_at, bucket.dayEnd)).length,
    activeOwners: input.users.filter((user) => user.role === 'owner' && isOnOrBefore(user.created_at, bucket.dayEnd)).length,
    reportsFiled: bucket.reportsFiled,
  }));
}

function buildProgress(items: Array<{ label: string }>, limit = 5): AdminProgressItem[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const label = item.label || 'Uncategorized';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  const max = Math.max(...top.map(([, count]) => count), 1);
  return top.map(([label, count]) => ({
    label,
    value: Math.max(8, Math.round((count / max) * 100)),
    copy: `${count} ${count === 1 ? 'spot' : 'spots'}`,
  }));
}

function mapListing(spot: Spot): AdminListingRow {
  return {
    id: spot.id,
    name: spot.name,
    category: spot.category,
    barangay: getBarangay(spot.address),
    status: spot.is_public ? 'Verified' : 'Pending',
    date: formatShortDate(spot.created_at),
    image: spot.images?.[0] ?? fallbackSpotImage,
  };
}

function mapPulseFromReservation(reservation: Reservation): AdminPulseRow {
  return {
    id: reservation.id,
    action: 'New Reservation',
    user: reservation.user_id ? `User ${reservation.user_id.slice(0, 8)}` : 'Guest',
    location: reservation.spot_name,
    value: formatMoney(numberValue(reservation.reservation_fee || reservation.fee)),
    status: toStatusLabel(reservation.status),
  };
}

function mapPulseFromActivity(activity: Activity): AdminPulseRow {
  const isDone = /approved|reserved|confirmed|paid|discovered/i.test(
    `${activity.action ?? ''} ${activity.type ?? ''}`,
  );
  return {
    id: activity.id,
    action: toStatusLabel(activity.action || activity.type || 'Activity'),
    user: activity.user_name || 'CebSpot user',
    location: activity.spot_name || activity.target_name || 'CebSpot',
    value: '-',
    status: isDone ? 'Success' : 'Pending',
  };
}

function mapUser(profile: UserProfile): AdminUserRow {
  const location =
    typeof profile.location === 'object' && profile.location?.address
      ? profile.location.address
      : 'Cebu City';
  const name = profile.display_name || profile.email?.split('@')[0] || 'CebSpot user';
  return {
    id: profile.id,
    name,
    email: profile.email,
    role: toStatusLabel(profile.role),
    location,
    joined: formatShortDate(profile.created_at),
    avatar: getInitials(name, profile.email),
  };
}

function mapOwnerRequest(request: OwnerAccessRequest): AdminOwnerRequestRow {
  return {
    id: request.id,
    applicant: request.contact_name || request.contact_email?.split('@')[0] || 'Applicant',
    initials: getInitials(request.contact_name, request.contact_email),
    email: request.contact_email,
    spot: request.spot_name,
    category: request.category,
    barangay: getBarangay(request.spot_address),
    applied: formatShortDate(request.created_at),
    status: toStatusLabel(request.status),
    message: request.message,
    adminNotes: request.admin_notes,
  };
}

function normalizeSubmission(row: any): SpotSubmission {
  return {
    ...row,
    latitude: numberValue(row.latitude),
    longitude: numberValue(row.longitude),
    reservation_fee: numberValue(row.reservation_fee),
    payment_required: Boolean(row.payment_required),
    is_reservable: Boolean(row.is_reservable),
    images: Array.isArray(row.images) ? row.images : [],
    status: row.status ?? 'pending',
  };
}

function mapSubmission(submission: SpotSubmission): AdminSpotSubmissionRow {
  return {
    id: submission.id,
    name: submission.name,
    category: submission.category,
    barangay: getBarangay(submission.address),
    submitted: formatShortDate(submission.created_at),
    status: toStatusLabel(submission.status),
    image: submission.images?.[0] ?? fallbackSpotImage,
    voteCount: numberValue((submission as any).vote_count),
    searchCount: numberValue((submission as any).search_count),
    similarSubmissionCount: numberValue((submission as any).similar_submission_count),
    popularityScore: numberValue((submission as any).popularity_score),
    description: submission.description,
  };
}

function buildDashboardFromRows(input: {
  source: 'live' | 'sample';
  spots: Spot[];
  reservations: Reservation[];
  activities: Activity[];
  users: UserProfile[];
  ownerRequests: OwnerAccessRequest[];
  pendingSubmissions: SpotSubmission[];
  reports: AdminReportRow[];
  errors?: string[];
}): AdminDashboardData {
  const now = new Date();
  const today = startOfToday();
  const thirtyDaysAgo = daysAgo(29);
  const spotsToday = input.spots.filter((spot) => new Date(spot.created_at) >= today).length;
  const reservationsToday = input.reservations.filter((reservation) => new Date(reservation.created_at) >= today).length;
  const reservations30d = input.reservations.filter((reservation) => new Date(reservation.created_at) >= thirtyDaysAgo).length;
  const confirmedReservations = input.reservations.filter((reservation) =>
    ['confirmed', 'completed'].includes(reservation.status),
  ).length;
  const estimatedRevenue = input.reservations.reduce((sum, reservation) => {
    return isPaidReservation(reservation) ? sum + numberValue(reservation.reservation_fee || reservation.fee) : sum;
  }, 0);
  const publicSpots = input.spots.filter((spot) => spot.is_public);
  const reservationSeries = buildDailySeries(input.reservations);
  const spotSeries = buildDailySeries(publicSpots);
  const dailyInsights = buildDailyInsights({
    spots: publicSpots,
    reservations: input.reservations,
    users: input.users,
    reports: input.reports,
  });
  const users = input.users.map(mapUser);
  const ownerRequests = input.ownerRequests.map(mapOwnerRequest);
  const pendingSubmissions = input.pendingSubmissions.map(mapSubmission);

  return {
    source: input.source,
    generatedAt: now.toISOString(),
    metrics: {
      totalSpots: input.spots.length,
      publicSpots: input.spots.filter((spot) => spot.is_public).length,
      reservableSpots: input.spots.filter((spot) => spot.is_reservable).length,
      spotsToday,
      totalReservations: input.reservations.length,
      reservationsToday,
      reservations30d,
      confirmedReservations,
      estimatedRevenue,
      activeOwners: input.users.filter((user) => user.role === 'owner').length,
      totalUsers: input.users.length,
      reportsFiled: input.reports.length,
      pendingOwnerRequests: input.ownerRequests.filter((request) => request.status === 'pending').length,
      pendingSpotSubmissions: input.pendingSubmissions.length,
    },
    reservationsBars: reservationSeries.bars,
    reservationBarLabels: reservationSeries.labels,
    newSpotBars: spotSeries.bars,
    newSpotBarLabels: spotSeries.labels,
    dailyInsights,
    categories: buildProgress(publicSpots.map((spot) => ({ label: spot.category }))),
    barangays: buildProgress(publicSpots.map((spot) => ({ label: getBarangay(spot.address) }))),
    recentListings: input.spots.slice(0, 8).map(mapListing),
    livePulse: [
      ...input.reservations.slice(0, 5).map(mapPulseFromReservation),
      ...input.activities.slice(0, 5).map(mapPulseFromActivity),
    ].slice(0, 8),
    reports: input.reports,
    users,
    ownerRequests,
    pendingSubmissions,
    errors: input.errors ?? [],
  };
}

function sampleDashboard(): AdminDashboardData {
  const reservations = sampleSpots.slice(0, 18).map(makeSampleReservation);
  const users: UserProfile[] = [
    {
      id: 'sample-user',
      display_name: 'Exiel',
      email: 'exielramen@gmail.com',
      role: 'user',
      photo_url: null,
      location: { lat: 10.3157, lng: 123.8854, address: 'Mabolo, Cebu City' },
      level: 1,
      points: 0,
      friends: [],
      created_at: new Date().toISOString(),
    },
    {
      id: 'sample-owner',
      display_name: 'Clyde',
      email: 'testowner@cebspot.com',
      role: 'owner',
      photo_url: null,
      location: { lat: 10.33, lng: 123.9, address: 'Lahug, Cebu City' },
      level: 1,
      points: 0,
      friends: [],
      created_at: new Date().toISOString(),
    },
  ];
  const ownerRequests: OwnerAccessRequest[] = [
    {
      id: 'sample-owner-request',
      requester_id: 'sample-owner',
      contact_name: 'Clyde',
      contact_email: 'testowner@cebspot.com',
      spot_name: 'Test Cebspot Restaurant',
      spot_address: 'Barangay Apas, Cebu City',
      category: 'Restaurant',
      access_needs: ['Reservations', 'Payments'],
      message: 'Demo owner request for the admin console.',
      status: 'pending',
      admin_notes: null,
      created_at: new Date().toISOString(),
    },
  ];
  const reports = sampleReviews.slice(0, 3).map((review, index) => {
    const spot = sampleSpots.find((item) => item.id === review.spot_id);
    return {
      id: `sample-report-${review.id}`,
      source: 'review_report' as const,
      createdAt: review.created_at,
      type: index === 0 ? 'Spot Issue' : index === 1 ? 'Fake Review' : 'Wrong Info',
      spotId: spot?.id ?? null,
      reviewId: review.id,
      spot: spot?.name ?? 'CebSpot',
      area: spot?.address ?? 'Cebu City',
      reporter: getInitials(review.user_name),
      date: formatShortDate(review.created_at),
      description: review.comment || 'This review was flagged for admin review.',
      reviewAuthor: review.user_name ?? null,
      reviewRating: review.rating,
      reviewComment: review.comment ?? null,
      reviewDate: formatShortDate(review.created_at),
      reviewMediaUrls: stringArray(review.media_urls),
      reviewThread: sampleReviews
        .filter((item) => item.spot_id === review.spot_id)
        .map((item) => ({
          id: item.id,
          author: item.user_name ?? 'CebSpot user',
          rating: item.rating,
          comment: item.comment ?? '',
          date: formatShortDate(item.created_at),
          flagged: item.id === review.id,
          mediaUrls: stringArray(item.media_urls),
        })),
      expanded: index === 1,
    };
  });

  return buildDashboardFromRows({
    source: 'sample',
    spots: sampleSpots.map(normalizeSpot),
    reservations,
    activities: sampleActivities,
    users,
    ownerRequests,
    pendingSubmissions: [],
    reports,
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingAdminDashboardRpc(error: any) {
  return /get_admin_dashboard|schema cache|could not find the function|pgrst202/i.test(
    error?.message ?? error?.details ?? errorMessage(error),
  );
}

async function withTimeout<T>(task: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out. Check your Supabase connection and try again.`)), timeoutMs);
  });

  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function readTable<T>(label: string, task: PromiseLike<{ data: T[] | null; error: any }>, errors: string[]) {
  const { data, error } = await task;
  if (error) {
    errors.push(`${label}: ${error.message ?? 'Unable to read table.'}`);
    return [];
  }
  return data ?? [];
}

export async function getAdminDashboardData(client: SupabaseClient = supabase): Promise<AdminDashboardData> {
  if (!hasSupabaseConfig) return sampleDashboard();

  const { data: rpcData, error: rpcError } = await client.rpc('get_admin_dashboard');
  if (!rpcError && rpcData) {
    const rows = rpcData as any;
    const data = sampleDashboard();
    const dailyInsights = normalizeDailyInsights(rows.dailyInsights ?? rows.daily_insights ?? []);
    const reservationRows = rows.reservationsDaily ?? rows.reservations_daily ?? [];
    const spotRows = rows.newSpotsDaily ?? rows.new_spots_daily ?? [];
    return {
      ...data,
      source: 'live',
      generatedAt: rows.generatedAt ?? rows.generated_at ?? new Date().toISOString(),
      metrics: { ...data.metrics, ...(rows.metrics ?? {}) },
      reservationsBars: dailyInsights.length
        ? dailyInsights.map((item) => item.reservationBar)
        : toPercentSeries(reservationRows.map((item: any) => numberValue(item.count))),
      reservationBarLabels: dailyInsights.length
        ? dailyInsights.map((item) => item.label).filter(Boolean).slice(-3)
        : reservationRows.map((item: any) => item.label).filter(Boolean).slice(-3),
      newSpotBars: dailyInsights.length
        ? dailyInsights.map((item) => item.newSpotBar)
        : toPercentSeries(spotRows.map((item: any) => numberValue(item.count))),
      newSpotBarLabels: dailyInsights.length
        ? dailyInsights.map((item) => item.label).filter(Boolean).slice(-3)
        : spotRows.map((item: any) => item.label).filter(Boolean).slice(-3),
      dailyInsights: dailyInsights.length ? dailyInsights : data.dailyInsights,
      categories: rows.categories ?? data.categories,
      barangays: rows.barangays ?? data.barangays,
      recentListings: rows.recentListings ?? data.recentListings,
      livePulse: rows.livePulse ?? data.livePulse,
      reports: normalizeAdminReportRows(rows.reports ?? data.reports),
      users: rows.users ?? data.users,
      ownerRequests: rows.ownerRequests ?? data.ownerRequests,
      pendingSubmissions: rows.pendingSubmissions ?? data.pendingSubmissions,
      errors: [],
    };
  }

  const errors =
    rpcError && !isMissingAdminDashboardRpc(rpcError)
      ? [`Admin RPC: ${rpcError.message ?? errorMessage(rpcError)}`]
      : [];

  const [
    spotRows,
    reservationRows,
    activityRows,
    profileRows,
    ownerRequestRows,
    submissionRows,
    reportRows,
    editSuggestionRows,
    reviewRows,
  ] =
    await Promise.all([
      readTable<any>(
        'Spots',
        client.from('spots').select('*').order('created_at', { ascending: false }).limit(1000),
        errors,
      ),
      readTable<any>(
        'Reservations',
        client.from('reservations').select('*').order('created_at', { ascending: false }).limit(1000),
        errors,
      ),
      readTable<Activity>(
        'Activities',
        client.from('activities').select('*').order('created_at', { ascending: false }).limit(20),
        errors,
      ),
      readTable<UserProfile>(
        'Profiles',
        client.from('profiles').select('*').order('created_at', { ascending: false }).limit(200),
        errors,
      ),
      readTable<OwnerAccessRequest>(
        'Owner requests',
        client.from('owner_access_requests').select('*').order('created_at', { ascending: false }).limit(100),
        errors,
      ),
      readTable<any>(
        'Spot submission popularity',
        client
          .from('pending_spot_submission_popularity')
          .select('*')
          .order('popularity_score', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100),
        errors,
      ),
      readTable<any>(
        'Review reports',
        client.from('review_reports').select('*').order('created_at', { ascending: false }).limit(50),
        errors,
      ),
      readTable<SpotEditSuggestion>(
        'Spot edit suggestions',
        client.from('spot_edit_suggestions').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
        errors,
      ),
      readTable<any>('Reviews', client.from('reviews').select('*').order('created_at', { ascending: false }).limit(200), errors),
    ]);

  const spots = spotRows.map(normalizeSpot);
  const reservations = reservationRows.map(normalizeReservation);
  const reviewsById = new Map(reviewRows.map((review: any) => [review.id, review]));
  const spotsById = new Map(spots.map((spot) => [spot.id, spot]));
  const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const reports = [
    ...reportRows.filter((report: any) => !report.status || report.status === 'pending').map((report: any) => {
      const review = reviewsById.get(report.review_id) as any;
      const spot = spotsById.get(review?.spot_id);
      const reporter = profilesById.get(report.reporter_id);
      const reviewThread = reviewRows
        .filter((item: any) => item.spot_id === review?.spot_id)
        .slice(0, 12)
        .map((item: any) => ({
          id: item.id,
          author: item.user_name ?? 'CebSpot user',
          rating: item.rating == null ? null : numberValue(item.rating),
          comment: item.comment ?? '',
          date: formatShortDate(item.created_at),
          flagged: item.id === review?.id,
          mediaUrls: stringArray(item.media_urls),
        }));
      return {
        created_at: report.created_at,
        row: {
          id: report.id,
          source: 'review_report' as const,
          createdAt: report.created_at,
          type: toAdminReportType(report.reason || 'Review report'),
          spotId: spot?.id ?? null,
          reviewId: review?.id ?? report.review_id ?? null,
          spot: spot?.name ?? 'Reported review',
          area: spot?.address ?? 'Cebu City',
          reporter: getInitials(reporter?.display_name ?? review?.user_name, reporter?.email),
          date: formatShortDate(report.created_at),
          description: review?.comment || report.reason || 'A community member flagged this review.',
          reviewAuthor: review?.user_name ?? null,
          reviewRating: review?.rating == null ? null : numberValue(review.rating),
          reviewComment: review?.comment ?? null,
          reviewDate: formatShortDate(review?.created_at),
          reviewMediaUrls: stringArray(review?.media_urls),
          reviewThread,
          note: report.reason ?? null,
        },
      };
    }),
    ...editSuggestionRows.map((suggestion: SpotEditSuggestion) => {
      const spot = spotsById.get(suggestion.spot_id);
      const reporter = profilesById.get(suggestion.user_id);
      return {
        created_at: suggestion.created_at,
        row: {
          id: suggestion.id,
          source: 'spot_edit_suggestion' as const,
          createdAt: suggestion.created_at,
          type: toAdminReportType(suggestion.field),
          spotId: suggestion.spot_id,
          field: suggestion.field,
          currentValue: suggestion.current_value ?? null,
          suggestedValue: suggestion.suggested_value ?? null,
          currentCoordinate: parseReportCoordinate(suggestion.current_value),
          suggestedCoordinate: parseReportCoordinate(suggestion.suggested_value),
          spot: spot?.name ?? 'Spot edit suggestion',
          area: spot?.address ?? 'Cebu City',
          reporter: getInitials(reporter?.display_name, reporter?.email),
          date: formatShortDate(suggestion.created_at),
          description: formatSuggestionDescription(suggestion),
          note: suggestion.note ?? null,
        },
      };
    }),
  ]
    .sort((first, second) => new Date(second.created_at ?? 0).getTime() - new Date(first.created_at ?? 0).getTime())
    .map(({ row }, index) => ({
      ...row,
      expanded: index === 0,
    }));

  const dashboard = buildDashboardFromRows({
    source: spots.length || reservations.length || profileRows.length ? 'live' : 'sample',
    spots: spots.length ? spots : sampleSpots.map(normalizeSpot),
    reservations: reservations.length ? reservations : sampleSpots.slice(0, 8).map(makeSampleReservation),
    activities: activityRows,
    users: profileRows,
    ownerRequests: ownerRequestRows,
    pendingSubmissions: submissionRows.map(normalizeSubmission),
    reports: reports.length ? normalizeAdminReportRows(reports) : sampleDashboard().reports,
    errors,
  });

  return dashboard.source === 'sample' ? { ...sampleDashboard(), errors } : dashboard;
}

export async function approveSpotSubmission(submissionId: string, client: SupabaseClient = supabase) {
  if (!hasSupabaseConfig) return null;

  const { data, error } = await withTimeout<{ data: any; error: any }>(
    client.rpc('approve_spot_submission', {
      target_submission_id: submissionId,
    }),
    15000,
    'Spot approval',
  );

  if (error) {
    const missingRpc = /approve_spot_submission|schema cache|could not find the function|pgrst202/i.test(
      error.message ?? error.details ?? '',
    );
    if (missingRpc) {
      throw new Error('Run supabase-admin-dashboard.sql in Supabase first, then refresh the dashboard.');
    }
    throw error;
  }

  return data;
}

export async function dismissAdminReport(report: AdminReportRow, adminNotes = '', client: SupabaseClient = supabase) {
  if (!hasSupabaseConfig) return null;

  const { data, error } = await withTimeout<{ data: any; error: any }>(
    client.rpc('dismiss_admin_report', {
      report_source: report.source,
      target_report_id: report.id,
      notes: adminNotes.trim() || null,
    }),
    15000,
    'Report dismissal',
  );

  if (error) {
    const missingRpc = /dismiss_admin_report|schema cache|could not find the function|pgrst202/i.test(
      error.message ?? error.details ?? '',
    );
    if (missingRpc) {
      throw new Error('Run the updated supabase-admin-dashboard.sql in Supabase first, then refresh the dashboard.');
    }
    throw error;
  }

  return data;
}

export async function applySpotEditSuggestion(report: AdminReportRow, adminNotes = '', client: SupabaseClient = supabase) {
  if (!hasSupabaseConfig) return null;
  if (report.source !== 'spot_edit_suggestion') {
    throw new Error('Only spot edit suggestions can update spot details.');
  }

  const { data, error } = await withTimeout<{ data: any; error: any }>(
    client.rpc('apply_spot_edit_suggestion', {
      target_suggestion_id: report.id,
      notes: adminNotes.trim() || null,
    }),
    15000,
    'Spot detail update',
  );

  if (error) {
    const missingRpc = /apply_spot_edit_suggestion|schema cache|could not find the function|pgrst202/i.test(
      error.message ?? error.details ?? '',
    );
    if (missingRpc) {
      throw new Error('Run the updated supabase-admin-dashboard.sql in Supabase first, then refresh the dashboard.');
    }
    throw error;
  }

  return data;
}
