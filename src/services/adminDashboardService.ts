import type { SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { getReviewReportCategory } from '../constants/reportCategories';
import { makeSampleReservation, sampleActivities, sampleReviews, sampleSpots } from '../constants/sampleData';
import type { Activity, OwnerAccessRequest, Reservation, Spot, SpotEditSuggestion, SpotSubmission, UserProfile } from '../types';
import type {
  AdminDailyInsight,
  AdminListingRow,
  AdminMapSpotRow,
  AdminPulseRow,
  AdminReportSource,
  AdminReportCoordinate,
  AdminReportReviewContext,
  AdminReportRow,
  AdminUserRow,
  AdminOwnerRequestRow,
  AdminOwnerRequestDecision,
  AdminOwnerRequestDecisionResult,
  AdminSpotSubmissionRow,
  AdminDashboardData,
} from './admin-dashboard/types';
import {
  numberValue,
  startOfToday,
  daysAgo,
  toPercentSeries,
  buildDailySeries,
  isPaidReservation,
  buildDailyInsights,
  buildProgress,
} from './admin-dashboard/analytics';

export type * from './admin-dashboard/types';

const fallbackSpotImage =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=240';

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
  return getReviewReportCategory(reason);
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
    const note = row.note ?? null;
    return {
      id: String(row.id),
      source,
      createdAt: row.createdAt ?? row.created_at ?? null,
      type: source === 'spot_edit_suggestion' ? 'Spot edit suggestion' : toAdminReportType(note ?? row.type),
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
      note,
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

function formatAdminUserLocation(location: unknown) {
  if (typeof location === 'string' && location.trim()) return location.trim();
  if (location && typeof location === 'object') {
    const address = (location as { address?: unknown }).address;
    if (typeof address === 'string' && address.trim()) return address.trim();
  }
  return 'Cebu City';
}

function mapUser(profile: UserProfile): AdminUserRow {
  const name = profile.display_name || profile.email?.split('@')[0] || 'CebSpot user';
  return {
    id: profile.id,
    name,
    email: profile.email,
    role: toStatusLabel(profile.role),
    location: formatAdminUserLocation(profile.location),
    joined: formatShortDate(profile.created_at),
    avatar: getInitials(name, profile.email),
    photoUrl: profile.photo_url ?? null,
  };
}

function normalizeAdminUserRows(rows: any[] = []): AdminUserRow[] {
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name ?? row.display_name ?? row.email?.split('@')[0] ?? 'CebSpot user',
    email: row.email ?? 'No email linked',
    role: toStatusLabel(row.role ?? 'user'),
    location: formatAdminUserLocation(row.location),
    joined: row.joined ?? formatShortDate(row.created_at),
    avatar: row.avatar ?? getInitials(row.name ?? row.display_name, row.email),
    photoUrl: row.photoUrl ?? row.photo_url ?? null,
  }));
}

function mapOwnerRequest(request: OwnerAccessRequest): AdminOwnerRequestRow {
  return {
    id: request.id,
    requesterId: request.requester_id ?? null,
    spotId: request.spot_id ?? null,
    applicant: request.contact_name || request.contact_email?.split('@')[0] || 'Applicant',
    initials: getInitials(request.contact_name, request.contact_email),
    email: request.contact_email,
    phone: request.contact_phone ?? null,
    spot: request.spot_name,
    fullAddress: request.spot_address,
    category: request.category,
    accessNeeds: request.access_needs ?? [],
    verificationDocuments: stringArray(request.verification_documents),
    barangay: getBarangay(request.spot_address),
    applied: formatShortDate(request.created_at),
    status: toStatusLabel(request.status),
    message: request.message,
    adminNotes: request.admin_notes,
    reviewedAt: request.reviewed_at ?? null,
  };
}

function normalizeAdminOwnerRequestRows(rows: any[] = []): AdminOwnerRequestRow[] {
  return rows.map((row) => ({
    id: String(row.id),
    requesterId: row.requesterId ?? row.requester_id ?? null,
    spotId: row.spotId ?? row.spot_id ?? null,
    applicant: row.applicant ?? row.contact_name ?? row.contact_email?.split('@')[0] ?? 'Applicant',
    initials: row.initials ?? getInitials(row.applicant ?? row.contact_name, row.email ?? row.contact_email),
    email: row.email ?? row.contact_email ?? 'No email linked',
    phone: row.phone ?? row.contact_phone ?? null,
    spot: row.spot ?? row.spot_name ?? 'Unknown spot',
    fullAddress: row.fullAddress ?? row.spot_address ?? row.barangay ?? 'Cebu City',
    category: row.category ?? 'Uncategorized',
    accessNeeds: stringArray(row.accessNeeds ?? row.access_needs),
    verificationDocuments: stringArray(row.verificationDocuments ?? row.verification_documents),
    barangay: row.barangay ?? getBarangay(row.fullAddress ?? row.spot_address),
    applied: row.applied ?? formatShortDate(row.created_at),
    status: toStatusLabel(row.status ?? 'pending'),
    message: row.message ?? null,
    adminNotes: row.adminNotes ?? row.admin_notes ?? null,
    reviewedAt: row.reviewedAt ?? row.reviewed_at ?? null,
    expanded: Boolean(row.expanded),
  }));
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

function normalizeAdminSpotSubmissionRows(rows: any[] = [], submitters: any[] = []): AdminSpotSubmissionRow[] {
  const submittersById = new Map(submitters.map((submitter) => [String(submitter.id), submitter]));
  return rows.map((row) => {
    const images = stringArray(row.images);
    const submitterId = String(row.submitterId ?? row.submitter_id ?? '');
    const submitter = submittersById.get(submitterId);
    const submitterEmail = row.submitterEmail ?? row.submitter_email ?? submitter?.email ?? 'No email on profile';
    const submitterName =
      row.submitterName ??
      row.submitter_name ??
      submitter?.display_name ??
      submitter?.name ??
      submitterEmail?.split('@')[0] ??
      'Unknown sender';
    return {
      id: String(row.id),
      name: row.name ?? 'Submitted spot',
      category: row.category ?? 'Uncategorized',
      categories: Array.isArray(row.categories) ? row.categories : null,
      barangay: row.barangay ?? getBarangay(row.address),
      address: row.address ?? 'Cebu City',
      latitude: numberValue(row.latitude),
      longitude: numberValue(row.longitude),
      submitted: row.submitted ?? formatShortDate(row.createdAt ?? row.created_at),
      createdAt: row.createdAt ?? row.created_at ?? null,
      status: row.status ?? 'Pending',
      image: row.image ?? images[0] ?? fallbackSpotImage,
      images,
      voteCount: numberValue(row.voteCount ?? row.vote_count),
      searchCount: numberValue(row.searchCount ?? row.search_count),
      similarSubmissionCount: numberValue(row.similarSubmissionCount ?? row.similar_submission_count),
      popularityScore: numberValue(row.popularityScore ?? row.popularity_score),
      description: row.description ?? null,
      reservationType: row.reservationType ?? row.reservation_type ?? null,
      reservationFee: numberValue(row.reservationFee ?? row.reservation_fee),
      paymentRequired: Boolean(row.paymentRequired ?? row.payment_required),
      isReservable: Boolean(row.isReservable ?? row.is_reservable),
      submitterId,
      submitterName,
      submitterEmail,
    };
  });
}

function mapSubmission(submission: SpotSubmission, submitter?: UserProfile): AdminSpotSubmissionRow {
  const images = stringArray(submission.images);
  const submitterName =
    submitter?.display_name ||
    submitter?.email?.split('@')[0] ||
    (submission as any).submitter_name ||
    'Unknown sender';
  return {
    id: submission.id,
    name: submission.name,
    category: submission.category,
    categories: submission.categories ?? null,
    barangay: getBarangay(submission.address),
    address: submission.address,
    latitude: submission.latitude,
    longitude: submission.longitude,
    submitted: formatShortDate(submission.created_at),
    createdAt: submission.created_at,
    status: toStatusLabel(submission.status),
    image: images[0] ?? fallbackSpotImage,
    images,
    voteCount: numberValue((submission as any).vote_count),
    searchCount: numberValue((submission as any).search_count),
    similarSubmissionCount: numberValue((submission as any).similar_submission_count),
    popularityScore: numberValue((submission as any).popularity_score),
    description: submission.description,
    reservationType: submission.reservation_type ?? null,
    reservationFee: numberValue(submission.reservation_fee),
    paymentRequired: Boolean(submission.payment_required),
    isReservable: Boolean(submission.is_reservable),
    submitterId: submission.submitter_id,
    submitterName,
    submitterEmail: submitter?.email ?? 'No email on profile',
  };
}

function buildSpotCategoryProgress(
  spots: Array<{ category?: string | null; categories?: string[] | null }>,
) {
  const categoryItems = spots.flatMap((spot) =>
    Array.from(
      new Set(
        [spot.category, ...(spot.categories ?? [])]
          .map((category) => category?.trim())
          .filter((category): category is string => Boolean(category)),
      ),
    ).map((label) => ({ label })),
  );
  return buildProgress(categoryItems, null);
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
    ['confirmed', 'checked_in', 'completed'].includes(reservation.status),
  ).length;
  const estimatedRevenue = input.reservations.reduce((sum, reservation) => {
    return isPaidReservation(reservation) ? sum + numberValue(reservation.reservation_fee || reservation.fee) : sum;
  }, 0);
  const publicSpots = input.spots.filter((spot) => spot.is_public);
  const publicSpotCategories = buildSpotCategoryProgress(publicSpots);
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
  const profilesById = new Map(input.users.map((profile) => [profile.id, profile]));
  const pendingSubmissions = input.pendingSubmissions.map((submission) =>
    mapSubmission(submission, profilesById.get(submission.submitter_id)),
  );

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
    categories: publicSpotCategories,
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
      spot_name: 'Test Cebspot Club',
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

async function readAllAdminProfiles(client: SupabaseClient) {
  const pageSize = 500;
  const profiles: UserProfile[] = [];
  let offset = 0;

  while (true) {
    const { data, error, count } = await client
      .from('profiles')
      .select('id,email,display_name,role,location,created_at,photo_url', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) return { data: null, error };

    const page = (data ?? []) as UserProfile[];
    profiles.push(...page);
    offset += page.length;

    if (page.length === 0 || (count !== null && offset >= count) || (count === null && page.length < pageSize)) {
      return { data: profiles, error: null };
    }
  }
}

async function readAllAdminSpotCategories(client: SupabaseClient) {
  const pageSize = 500;
  const spots: Array<{ id: string; category: string | null; categories: string[] | null }> = [];
  let offset = 0;

  while (true) {
    const { data, error, count } = await client
      .from('spots')
      .select('id,category,categories', { count: 'exact' })
      .eq('is_public', true)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) return { data: null, error };

    const page = (data ?? []) as Array<{ id: string; category: string | null; categories: string[] | null }>;
    spots.push(...page);
    offset += page.length;

    if (page.length === 0 || (count !== null && offset >= count) || (count === null && page.length < pageSize)) {
      return { data: spots, error: null };
    }
  }
}

export async function getAdminDashboardData(client: SupabaseClient = supabase): Promise<AdminDashboardData> {
  if (!hasSupabaseConfig) return sampleDashboard();

  const { data: rpcData, error: rpcError } = await client.rpc('get_admin_dashboard');
  if (!rpcError && rpcData) {
    const rows = rpcData as any;
    const data = buildDashboardFromRows({
      source: 'live',
      spots: [],
      reservations: [],
      activities: [],
      users: [],
      ownerRequests: [],
      pendingSubmissions: [],
      reports: [],
    });
    const [submissionResult, profilesResult, categoryResult] = await Promise.all([
      client
        .from('pending_spot_submission_popularity')
        .select('*')
        .order('popularity_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
      readAllAdminProfiles(client),
      readAllAdminSpotCategories(client),
    ]);
    const detailedSubmissionRows = submissionResult.data;
    const allProfileRows = profilesResult.data;
    const pendingSubmissionRows = detailedSubmissionRows?.length ? detailedSubmissionRows : rows.pendingSubmissions;
    const pendingSubmitterIds = Array.from(
      new Set(
        (pendingSubmissionRows ?? [])
          .map((submission: any) => submission.submitterId ?? submission.submitter_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    const { data: pendingSubmitters, error: pendingSubmittersError } = allProfileRows
      ? { data: allProfileRows, error: null }
      : pendingSubmitterIds.length
        ? await client.from('profiles').select('id,email,display_name,role,created_at').in('id', pendingSubmitterIds)
        : { data: [], error: null };
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
      dailyInsights,
      categories: categoryResult.data
        ? buildSpotCategoryProgress(categoryResult.data)
        : rows.categories ?? data.categories,
      barangays: rows.barangays ?? data.barangays,
      recentListings: rows.recentListings ?? data.recentListings,
      livePulse: rows.livePulse ?? data.livePulse,
      reports: normalizeAdminReportRows(rows.reports ?? data.reports),
      users: normalizeAdminUserRows(allProfileRows ?? rows.users ?? data.users),
      ownerRequests: normalizeAdminOwnerRequestRows(rows.ownerRequests ?? data.ownerRequests),
      pendingSubmissions: normalizeAdminSpotSubmissionRows(
        pendingSubmissionRows ?? data.pendingSubmissions,
        allProfileRows ?? (pendingSubmitters?.length ? pendingSubmitters : rows.users ?? data.users),
      ),
      errors: [
        ...(profilesResult.error ? [`Profiles: ${profilesResult.error.message}`] : []),
        ...(categoryResult.error ? [`Spot categories: ${categoryResult.error.message}`] : []),
        ...(pendingSubmittersError ? [`Submission senders: ${pendingSubmittersError.message}`] : []),
      ],
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
        readAllAdminProfiles(client),
        errors,
      ),
      readTable<OwnerAccessRequest>(
        'Owner requests',
        client.from('owner_access_requests').select('*').order('created_at', { ascending: false }),
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
          type: 'Spot edit suggestion',
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
    source: 'live',
    spots,
    reservations,
    activities: activityRows,
    users: profileRows,
    ownerRequests: ownerRequestRows,
    pendingSubmissions: submissionRows.map(normalizeSubmission),
    reports: normalizeAdminReportRows(reports),
    errors,
  });

  return dashboard;
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

export async function getAdminSpotMapRows(client: SupabaseClient = supabase): Promise<AdminMapSpotRow[]> {
  if (!hasSupabaseConfig) {
    return sampleSpots.map(normalizeSpot).map((spot) => ({
      id: spot.id,
      name: spot.name,
      description: spot.description ?? null,
      category: spot.category,
      categories: spot.categories ?? [],
      address: spot.address,
      barangay: getBarangay(spot.address),
      latitude: spot.latitude,
      longitude: spot.longitude,
      rating: numberValue(spot.rating),
      reviewCount: numberValue(spot.review_count),
      isPublic: spot.is_public,
      isReservable: spot.is_reservable,
    }));
  }

  const { data, error } = await client
    .from('spots')
    .select('id,name,description,category,categories,address,latitude,longitude,rating,review_count,is_public,is_reservable')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) throw new Error(error.message ?? 'Unable to load the admin spot map.');

  return (data ?? [])
    .map((row: any) => ({
      id: String(row.id),
      name: row.name ?? 'Unnamed spot',
      description: row.description ?? null,
      category: row.category ?? 'Uncategorized',
      categories: stringArray(row.categories),
      address: row.address ?? 'Cebu City',
      barangay: getBarangay(row.address),
      latitude: numberValue(row.latitude),
      longitude: numberValue(row.longitude),
      rating: numberValue(row.rating),
      reviewCount: numberValue(row.review_count),
      isPublic: Boolean(row.is_public),
      isReservable: Boolean(row.is_reservable),
    }))
    .filter((spot) => Number.isFinite(spot.latitude) && Number.isFinite(spot.longitude));
}

export async function deleteAdminSpot(spotId: string, client: SupabaseClient = supabase) {
  if (!hasSupabaseConfig) return { id: spotId };

  const { data, error } = await client.rpc('delete_admin_spot', { target_spot_id: spotId });
  if (error) {
    const missingRpc = /delete_admin_spot|schema cache|could not find the function|pgrst202/i.test(
      error.message ?? error.details ?? '',
    );
    if (missingRpc) {
      throw new Error('Install the admin spot-delete migration in Supabase, then refresh the dashboard.');
    }
    throw new Error(error.message ?? 'Unable to delete the spot.');
  }
  return data;
}

export async function deleteAdminOwnerRequest(requestId: string, client: SupabaseClient = supabase) {
  if (!hasSupabaseConfig) return { id: requestId };

  const { data, error } = await client.rpc('delete_admin_owner_request', { target_request_id: requestId });
  if (error) {
    const missingRpc = /delete_admin_owner_request|schema cache|could not find the function|pgrst202/i.test(
      error.message ?? error.details ?? '',
    );
    if (missingRpc) {
      throw new Error('Install the admin owner-request delete migration in Supabase, then refresh the dashboard.');
    }
    throw new Error(error.message ?? 'Unable to delete the owner request.');
  }
  return data;
}

export async function reviewOwnerAccessRequest(
  requestId: string,
  decision: AdminOwnerRequestDecision,
  adminNotes = '',
  client: SupabaseClient = supabase,
): Promise<AdminOwnerRequestDecisionResult | null> {
  if (!hasSupabaseConfig) return null;

  if (decision === 'approved') {
    const { data, error } = await withTimeout<{
      data: AdminOwnerRequestDecisionResult | null;
      error: any;
    }>(
      client.functions.invoke('provision-owner-account', {
        body: {
          requestId,
          notes: adminNotes.trim() || null,
        },
      }),
      30000,
      'Dedicated owner account provisioning',
    );

    if (error) {
      let message = error.message ?? 'Unable to create the dedicated owner account.';
      const response = error.context as Response | undefined;
      if (response && typeof response.clone === 'function') {
        try {
          const payload = await response.clone().json();
          if (typeof payload?.error === 'string' && payload.error) message = payload.error;
        } catch {
          // Keep the Supabase Functions error when the response is not JSON.
        }
      }
      throw new Error(message);
    }

    return data;
  }

  const { data, error } = await withTimeout<{ data: AdminOwnerRequestDecisionResult | null; error: any }>(
    client.rpc('review_owner_access_request', {
      target_request_id: requestId,
      decision,
      notes: adminNotes.trim() || null,
    }),
    15000,
    'Owner request review',
  );

  if (error) {
    const missingRpc = /review_owner_access_request|schema cache|could not find the function|pgrst202/i.test(
      error.message ?? error.details ?? '',
    );
    if (missingRpc) {
      throw new Error('Run the updated supabase-admin-dashboard.sql in Supabase first, then refresh the dashboard.');
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
