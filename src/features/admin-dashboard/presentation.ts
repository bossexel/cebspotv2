import type { AdminListingRow, AdminSpotSubmissionRow, AdminPulseRow, AdminReportRow, AdminUserRow, AdminOwnerRequestRow } from '../../services/adminDashboardService';

export function getStatusBadgeTone(label: string, danger?: boolean, warning?: boolean) {
  if (danger) return 'danger';
  if (warning) return 'warning';
  const normalized = label.toLowerCase();
  if (normalized === 'owner' || normalized === 'restaurant') return 'owner';
  if (normalized === 'pending') return 'pending';
  if (['verified', 'success', 'spotter'].includes(normalized)) return 'success';
  return 'default';
}

export function formatLastUpdated(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCompactNumber(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

export function formatAdminMoney(value: number) {
  return `P ${Math.round(value).toLocaleString('en-US')}`;
}

export function matchesQuery(values: Array<string | number | null | undefined>, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value ?? '').toLowerCase().includes(needle));
}

export function filterListings(rows: AdminListingRow[], query: string) {
  return rows.filter((item) => matchesQuery([item.name, item.category, item.barangay, item.status, item.id], query));
}

export function filterSubmissions(rows: AdminSpotSubmissionRow[], query: string) {
  return rows.filter((item) =>
    matchesQuery([
      item.name,
      item.category,
      item.barangay,
      item.status,
      item.id,
      item.description,
      item.address,
      item.submitterName,
      item.submitterEmail,
      item.popularityScore,
      item.voteCount,
    ], query),
  );
}

export function filterPulse(rows: AdminPulseRow[], query: string) {
  return rows.filter((item) => matchesQuery([item.action, item.user, item.location, item.status, item.value], query));
}

export function filterReports(rows: AdminReportRow[], query: string) {
  return rows.filter((item) => matchesQuery([item.type, item.spot, item.area, item.reporter, item.description], query));
}

export function filterUsers(rows: AdminUserRow[], query: string) {
  return rows.filter((item) => matchesQuery([item.name, item.email, item.role, item.location, item.id], query));
}

export function filterOwnerRequests(rows: AdminOwnerRequestRow[], query: string) {
  return rows.filter((item) => matchesQuery([item.applicant, item.email, item.spot, item.category, item.barangay, item.status], query));
}
