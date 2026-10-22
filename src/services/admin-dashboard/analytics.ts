import type { Reservation, Spot, UserProfile } from '../../types';
import type { AdminDailyInsight, AdminReportRow, AdminProgressItem } from './types';

export function numberValue(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

export function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function daysAgo(days: number) {
  const date = startOfToday();
  date.setDate(date.getDate() - days);
  return date;
}

export function toPercentSeries(counts: number[]) {
  const max = Math.max(...counts, 1);
  return counts.map((count) => Math.max(count ? 18 : 6, Math.round((count / max) * 100)));
}

export function buildDailySeries(rows: Array<{ created_at?: string | null }>, days = 10) {
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = daysAgo(days - index - 1);
    return {
      key: date.toISOString().slice(0, 10),
      count: 0,
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  });

  const bucketsByDate = new Map(buckets.map(bucket => [bucket.key, bucket]));
  rows.forEach((row) => {
    const key = row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : '';
    const bucket = bucketsByDate.get(key);
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

export function isPaidReservation(reservation: Reservation) {
  return ['confirmed', 'checked_in', 'completed'].includes(reservation.status) && reservation.payment_status === 'paid';
}

export function buildDailyInsights(input: {
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

  const bucketsByDate = new Map(buckets.map(bucket => [bucket.key, bucket]));
  input.reservations.forEach((reservation) => {
    const bucket = bucketsByDate.get(getDateKey(reservation.created_at));
    if (!bucket) return;
    bucket.reservations += 1;
    if (isPaidReservation(reservation)) {
      bucket.estimatedRevenue += numberValue(reservation.reservation_fee || reservation.fee);
    }
  });

  input.spots.forEach((spot) => {
    const bucket = bucketsByDate.get(getDateKey(spot.created_at));
    if (bucket) bucket.newSpots += 1;
  });

  input.reports.forEach((report) => {
    const bucket = bucketsByDate.get(getDateKey(report.createdAt));
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

export function buildProgress(items: Array<{ label: string }>, limit: number | null = 5): AdminProgressItem[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const label = item.label || 'Uncategorized';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = limit === null ? ranked : ranked.slice(0, limit);
  const max = Math.max(...top.map(([, count]) => count), 1);
  return top.map(([label, count]) => ({
    label,
    value: Math.max(8, Math.round((count / max) * 100)),
    copy: `${count} ${count === 1 ? 'spot' : 'spots'}`,
  }));
}
