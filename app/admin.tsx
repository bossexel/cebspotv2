import { type TableColumn, DataPanel, DataTable, StatusBadge, LoadingPanel, InlineNotice, EmptyState } from '../src/features/admin-dashboard/components';
import { adminPalette, adminFontFamily, styles } from '../src/features/admin-dashboard/styles';
import {
  formatLastUpdated,
  formatCompactNumber,
  formatAdminMoney,
  filterListings,
  filterSubmissions,
  filterPulse,
  filterReports,
  filterUsers,
  filterOwnerRequests,
} from '../src/features/admin-dashboard/presentation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Svg, Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Inter_400Regular,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts as useInterFonts,
} from '@expo-google-fonts/inter';
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Edit3,
  FileText,
  GitBranch,
  LayoutDashboard,
  LogOut,
  LucideIcon,
  Menu,
  Mail,
  Map,
  MapPin,
  Megaphone,
  MoreHorizontal,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TicketCheck,
  TrendingUp,
  Trash2,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react-native';
import { SupabaseConnectionPanel } from '../src/components/SupabaseConnectionPanel';
import { PasswordInput } from '../src/components/PasswordInput';
import { TileMap } from '../src/components/TileMap';
import { ADMIN_EMAIL, hasAdminAccess, normalizeAuthEmail } from '../src/constants/authRoles';
import { colors } from '../src/constants/colors';
import { REVIEW_REPORT_CATEGORIES } from '../src/constants/reportCategories';
import { useScopedAuth } from '../src/hooks/useScopedAuth';
import { getAuthErrorMessage } from '../src/utils/auth';
import { platformAlert as Alert } from '../src/utils/platformAlert';
import { getSpotCategoryColor } from '../src/utils/spotCategory';
import { ownerVerificationDocumentService } from '../src/services/ownerVerificationDocumentService';
import {
  createAdminUpdate,
  deleteAdminUpdate,
  editAdminUpdate,
  getAllAdminUpdates,
  type AdminUpdate,
} from '../src/services/adminUpdateService';
import {
  applySpotEditSuggestion,
  approveSpotSubmission,
  linkSpotSubmission,
  confirmDistinctSpotSubmission,
  deleteAdminOwnerRequest,
  deleteAdminSpot,
  deleteAdminSpotSubmission,
  dismissAdminReport,
  getAdminSpotMapRows,
  getAdminDashboardData,
  reviewOwnerAccessRequest,
  type AdminDashboardData,
  type AdminListingRow,
  type AdminMapSpotRow,
  type AdminOwnerRequestRow,
  type AdminOwnerRequestDecision,
  type AdminProgressItem,
  type AdminPulseRow,
  type AdminReportRow,
  type AdminSpotSubmissionRow,
  type AdminUserRow,
} from '../src/services/adminDashboardService';

type AdminSection = 'overview' | 'spots' | 'reports' | 'users' | 'requests' | 'system';

type NavItem = {
  id: AdminSection;
  label: string;
  icon: LucideIcon;
  searchPlaceholder: string;
};

type StatCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'primary' | 'warning' | 'danger' | 'dark' | 'green' | 'blue';
  delta?: string;
};

const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, searchPlaceholder: 'Search in overview...' },
  { id: 'spots', label: 'Spots', icon: MapPin, searchPlaceholder: 'Search in spots...' },
  { id: 'reports', label: 'Reports', icon: BarChart3, searchPlaceholder: 'Search in reports...' },
  { id: 'users', label: 'All Users', icon: Users, searchPlaceholder: 'Search in users...' },
  { id: 'requests', label: 'Owner Requests', icon: UserPlus, searchPlaceholder: 'Search in requests...' },
  { id: 'system', label: 'System', icon: Settings, searchPlaceholder: 'Search system settings...' },
];

const cebspotLogo = require('../assets/cebspot-logo.png');
const requestBars = [40, 60, 30, 80, 100, 52, 70];

// Simple trailing debounce. Used to coalesce bursts of realtime table-change
// events (a single bulk operation can touch several tables at once) into one
// dashboard refetch instead of one per table.
function debounce<Args extends unknown[]>(fn: (...args: Args) => void, waitMs: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Args) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), waitMs);
  };
  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  };
  return debounced;
}

function iconTone(tone: StatCardProps['tone']) {
  switch (tone) {
    case 'danger':
      return { background: adminPalette.errorContainer + '24', foreground: adminPalette.error };
    case 'warning':
      return { background: adminPalette.tertiaryContainer + '22', foreground: '#8a5a00' };
    case 'dark':
      return { background: '#ffffff12', foreground: adminPalette.primaryFixed };
    case 'green':
      return { background: adminPalette.successContainer, foreground: adminPalette.success };
    case 'blue':
      return { background: '#dbeafe', foreground: '#1d4ed8' };
    default:
      return { background: adminPalette.primary + '10', foreground: adminPalette.primary };
  }
}

export default function AdminConsoleScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { client, isSignedIn, loading: authLoading, profile, signIn, logOut } = useScopedAuth('admin');
  const [adminFontsLoaded] = useInterFonts({
    Inter_400Regular,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [approvingSubmissionId, setApprovingSubmissionId] = useState<string | null>(null);
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null);
  const [deletingSpotId, setDeletingSpotId] = useState<string | null>(null);
  const [moderatingReportId, setModeratingReportId] = useState<string | null>(null);
  const [reviewingOwnerRequestId, setReviewingOwnerRequestId] = useState<string | null>(null);
  const [deletingOwnerRequestId, setDeletingOwnerRequestId] = useState<string | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<{ tone: 'success' | 'error'; title: string; copy: string } | null>(null);
  const [updatesOpen, setUpdatesOpen] = useState(false);

  const activeNav = navItems.find((item) => item.id === activeSection) ?? navItems[0];
  const compact = width < 1180;
  const mobile = width < 760;
  // This client-side check only controls whether the admin UI renders — it
  // is a UX gate, not a security boundary. Every read/write this screen
  // performs (getAdminDashboardData, approveSpotSubmission,
  // reviewOwnerAccessRequest, etc.) must be re-authorized server-side
  // (RLS policies / role checks in Supabase), since a client-side flag can
  // always be bypassed by calling the API directly.
  const isAdmin = hasAdminAccess(profile);
  const adminName = profile?.display_name || 'Admin User';
  const adminInitial = adminName.charAt(0).toUpperCase();

  // Guards against the mount-after-unmount and stale-response races described
  // below. `dashboardRequestId` is bumped on every refresh attempt; a
  // response is only applied if it's still the most recent request in
  // flight when it resolves, which prevents an older, slower refetch from
  // clobbering a newer one (including an optimistic update applied after it
  // started).
  const mountedRef = useRef(true);
  const dashboardRequestId = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshDashboard = useCallback(async () => {
    if (!isSignedIn || !isAdmin) return;

    const requestId = ++dashboardRequestId.current;
    try {
      setDashboardLoading(true);
      setDashboardError(null);
      const data = await getAdminDashboardData(client);
      if (!mountedRef.current || requestId !== dashboardRequestId.current) return;
      setDashboard(data);
    } catch (error: any) {
      if (!mountedRef.current || requestId !== dashboardRequestId.current) return;
      setDashboardError(error?.message ?? 'Unable to load admin dashboard data.');
    } finally {
      if (mountedRef.current && requestId === dashboardRequestId.current) {
        setDashboardLoading(false);
      }
    }
  }, [client, isAdmin, isSignedIn]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  // Realtime table changes call this instead of refreshDashboard directly so
  // that a burst of changes across multiple tables (common for a single
  // admin action, e.g. approving a submission touches spots + submissions +
  // activities) collapses into one refetch instead of one per event.
  const debouncedRefreshRef = useRef(debounce(refreshDashboard, 400));
  useEffect(() => {
    debouncedRefreshRef.current = debounce(refreshDashboard, 400);
    return () => debouncedRefreshRef.current.cancel();
  }, [refreshDashboard]);
  const handleRealtimeChange = useCallback(() => {
    debouncedRefreshRef.current();
  }, []);

  useEffect(() => {
    if (!isSignedIn || !isAdmin) return undefined;

    const channel = client
      .channel(`admin-dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'owner_access_requests' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spot_submissions' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spot_submission_votes' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spot_search_events' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_reports' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spot_edit_suggestions' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, handleRealtimeChange)
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [client, isAdmin, isSignedIn, handleRealtimeChange]);

  async function handleSignOut(redirectToLogin = true) {
    try {
      setSigningOut(true);
      await logOut();
      if (redirectToLogin) {
        router.replace('/login');
      }
    } catch (error: any) {
      Alert.alert('Sign out failed', error.message ?? 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Log out of CebSpot?', 'Are you sure you want to log out of the admin account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => void handleSignOut() },
    ]);
  }

  async function handleApproveSubmission(submission: AdminSpotSubmissionRow) {
    try {
      setApprovingSubmissionId(submission.id);
      setApprovalNotice(null);
      await approveSpotSubmission(submission.id, client);
      setDashboard((current) =>
        current
          ? {
              ...current,
              metrics: {
                ...current.metrics,
                pendingSpotSubmissions: Math.max(0, current.metrics.pendingSpotSubmissions - 1),
              },
              pendingSubmissions: current.pendingSubmissions.filter((item) => item.id !== submission.id),
            }
          : current,
      );
      setApprovalNotice({
        tone: 'success',
        title: 'Spot approved',
        copy: `${submission.name} is approved and linked to its map listing.`,
      });
      refreshDashboard().catch((error: any) => {
        setDashboardError(error?.message ?? 'Spot was approved, but dashboard refresh failed.');
      });
    } catch (error: any) {
      const message = error?.message ?? 'Please try again.';
      setApprovalNotice({
        tone: 'error',
        title: 'Approval failed',
        copy: message,
      });
    } finally {
      setApprovingSubmissionId(null);
    }
  }

  async function handleDeleteSubmission(submission: AdminSpotSubmissionRow) {
    try {
      setDeletingSubmissionId(submission.id);
      setApprovalNotice(null);
      await deleteAdminSpotSubmission(submission.id, client);
      setDashboard((current) =>
        current
          ? {
              ...current,
              metrics: {
                ...current.metrics,
                pendingSpotSubmissions: Math.max(0, current.metrics.pendingSpotSubmissions - 1),
              },
              pendingSubmissions: current.pendingSubmissions.filter((item) => item.id !== submission.id),
            }
          : current,
      );
      setApprovalNotice({
        tone: 'success',
        title: 'Submission deleted',
        copy: `${submission.name} and its linked community post were permanently removed.`,
      });
      refreshDashboard().catch((error: any) => {
        setDashboardError(error?.message ?? 'The submission was deleted, but dashboard refresh failed.');
      });
    } catch (error: any) {
      setApprovalNotice({
        tone: 'error',
        title: 'Delete failed',
        copy: error?.message ?? 'Please try again.',
      });
    } finally {
      setDeletingSubmissionId(null);
    }
  }

  function confirmDeleteSubmission(submission: AdminSpotSubmissionRow) {
    Alert.alert(
      `Delete ${submission.name}?`,
      'This permanently removes the pending submission, votes, linked discovery post, comments, and submission notifications. The submitting user is not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Submission', style: 'destructive', onPress: () => void handleDeleteSubmission(submission) },
      ],
    );
  }

  async function handleDeleteSpot(listing: AdminListingRow) {
    try {
      setDeletingSpotId(listing.id);
      setApprovalNotice(null);
      await deleteAdminSpot(listing.id, client);
      setDashboard((current) =>
        current
          ? {
              ...current,
              metrics: {
                ...current.metrics,
                totalSpots: Math.max(0, current.metrics.totalSpots - 1),
                publicSpots: Math.max(
                  0,
                  current.metrics.publicSpots - (listing.status.toLowerCase() === 'verified' ? 1 : 0),
                ),
              },
              recentListings: current.recentListings.filter((item) => item.id !== listing.id),
            }
          : current,
      );
      setApprovalNotice({
        tone: 'success',
        title: 'Spot deleted',
        copy: `${listing.name} was permanently removed from CebSpot.`,
      });
      refreshDashboard().catch((error: any) => {
        setDashboardError(error?.message ?? 'The spot was deleted, but dashboard refresh failed.');
      });
    } catch (error: any) {
      setApprovalNotice({
        tone: 'error',
        title: 'Delete failed',
        copy: error?.message ?? 'Please try again.',
      });
    } finally {
      setDeletingSpotId(null);
    }
  }

  function confirmDeleteSpot(listing: AdminListingRow) {
    Alert.alert(
      `Delete ${listing.name}?`,
      'This permanently removes the spot and related discovery content. Spots with booking history are protected and cannot be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Spot', style: 'destructive', onPress: () => void handleDeleteSpot(listing) },
      ],
    );
  }

  async function handleDismissReport(report: AdminReportRow, notes: string) {
    try {
      setModeratingReportId(report.id);
      setApprovalNotice(null);
      await dismissAdminReport(report, notes, client);
      setDashboard((current) =>
        current
          ? {
              ...current,
              metrics: {
                ...current.metrics,
                reportsFiled: Math.max(0, current.metrics.reportsFiled - 1),
              },
              reports: current.reports.filter((item) => item.id !== report.id),
            }
          : current,
      );
      setApprovalNotice({
        tone: 'success',
        title: 'Report dismissed',
        copy: `${report.spot} was removed from the active moderation queue.`,
      });
      refreshDashboard().catch((error: any) => {
        setDashboardError(error?.message ?? 'Report was dismissed, but dashboard refresh failed.');
      });
    } catch (error: any) {
      setApprovalNotice({
        tone: 'error',
        title: 'Dismiss failed',
        copy: error?.message ?? 'Please try again.',
      });
    } finally {
      setModeratingReportId(null);
    }
  }

  async function handleApplyReport(report: AdminReportRow, notes: string) {
    try {
      setModeratingReportId(report.id);
      setApprovalNotice(null);
      await applySpotEditSuggestion(report, notes, client);
      setDashboard((current) =>
        current
          ? {
              ...current,
              metrics: {
                ...current.metrics,
                reportsFiled: Math.max(0, current.metrics.reportsFiled - 1),
              },
              reports: current.reports.filter((item) => item.id !== report.id),
            }
          : current,
      );
      setApprovalNotice({
        tone: 'success',
        title: 'Spot updated',
        copy: `${report.spot} was updated and the suggestion was marked approved.`,
      });
      refreshDashboard().catch((error: any) => {
        setDashboardError(error?.message ?? 'Spot was updated, but dashboard refresh failed.');
      });
    } catch (error: any) {
      setApprovalNotice({
        tone: 'error',
        title: 'Update failed',
        copy: error?.message ?? 'Please try again.',
      });
    } finally {
      setModeratingReportId(null);
    }
  }

  async function handleReviewOwnerRequest(
    request: AdminOwnerRequestRow,
    decision: AdminOwnerRequestDecision,
    notes: string,
  ) {
    try {
      setReviewingOwnerRequestId(request.id);
      setApprovalNotice(null);
      const result = await reviewOwnerAccessRequest(request.id, decision, notes, client);
      const nextStatus = decision === 'approved' ? 'Approved' : 'Rejected';

      setDashboard((current) =>
        current
          ? {
              ...current,
              metrics: {
                ...current.metrics,
                pendingOwnerRequests: Math.max(0, current.metrics.pendingOwnerRequests - 1),
              },
              users:
                decision === 'approved'
                  ? current.users.map((user) =>
                      user.id === request.requesterId ? { ...user, role: user.role === 'Admin' ? user.role : 'Owner' } : user,
                    )
                  : current.users,
              ownerRequests: current.ownerRequests.map((item) =>
                item.id === request.id
                  ? {
                      ...item,
                      status: nextStatus,
                      spotId: result?.spotId ?? item.spotId,
                      adminNotes: notes.trim() || null,
                      reviewedAt: new Date().toISOString(),
                    }
                  : item,
              ),
            }
          : current,
      );

      setApprovalNotice({
        tone: 'success',
        title: decision === 'approved' ? 'Owner access approved' : 'Owner request rejected',
        copy:
          decision === 'approved'
            ? `A dedicated owner account for ${request.applicant} was created and invited to manage ${result?.spotName ?? request.spot}.`
            : `${request.applicant}'s request for ${request.spot} was rejected.`,
      });
      refreshDashboard().catch((error: any) => {
        setDashboardError(error?.message ?? 'The request was reviewed, but dashboard refresh failed.');
      });
      return true;
    } catch (error: any) {
      setApprovalNotice({
        tone: 'error',
        title: decision === 'approved' ? 'Approval failed' : 'Rejection failed',
        copy: error?.message ?? 'Please try again.',
      });
      return false;
    } finally {
      setReviewingOwnerRequestId(null);
    }
  }

  async function handleDeleteOwnerRequest(request: AdminOwnerRequestRow) {
    try {
      setDeletingOwnerRequestId(request.id);
      setApprovalNotice(null);
      await deleteAdminOwnerRequest(request.id, client);

      const wasPending = request.status.toLowerCase() === 'pending';
      setDashboard((current) =>
        current
          ? {
              ...current,
              metrics: {
                ...current.metrics,
                pendingOwnerRequests: wasPending
                  ? Math.max(0, current.metrics.pendingOwnerRequests - 1)
                  : current.metrics.pendingOwnerRequests,
              },
              ownerRequests: current.ownerRequests.filter((item) => item.id !== request.id),
            }
          : current,
      );
      setApprovalNotice({
        tone: 'success',
        title: 'Owner request deleted',
        copy: `${request.applicant}'s request for ${request.spot} was permanently removed.`,
      });
      refreshDashboard().catch((error: any) => {
        setDashboardError(error?.message ?? 'The request was deleted, but dashboard refresh failed.');
      });
    } catch (error: any) {
      setApprovalNotice({
        tone: 'error',
        title: 'Delete failed',
        copy: error?.message ?? 'Please try again.',
      });
    } finally {
      setDeletingOwnerRequestId(null);
    }
  }

  function confirmDeleteOwnerRequest(request: AdminOwnerRequestRow) {
    Alert.alert(
      'Delete owner request?',
      `This permanently removes ${request.applicant}'s application and review record. It does not delete the applicant, the spot, or owner access already granted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Request', style: 'destructive', onPress: () => void handleDeleteOwnerRequest(request) },
      ],
    );
  }

  function openReportSpot(report: AdminReportRow) {
    if (!report.spotId) {
      Alert.alert('Spot unavailable', 'This report is not linked to a spot record.');
      return;
    }
    router.push(Platform.OS === 'web' ? `/admin/spot/${report.spotId}` : `/spot/${report.spotId}`);
  }

  if (authLoading || !adminFontsLoaded) {
    return (
      <View style={styles.adminGateScreen}>
        <Text style={styles.adminGateBrand}>CebSpot Admin</Text>
        <Text style={styles.adminGateCopy}>Checking admin session...</Text>
      </View>
    );
  }

  if (!isSignedIn || !isAdmin) {
    return (
      <AdminLoginGate
        signedInEmail={profile?.email ?? null}
        onSignIn={signIn}
        onLogout={() => handleSignOut(false)}
        onResetPassword={async (email) => {
          const normalizedEmail = normalizeAuthEmail(email);
          const { error } = await client.auth.resetPasswordForEmail(normalizedEmail);
          if (error) throw new Error(getAuthErrorMessage(error));
          router.push({
            pathname: '/reset-password',
            params: { email: normalizedEmail, requested: '1', returnTo: 'admin' },
          });
        }}
      />
    );
  }

  function navigateTo(section: AdminSection) {
    setActiveSection(section);
    setQuery('');
    setMobileNavOpen(false);
  }

  const navigationCounts: Partial<Record<AdminSection, number>> = dashboard ? {
    spots: dashboard.metrics.pendingSpotSubmissions,
    reports: dashboard.reports.length,
    requests: dashboard.ownerRequests.filter((request) => request.status.toLowerCase() === 'pending').length,
  } : {};

  const sidebarContent = (
    <>
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>CebSpot Admin</Text>
        <Text style={styles.brandSub}>Operations Console</Text>
      </View>

      <View style={styles.nav}>
        {navItems.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            active={activeSection === item.id}
            compact={false}
            count={navigationCounts[item.id]}
            onPress={() => navigateTo(item.id)}
          />
        ))}
      </View>

      <View style={styles.sidebarFooter}>
        <View style={styles.adminCard}>
          <View style={styles.adminAvatar}>
            {profile?.photo_url ? <Image source={{ uri: profile.photo_url }} style={styles.adminAvatarImage} /> : <Text style={styles.adminAvatarText}>{adminInitial}</Text>}
          </View>
          <View style={styles.adminCopy}>
            <Text style={styles.adminName} numberOfLines={1}>{adminName}</Text>
            <Text style={styles.adminRole} numberOfLines={1}>{profile?.email || 'superadmin@cebspot.com'}</Text>
          </View>
        </View>
        <Pressable style={styles.signOutButton} onPress={confirmSignOut} disabled={signingOut}>
          <LogOut size={18} color={adminPalette.outlineVariant} />
          <Text style={styles.signOutText}>{signingOut ? 'Signing out...' : 'Sign out'}</Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <View style={styles.screen}>
      {!mobile && <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>CebSpot Admin</Text>
          {!compact && <Text style={styles.brandSub}>Operations Console</Text>}
        </View>

        <View style={styles.nav}>
          {navItems.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              active={activeSection === item.id}
              compact={compact}
              count={navigationCounts[item.id]}
              onPress={() => navigateTo(item.id)}
            />
          ))}
        </View>

        <View style={styles.sidebarFooter}>
          <View style={styles.adminCard}>
            <View style={styles.adminAvatar}>
              {profile?.photo_url ? (
                <Image source={{ uri: profile.photo_url }} style={styles.adminAvatarImage} />
              ) : (
                <Text style={styles.adminAvatarText}>{adminInitial}</Text>
              )}
            </View>
            {!compact && (
              <View style={styles.adminCopy}>
                <Text style={styles.adminName} numberOfLines={1}>
                  {adminName}
                </Text>
                <Text style={styles.adminRole} numberOfLines={1}>
                  {profile?.email || 'superadmin@cebspot.com'}
                </Text>
              </View>
            )}
          </View>
          <Pressable style={styles.signOutButton} onPress={confirmSignOut} disabled={signingOut}>
            <LogOut size={18} color={adminPalette.outlineVariant} />
            {!compact && <Text style={styles.signOutText}>{signingOut ? 'Signing out...' : 'Sign out'}</Text>}
          </Pressable>
        </View>
      </View>}

      <Modal transparent visible={mobileNavOpen} animationType="fade" onRequestClose={() => setMobileNavOpen(false)}>
        <View style={styles.mobileNavBackdrop}>
          <Pressable accessibilityLabel="Close navigation" onPress={() => setMobileNavOpen(false)} style={styles.mobileNavScrim} />
          <View style={styles.mobileNavDrawer}>
            <Pressable accessibilityLabel="Close navigation" onPress={() => setMobileNavOpen(false)} style={styles.mobileNavClose}>
              <X size={20} color={colors.white} />
            </Pressable>
            {sidebarContent}
          </View>
        </View>
      </Modal>

      <View style={styles.workspace}>
        <View style={[styles.topbar, mobile && styles.topbarMobile]}>
          <View style={[styles.topbarLead, mobile && styles.topbarLeadMobile]}>
            {mobile && <Pressable accessibilityLabel="Open navigation" onPress={() => setMobileNavOpen(true)} style={styles.mobileMenuButton}><Menu size={21} color={adminPalette.onSurface} /></Pressable>}
            {mobile && <Text style={styles.mobileSectionTitle}>{activeNav.label}</Text>}
          <View style={[styles.searchBox, mobile && styles.searchBoxMobile]}>
            <Search size={18} color={adminPalette.outline} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={activeNav.searchPlaceholder}
              placeholderTextColor={adminPalette.outline}
              style={styles.searchInput}
            />
          </View>
          </View>
          <View style={[styles.topbarActions, mobile && styles.topbarActionsMobile]}>
            <IconButton icon={RefreshCw} onPress={refreshDashboard} loading={dashboardLoading} />
            <IconButton icon={Bell} dot />
            <View style={styles.topbarDivider} />
            <Pressable
              accessibilityLabel="Open Admin Updates"
              accessibilityRole="button"
              onPress={() => setUpdatesOpen(true)}
              style={[styles.liveBadge, styles.adminUpdatesButton, mobile && styles.adminUpdatesButtonMobile]}
            >
              <Megaphone size={15} color={colors.white} />
              {!mobile && <Text style={styles.liveBadgeText}>Admin Updates</Text>}
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.canvas}
          contentContainerStyle={[styles.canvasContent, mobile && styles.canvasContentMobile]}
          showsVerticalScrollIndicator={false}
        >
          {dashboardError && <InlineNotice title="Live data issue" copy={dashboardError} />}
          {!!dashboard?.errors.length && <InlineNotice title="Partial data loaded" copy={dashboard.errors.slice(0, 2).join(' | ')} />}
          {approvalNotice && (
            <InlineNotice title={approvalNotice.title} copy={approvalNotice.copy} tone={approvalNotice.tone} />
          )}
          {dashboardLoading && !dashboard ? (
            <LoadingPanel />
          ) : dashboard ? (
            <>
              {activeSection === 'overview' && (
                <OverviewSection
                  dashboard={dashboard}
                  client={client}
                  query={query}
                  mobile={mobile}
                  onNavigate={navigateTo}
                />
              )}
              {activeSection === 'spots' && (
                <SpotsSection
                  dashboard={dashboard}
                  client={client}
                  query={query}
                  approvingSubmissionId={approvingSubmissionId}
                  deletingSubmissionId={deletingSubmissionId}
                  deletingSpotId={deletingSpotId}
                  onApproveSubmission={handleApproveSubmission}
                  onDeleteSubmission={confirmDeleteSubmission}
                  onDeleteSpot={confirmDeleteSpot}
                />
              )}
              {activeSection === 'reports' && (
                <ReportsSection
                  reports={dashboard.reports}
                  query={query}
                  moderatingReportId={moderatingReportId}
                  onDismissReport={handleDismissReport}
                  onApplyReport={handleApplyReport}
                  onOpenSpot={openReportSpot}
                />
              )}
              {activeSection === 'users' && (
                <UsersSection dashboard={dashboard} query={query} onClearQuery={() => setQuery('')} />
              )}
              {activeSection === 'requests' && (
                <OwnerRequestsSection
                  dashboard={dashboard}
                  client={client}
                  query={query}
                  reviewingRequestId={reviewingOwnerRequestId}
                  deletingRequestId={deletingOwnerRequestId}
                  onReviewRequest={handleReviewOwnerRequest}
                  onDeleteRequest={confirmDeleteOwnerRequest}
                />
              )}
              {activeSection === 'system' && <SystemSection dashboard={dashboard} client={client} userId={profile?.id} />}
            </>
          ) : (
            <EmptyState title="No dashboard data yet" copy="Refresh the console to request live Supabase data." />
          )}
        </ScrollView>
      </View>

      <AdminUpdatesModal
        client={client}
        visible={updatesOpen}
        onClose={() => setUpdatesOpen(false)}
      />
    </View>
  );
}

function AdminUpdatesModal({
  client,
  visible,
  onClose,
}: {
  client: SupabaseClient;
  visible: boolean;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [updates, setUpdates] = useState<AdminUpdate[]>([]);
  const [message, setMessage] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const resetEditor = useCallback(() => {
    setEditingId(null);
    setMessage('');
    setIsPublished(true);
  }, []);

  const loadUpdates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setUpdates(await getAllAdminUpdates(client));
    } catch (loadError: any) {
      setError(loadError?.message ?? 'Unable to load Admin Updates.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!visible) return;
    resetEditor();
    setNotice(null);
    void loadUpdates();
  }, [loadUpdates, resetEditor, visible]);

  function startEditing(update: AdminUpdate) {
    setEditingId(update.id);
    setMessage(update.message);
    setIsPublished(update.isPublished);
    setError(null);
    setNotice(null);
  }

  async function saveUpdate() {
    if (!message.trim()) {
      setError('Write a message before saving the update.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const saved = editingId
        ? await editAdminUpdate(editingId, { message, isPublished }, client)
        : await createAdminUpdate({ message, isPublished }, client);

      setUpdates((current) => {
        const withoutSaved = current.filter((update) => update.id !== saved.id);
        return [saved, ...withoutSaved].sort(
          (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
        );
      });
      setNotice(editingId ? 'Update saved.' : isPublished ? 'Update published to CebSpot users.' : 'Draft saved.');
      resetEditor();
    } catch (saveError: any) {
      setError(saveError?.message ?? 'Unable to save the update.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(update: AdminUpdate) {
    Alert.alert(
      'Delete this update?',
      update.isPublished
        ? 'This permanently removes the message from the user app.'
        : 'This permanently removes the draft.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setDeletingId(update.id);
                setError(null);
                await deleteAdminUpdate(update.id, client);
                setUpdates((current) => current.filter((item) => item.id !== update.id));
                if (editingId === update.id) resetEditor();
                setNotice('Update deleted.');
              } catch (deleteError: any) {
                setError(deleteError?.message ?? 'Unable to delete the update.');
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.adminUpdatesBackdrop}>
        <Pressable accessibilityLabel="Close Admin Updates" onPress={onClose} style={styles.adminUpdatesScrim} />
        <View style={[styles.adminUpdatesModal, compact && styles.adminUpdatesModalCompact]}>
          <View style={styles.adminUpdatesHeader}>
            <View style={styles.adminUpdatesHeaderIcon}>
              <Megaphone size={21} color={adminPalette.primary} />
            </View>
            <View style={styles.adminUpdatesHeaderCopy}>
              <Text style={styles.adminUpdatesEyebrow}>BETA COMMUNICATIONS</Text>
              <Text style={styles.adminUpdatesTitle}>Admin Updates</Text>
              <Text style={styles.adminUpdatesSubtitle}>Post what is new on CebSpot. Only published updates are visible to users.</Text>
            </View>
            <Pressable accessibilityLabel="Close Admin Updates" onPress={onClose} style={styles.adminUpdatesClose}>
              <X size={21} color={adminPalette.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.adminUpdatesContent} showsVerticalScrollIndicator={false}>
            <View style={styles.adminUpdateComposer}>
              <View style={styles.adminUpdateComposerTop}>
                <View>
                  <Text style={styles.adminUpdateComposerTitle}>{editingId ? 'Edit update' : 'Create an update'}</Text>
                  <Text style={styles.adminUpdateComposerHint}>The user card always uses the headline “Admin Updates.”</Text>
                </View>
                {editingId && (
                  <Pressable accessibilityRole="button" onPress={resetEditor} style={styles.adminUpdateCancelEdit}>
                    <Text style={styles.adminUpdateCancelEditText}>Cancel edit</Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                accessibilityLabel="Admin update message"
                editable={!saving}
                maxLength={1000}
                multiline
                onChangeText={setMessage}
                placeholder="Share a beta feature, fix, maintenance notice, or community update..."
                placeholderTextColor={adminPalette.outline}
                style={styles.adminUpdateInput}
                value={message}
              />
              <View style={styles.adminUpdateComposerFooter}>
                <View style={styles.adminUpdateStatusControl}>
                  {(['draft', 'published'] as const).map((status) => {
                    const selected = status === 'published' ? isPublished : !isPublished;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={status}
                        onPress={() => setIsPublished(status === 'published')}
                        style={[styles.adminUpdateStatusOption, selected && styles.adminUpdateStatusOptionActive]}
                      >
                        <Text style={[styles.adminUpdateStatusText, selected && styles.adminUpdateStatusTextActive]}>
                          {status === 'published' ? 'Publish' : 'Draft'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.adminUpdateCharacterCount}>{message.length}/1000</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving || !message.trim()}
                  onPress={() => void saveUpdate()}
                  style={[styles.adminUpdateSave, (saving || !message.trim()) && styles.adminUpdateSaveDisabled]}
                >
                  {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Megaphone size={15} color={colors.white} />}
                  <Text style={styles.adminUpdateSaveText}>{editingId ? 'Save changes' : isPublished ? 'Publish update' : 'Save draft'}</Text>
                </Pressable>
              </View>
            </View>

            {error && <InlineNotice title="Admin Updates unavailable" copy={error} tone="error" />}
            {notice && <InlineNotice title="Changes saved" copy={notice} tone="success" />}

            <View style={styles.adminUpdateListHeader}>
              <Text style={styles.adminUpdateListTitle}>Update history</Text>
              <Text style={styles.adminUpdateListCount}>{updates.length} {updates.length === 1 ? 'message' : 'messages'}</Text>
            </View>

            {loading ? (
              <View style={styles.adminUpdateState}><ActivityIndicator color={adminPalette.primary} /></View>
            ) : updates.length === 0 ? (
              <View style={styles.adminUpdateState}>
                <Megaphone size={25} color={adminPalette.outline} />
                <Text style={styles.adminUpdateStateTitle}>No updates yet</Text>
                <Text style={styles.adminUpdateStateText}>Create the first beta update above.</Text>
              </View>
            ) : (
              <View style={styles.adminUpdateList}>
                {updates.map((update) => (
                  <View key={update.id} style={styles.adminUpdateListItem}>
                    <View style={styles.adminUpdateListItemTop}>
                      <StatusBadge label={update.isPublished ? 'Published' : 'Draft'} />
                      <Text style={styles.adminUpdateDate}>
                        {new Date(update.publishedAt ?? update.updatedAt).toLocaleString('en-PH', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text style={styles.adminUpdateMessage}>{update.message}</Text>
                    <View style={styles.adminUpdateItemActions}>
                      <Pressable accessibilityLabel="Edit update" onPress={() => startEditing(update)} style={styles.adminUpdateItemButton}>
                        <Edit3 size={14} color={adminPalette.primary} />
                        <Text style={styles.adminUpdateItemButtonText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Delete update"
                        disabled={deletingId === update.id}
                        onPress={() => confirmDelete(update)}
                        style={[styles.adminUpdateItemButton, styles.adminUpdateDeleteButton]}
                      >
                        {deletingId === update.id
                          ? <ActivityIndicator color={adminPalette.error} size="small" />
                          : <Trash2 size={14} color={adminPalette.error} />}
                        <Text style={styles.adminUpdateDeleteText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AdminLoginGate({
  signedInEmail,
  onSignIn,
  onLogout,
  onResetPassword,
}: {
  signedInEmail: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const isCompactLogin = width < 860;
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const hasWrongAccount = Boolean(signedInEmail && normalizeAuthEmail(signedInEmail) !== ADMIN_EMAIL);

  async function logoutWrongAccount() {
    try {
      setSigningOut(true);
      await onLogout();
    } finally {
      setSigningOut(false);
    }
  }

  async function submit() {
    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail || !password) {
      Alert.alert('Missing details', 'Enter the admin email and password.');
      return;
    }
    // Friendlier error message only — this is not the security check. Real
    // enforcement has to happen server-side (see isAdmin comment above);
    // this merely avoids sending an obviously-wrong-account sign-in.
    if (normalizedEmail !== ADMIN_EMAIL) {
      Alert.alert('Admin only', `Use the CebSpot admin account: ${ADMIN_EMAIL}`);
      return;
    }

    try {
      setSubmitting(true);
      await onSignIn(normalizedEmail, password);
    } catch (error: any) {
      Alert.alert('Admin login failed', error.message ?? 'Please check the admin credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  async function requestPasswordReset() {
    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail) {
      Alert.alert('Email required', 'Enter the admin email first.');
      return;
    }
    if (normalizedEmail !== ADMIN_EMAIL) {
      Alert.alert('Admin only', `Password recovery is available for ${ADMIN_EMAIL}.`);
      return;
    }

    try {
      setRequestingReset(true);
      await onResetPassword(normalizedEmail);
      Alert.alert('Reset email sent', 'Check the admin inbox for a secure password reset link.');
    } catch (error) {
      Alert.alert('Unable to reset password', getAuthErrorMessage(error));
    } finally {
      setRequestingReset(false);
    }
  }

  return (
    <View style={[styles.adminLoginScreen, isCompactLogin && styles.adminLoginScreenCompact]}>
      {!isCompactLogin && (
        <View style={styles.adminLoginStory}>
          <View style={styles.adminLoginStoryGlowTop} />
          <View style={styles.adminLoginStoryGlowBottom} />
          <View style={styles.adminLoginBrandRow}>
            <Image
              accessibilityLabel="CebSpot logo"
              resizeMode="contain"
              source={cebspotLogo}
              style={styles.adminLoginLogo}
            />
            <View>
              <Text style={styles.adminLoginBrandName}>CebSpot Admin</Text>
              <Text style={styles.adminLoginBrandMeta}>OPERATIONS CONSOLE</Text>
            </View>
          </View>

          <View style={styles.adminLoginStoryContent}>
            <Text style={styles.adminLoginEyebrow}>CEBU OPERATIONS</Text>
            <Text style={styles.adminLoginHeadline}>Run the platform with clarity.</Text>
            <Text style={styles.adminLoginStoryCopy}>
              Review discovery, trust and safety, ownership, and system health from one protected workspace.
            </Text>
            <View style={styles.adminLoginPromiseList}>
              {[
                'Priority queues and live platform signals',
                'Evidence-first moderation workflows',
                'Role-protected administrative access',
              ].map((promise) => (
                <View key={promise} style={styles.adminLoginPromiseItem}>
                  <View style={styles.adminLoginPromiseIcon}>
                    <CheckCircle2 size={15} color={adminPalette.primaryFixed} strokeWidth={2.8} />
                  </View>
                  <Text style={styles.adminLoginPromiseText}>{promise}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.adminLoginRestrictedPill}>
            <ShieldCheck size={15} color="#ffd5bd" />
            <Text style={styles.adminLoginRestrictedText}>Authorized personnel only</Text>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.adminLoginFormContent,
          isCompactLogin && styles.adminLoginFormContentCompact,
        ]}
        keyboardShouldPersistTaps="handled"
        style={styles.adminLoginFormPane}
      >
        {isCompactLogin && (
          <View style={styles.adminLoginMobileBrand}>
            <Image
              accessibilityLabel="CebSpot logo"
              resizeMode="contain"
              source={cebspotLogo}
              style={styles.adminLoginMobileLogo}
            />
            <View>
              <Text style={styles.adminLoginMobileBrandName}>CebSpot Admin</Text>
              <Text style={styles.adminLoginMobileBrandMeta}>OPERATIONS CONSOLE</Text>
            </View>
          </View>
        )}

        <View style={styles.adminLoginFormCard}>
          <View style={styles.adminLoginFormIcon}>
            <ShieldCheck size={23} color={adminPalette.primaryFixed} strokeWidth={2.5} />
          </View>
          <Text style={styles.adminLoginFormEyebrow}>ADMINISTRATOR ACCESS</Text>
          <Text style={styles.adminLoginTitle}>Welcome back</Text>
          <Text style={styles.adminLoginSubtitle}>
            Sign in to continue to the CebSpot operations console.
          </Text>

          <View style={styles.adminLoginSecurityNote}>
            <Radio size={14} color={adminPalette.success} />
            <Text style={styles.adminLoginSecurityText}>Protected admin session</Text>
          </View>

          {hasWrongAccount ? (
            <>
              <View style={styles.adminGateNotice}>
                <TriangleAlert size={18} color={adminPalette.error} />
                <Text style={styles.adminGateNoticeText}>
                  {signedInEmail} is signed in, but it does not have admin access.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={submitting || signingOut}
                onPress={logoutWrongAccount}
                style={({ pressed }) => [
                  styles.adminLoginButton,
                  pressed && styles.adminLoginButtonPressed,
                  (submitting || signingOut) && styles.adminLoginButtonDisabled,
                ]}
              >
                {signingOut ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.adminLoginButtonText}>Sign out and use admin account</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.adminLoginFieldLabel}>Email address</Text>
              <TextInput
                accessibilityLabel="Admin email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="name@cebspot.com"
                placeholderTextColor={adminPalette.outline}
                style={styles.adminLoginInput}
              />

              <View style={styles.adminLoginPasswordLabelRow}>
                <Text style={styles.adminLoginFieldLabel}>Password</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting || requestingReset}
                  hitSlop={8}
                  onPress={requestPasswordReset}
                >
                  <Text style={styles.adminLoginForgotText}>
                    {requestingReset ? 'Sending reset email...' : 'Forgot password?'}
                  </Text>
                </Pressable>
              </View>
              <PasswordInput
                accessibilityLabel="Admin password"
                value={password}
                onChangeText={setPassword}
                autoComplete="current-password"
                placeholder="Enter your password"
                placeholderTextColor={adminPalette.outline}
                containerStyle={styles.adminLoginPasswordContainer}
                style={styles.adminLoginPasswordInput}
                onSubmitEditing={submit}
              />

              <Pressable
                accessibilityRole="button"
                disabled={submitting || requestingReset}
                onPress={submit}
                style={({ pressed }) => [
                  styles.adminLoginButton,
                  pressed && styles.adminLoginButtonPressed,
                  (submitting || requestingReset) && styles.adminLoginButtonDisabled,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <View style={styles.adminLoginButtonContent}>
                    <Text style={styles.adminLoginButtonText}>Sign in to admin console</Text>
                    <ChevronRight size={18} color={colors.white} strokeWidth={2.6} />
                  </View>
                )}
              </Pressable>
            </>
          )}

          <View style={styles.adminLoginLegalRule} />
          <Text style={styles.adminLoginLegal}>
            CebSpot administrative access is restricted. Activity may be logged for security and audit purposes.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SidebarItem({
  item,
  active,
  compact,
  count,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  compact: boolean;
  count?: number;
  onPress: () => void;
}) {
  const Icon = item.icon;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.label}${count ? ` ${count}` : ''}`} accessibilityState={{ selected: active }} style={[styles.navItem, active && styles.navItemActive, compact && styles.navItemCompact]} onPress={onPress}>
      <Icon size={19} color={active ? adminPalette.primaryFixed : '#d8d4d1'} strokeWidth={active ? 2.7 : 2.1} />
      {!compact && <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>}
      {!!count && <View style={[styles.navCount, compact && styles.navCountCompact]}><Text style={styles.navCountText}>{count > 99 ? '99+' : count}</Text></View>}
    </Pressable>
  );
}

function IconButton({
  icon: Icon,
  dot,
  loading,
  onPress,
}: {
  icon: LucideIcon;
  dot?: boolean;
  loading?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.iconButton} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator color={adminPalette.primary} /> : <Icon size={18} color={adminPalette.onSurfaceVariant} />}
      {dot && <View style={styles.notificationDot} />}
    </Pressable>
  );
}

function PageIntro({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.pageIntro}>
      <View style={styles.pageIntroCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.pageTitle}>{title}</Text>
        <Text style={styles.pageSubtitle}>{subtitle}</Text>
      </View>
      {right}
    </View>
  );
}

function SegmentedRange({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.rangeControl}>
      {['24h', '7d', '30d', '90d'].map((range) => (
        <Pressable key={range} accessibilityRole="button" accessibilityState={{ selected: range === value }} onPress={() => onChange(range)} style={[styles.rangeButton, range === value && styles.rangeButtonActive]}>
          <Text style={[styles.rangeText, range === value && styles.rangeTextActive]}>{range}</Text>
        </Pressable>
      ))}
      <View style={styles.rangeDivider} />
      <View style={styles.calendarChip}>
        <CalendarDays size={15} color={adminPalette.onSurfaceVariant} />
        <Text style={styles.calendarChipText}>{value === '24h' ? 'Today' : `Last ${value}`}</Text>
      </View>
    </View>
  );
}

function OverviewSection({
  dashboard,
  client,
  query,
  mobile,
  onNavigate,
}: {
  dashboard: AdminDashboardData;
  client: SupabaseClient;
  query: string;
  mobile: boolean;
  onNavigate: (section: AdminSection) => void;
}) {
  const pulseRows = filterPulse(dashboard.livePulse, query);
  const dailyInsights = dashboard.dailyInsights;
  const latestDayIndex = Math.max(0, dailyInsights.length - 1);
  const [selectedDayIndex, setSelectedDayIndex] = useState(latestDayIndex);
  const [range, setRange] = useState('7d');
  const [mapVisible, setMapVisible] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapSpots, setMapSpots] = useState<AdminMapSpotRow[]>([]);
  const [selectedMapSpotId, setSelectedMapSpotId] = useState<string | null>(null);

  async function openMapOverview(force = false) {
    setMapVisible(true);
    if (mapSpots.length && !force) return;
    try {
      setMapLoading(true);
      setMapError(null);
      const rows = await getAdminSpotMapRows(client);
      setMapSpots(rows);
      setSelectedMapSpotId(rows[0]?.id ?? null);
    } catch (error: any) {
      setMapError(error?.message ?? 'Unable to load the spot map.');
    } finally {
      setMapLoading(false);
    }
  }

  useEffect(() => {
    setSelectedDayIndex((current) => Math.min(current, Math.max(0, dailyInsights.length - 1)));
  }, [dailyInsights.length, dashboard.generatedAt]);

  const selectedDay = dailyInsights[selectedDayIndex] ?? dailyInsights[latestDayIndex];
  const selectedDayLabel = selectedDay?.label ?? 'Latest';
  const selectedRevenue = selectedDay?.estimatedRevenue ?? dashboard.metrics.estimatedRevenue;
  const selectedTotalSpots = selectedDay?.totalSpots ?? dashboard.metrics.totalSpots;
  const selectedOwners = selectedDay?.activeOwners ?? dashboard.metrics.activeOwners;
  const selectedReports = selectedDay?.reportsFiled ?? dashboard.metrics.reportsFiled;

  return (
    <View>
      <PageIntro
        eyebrow="Insights"
        title="Overview"
        subtitle={`Live platform health - refreshed ${formatLastUpdated(dashboard.generatedAt)}`}
        right={<SegmentedRange value={range} onChange={setRange} />}
      />

      <View style={styles.actionCenterHeader}>
        <View><Text style={styles.sectionEyebrow}>PRIORITY QUEUES</Text><Text style={styles.sectionTitle}>Needs your attention</Text></View>
        <Text style={styles.sectionHint}>Live operational workload</Text>
      </View>
      <View style={styles.actionGrid}>
        <ActionCard icon={UserPlus} label="Owner requests" value={dashboard.ownerRequests.filter((item) => item.status.toLowerCase() === 'pending').length} copy="Verify business ownership" tone="primary" onPress={() => onNavigate('requests')} />
        <ActionCard icon={TriangleAlert} label="Reports" value={dashboard.reports.length} copy="Review trust and safety issues" tone="danger" onPress={() => onNavigate('reports')} />
        <ActionCard icon={MapPin} label="Spot submissions" value={dashboard.metrics.pendingSpotSubmissions} copy="Approve new places" tone="blue" onPress={() => onNavigate('spots')} />
      </View>

      <View style={[styles.overviewGrid, mobile && styles.overviewGridMobile]}>
        <View style={styles.heroCard}>
          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>Estimated Spot Revenue</Text>
            <View style={styles.heroValueRow}>
              <Text style={styles.heroValue}>P {selectedRevenue.toLocaleString('en-US')}</Text>
              <View style={styles.heroDelta}>
                <TrendingUp size={12} color={colors.white} />
                <Text style={styles.heroDeltaText}>{selectedDayLabel}</Text>
              </View>
            </View>
            <Text style={styles.heroCopy}>Confirmed paid bookings for the selected chart day.</Text>
          </View>
          <View style={styles.heroStats}>
            <DarkMiniStat label="Selected Day" value={selectedDayLabel} />
            <DarkMiniStat label="Reservations" value={formatCompactNumber(selectedDay?.reservations ?? dashboard.metrics.reservationsToday)} />
            <DarkMiniStat label="New Spots" value={formatCompactNumber(selectedDay?.newSpots ?? dashboard.metrics.spotsToday)} />
          </View>
          <TrendingUp size={210} color="#FA5F00" style={styles.heroWatermark} />
        </View>

        <View style={[styles.overviewSideStats, mobile && styles.overviewSideStatsMobile]}>
          <StatCard label="Published Spots" value={formatCompactNumber(selectedTotalSpots)} icon={Map} delta={selectedDayLabel} />
          <StatCard label="Active Owners" value={formatCompactNumber(selectedOwners)} icon={User} delta={selectedDayLabel} />
          <StatCard
            label="Reports Filed"
            value={formatCompactNumber(selectedReports)}
            icon={TriangleAlert}
            tone="danger"
            delta={selectedDayLabel}
          />
        </View>
      </View>

      <View style={[styles.twoColumnGrid, mobile && styles.twoColumnGridMobile]}>
        <ChartCard
          title="Reservations per day"
          subtitle="Volume tracking for confirmed bookings"
          action={<Text style={styles.chartSelectedLabel}>{selectedDayLabel}</Text>}
        >
          <BarChart
            values={dashboard.reservationsBars}
            activeIndex={selectedDayIndex}
            labels={dashboard.reservationBarLabels}
            onBarPress={setSelectedDayIndex}
            barAccessibilityLabel={(index) => `${dailyInsights[index]?.label ?? 'Day'} reservations`}
          />
        </ChartCard>
        <ChartCard
          title="New spots per day"
          subtitle="Inventory growth metrics"
          action={<Text style={styles.chartSelectedLabel}>{selectedDayLabel}</Text>}
        >
          <BarChart
            values={dashboard.newSpotBars}
            activeIndex={selectedDayIndex}
            labels={dashboard.newSpotBarLabels}
            onBarPress={setSelectedDayIndex}
            barAccessibilityLabel={(index) => `${dailyInsights[index]?.label ?? 'Day'} new spots`}
          />
        </ChartCard>
      </View>

      <View style={[styles.twoColumnGrid, mobile && styles.twoColumnGridMobile]}>
        <ProgressPanel title="Top spot categories" subtitle="Categorical distribution by venue type" data={dashboard.categories} categoryOverview />
        <ProgressPanel
          title="Top barangays in Cebu"
          subtitle="Leaderboard areas for registered spots."
          data={dashboard.barangays}
          yellow
          actionLabel="Open overview spot map"
          onAction={openMapOverview}
        />
      </View>

      <DataPanel title="Live Platform Pulse" right={<LiveSessionLabel count={dashboard.livePulse.length} />}>
        <DataTable
          columns={[
            {
              key: 'action',
              label: 'Action',
              flex: 1.5,
              render: (item) => (
                <View style={styles.rowWithIcon}>
                  <View style={styles.rowIcon}>
                    <TicketCheck size={16} color={adminPalette.primary} />
                  </View>
                  <Text style={styles.tableStrong}>{item.action}</Text>
                </View>
              ),
            },
            { key: 'user', label: 'User', render: (item) => <Text style={styles.tableMuted}>{item.user}</Text> },
            { key: 'location', label: 'Location', flex: 1.4, render: (item) => <Text style={styles.tableMuted}>{item.location}</Text> },
            {
              key: 'value',
              label: 'Value',
              align: 'right',
              render: (item) => <Text style={styles.tablePrimary}>{item.value}</Text>,
            },
            {
              key: 'status',
              label: 'Status',
              align: 'right',
              render: (item) => <StatusBadge label={item.status} />,
            },
          ]}
          data={pulseRows}
          emptyCopy="No matching platform activity yet."
        />
      </DataPanel>
      <SpotMapOverviewModal
        error={mapError}
        loading={mapLoading}
        onClose={() => setMapVisible(false)}
        onRetry={() => {
          void openMapOverview(true);
        }}
        onSelectSpot={setSelectedMapSpotId}
        selectedSpotId={selectedMapSpotId}
        spots={mapSpots}
        visible={mapVisible}
      />
    </View>
  );
}

function ActionCard({ icon: Icon, label, value, copy, tone, onPress }: { icon: LucideIcon; label: string; value: number; copy: string; tone: 'primary' | 'danger' | 'blue'; onPress: () => void }) {
  const tint = tone === 'danger' ? { bg: adminPalette.errorContainer + '20', color: adminPalette.error } : tone === 'blue' ? { bg: '#dbeafe', color: '#1d4ed8' } : { bg: adminPalette.primary + '12', color: adminPalette.primary };
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}><View style={[styles.actionIcon, { backgroundColor: tint.bg }]}><Icon size={19} color={tint.color} /></View><View style={styles.actionCardCopy}><Text style={styles.actionLabel}>{label}</Text><Text style={styles.actionDescription}>{copy}</Text></View><Text style={styles.actionValue}>{formatCompactNumber(value)}</Text><ChevronRight size={18} color={adminPalette.outline} /></Pressable>;
}

function DarkMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.darkMiniStat}>
      <Text style={styles.darkMiniLabel}>{label}</Text>
      <Text style={styles.darkMiniValue}>{value}</Text>
    </View>
  );
}

function SpotsSection({
  dashboard,
  client,
  query,
  approvingSubmissionId,
  deletingSubmissionId,
  deletingSpotId,
  onApproveSubmission,
  onDeleteSubmission,
  onDeleteSpot,
}: {
  dashboard: AdminDashboardData;
  client: SupabaseClient;
  query: string;
  approvingSubmissionId: string | null;
  deletingSubmissionId: string | null;
  deletingSpotId: string | null;
  onApproveSubmission: (submission: AdminSpotSubmissionRow) => void;
  onDeleteSubmission: (submission: AdminSpotSubmissionRow) => void;
  onDeleteSpot: (listing: AdminListingRow) => void;
}) {
  const listings = filterListings(dashboard.recentListings, query);
  const pendingSubmissions = filterSubmissions(dashboard.pendingSubmissions, query);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapSpots, setMapSpots] = useState<AdminMapSpotRow[]>([]);
  const [selectedMapSpotId, setSelectedMapSpotId] = useState<string | null>(null);

  async function openMapOverview(force = false) {
    setMapVisible(true);
    if (mapSpots.length && !force) return;
    try {
      setMapLoading(true);
      setMapError(null);
      const rows = await getAdminSpotMapRows(client);
      setMapSpots(rows);
      setSelectedMapSpotId(rows[0]?.id ?? null);
    } catch (error: any) {
      setMapError(error?.message ?? 'Unable to load the spot map.');
    } finally {
      setMapLoading(false);
    }
  }

  useEffect(() => {
    if (!pendingSubmissions.length) {
      setExpandedSubmissionId(null);
      return;
    }
    if (expandedSubmissionId && !pendingSubmissions.some((submission) => submission.id === expandedSubmissionId)) {
      setExpandedSubmissionId(null);
    }
  }, [expandedSubmissionId, pendingSubmissions]);

  return (
    <View>
      <PageIntro
        eyebrow="Discovery"
        title="Spots"
        subtitle="Venue listings registered in CebSpot."
        right={<SimpleRangePills />}
      />
      <View style={styles.spotStatsGrid}>
        <StatCard label="Spots in range" value={formatCompactNumber(dashboard.metrics.publicSpots)} icon={MapPin} delta="Live" />
        <StatCard label="Reservable spots" value={formatCompactNumber(dashboard.metrics.reservableSpots)} icon={ShieldCheck} tone="warning" delta="Ready" />
        <StatCard label="Needs Approval" value={formatCompactNumber(dashboard.metrics.pendingSpotSubmissions)} icon={CheckCircle2} tone="blue" delta="Queue" />
        <View style={styles.growthCard}>
          <View style={styles.growthContent}>
            <Text style={styles.growthLabel}>Inventory Signal</Text>
            <Text style={styles.growthTitle}>{dashboard.metrics.spotsToday} new spots were added today.</Text>
            <View style={styles.growthLinkRow}>
              <Text style={styles.growthLink}>Refreshed {formatLastUpdated(dashboard.generatedAt)}</Text>
              <TrendingUp size={15} color={colors.white} />
            </View>
          </View>
          <TrendingUp size={155} color="#ffffff30" style={styles.growthWatermark} />
        </View>
      </View>

      <View style={styles.twoColumnGrid}>
        <ProgressPanel title="Top spot categories" subtitle="Categorical distribution by venue type" data={dashboard.categories} categoryOverview />
        <ProgressPanel
          title="Top barangays in Cebu"
          subtitle="Leaderboard areas for registered spots."
          data={dashboard.barangays}
          yellow
          actionLabel="Open spot map overview"
          onAction={openMapOverview}
        />
      </View>

      <HistoricalSpotPostAudit client={client} />

      <DataPanel title="Pending Spot Submissions" right={<Text style={styles.exportLink}>{pendingSubmissions.length} Pending</Text>}>
        <PendingSubmissionsTable
          client={client}
          submissions={pendingSubmissions}
          expandedSubmissionId={expandedSubmissionId}
          approvingSubmissionId={approvingSubmissionId}
          deletingSubmissionId={deletingSubmissionId}
          onToggleSubmission={(submission) =>
            setExpandedSubmissionId((current) => (current === submission.id ? null : submission.id))
          }
          onApproveSubmission={onApproveSubmission}
          onDeleteSubmission={onDeleteSubmission}
        />
      </DataPanel>

      <DataPanel
        title="Recent Listings"
        right={
          <Pressable onPress={() => Alert.alert('Coming soon', "CSV export isn't wired up yet.")}>
            <Text style={styles.exportLink}>Export CSV</Text>
          </Pressable>
        }
      >
        <DataTable
          columns={[
            {
              key: 'name',
              label: 'Spot Name',
              flex: 1.8,
              render: (item) => (
                <View style={styles.listingCell}>
                  <Image source={{ uri: item.image }} style={styles.listingImage} />
                  <View>
                    <Text style={styles.tableStrong}>{item.name}</Text>
                    <Text style={styles.tableMini}>ID: {item.id}</Text>
                  </View>
                </View>
              ),
            },
            { key: 'category', label: 'Category', render: (item) => <Text style={styles.tableMuted}>{item.category}</Text> },
            { key: 'barangay', label: 'Barangay', render: (item) => <Text style={styles.tableMuted}>{item.barangay}</Text> },
            { key: 'status', label: 'Status', render: (item) => <StatusBadge label={item.status} /> },
            { key: 'date', label: 'Date Registered', flex: 1.2, render: (item) => <Text style={styles.tableMuted}>{item.date}</Text> },
            {
              key: 'actions',
              label: 'Actions',
              align: 'right',
              render: (item) => (
                <View style={styles.inlineActions}>
                  <Pressable
                    accessibilityLabel={`Edit ${item.name}`}
                    accessibilityRole="button"
                    style={styles.tableIconButton}
                    onPress={() => Alert.alert('Coming soon', `Editing ${item.name} isn't wired up yet.`)}
                  >
                    <Edit3 size={16} color={adminPalette.onSurfaceVariant} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Delete ${item.name}`}
                    accessibilityRole="button"
                    disabled={deletingSpotId === item.id}
                    style={[styles.tableIconButton, deletingSpotId === item.id && styles.tableIconButtonDisabled]}
                    onPress={() => onDeleteSpot(item)}
                  >
                    {deletingSpotId === item.id ? (
                      <ActivityIndicator size="small" color={adminPalette.error} />
                    ) : (
                      <Trash2 size={16} color={adminPalette.error} />
                    )}
                  </Pressable>
                </View>
              ),
            },
          ]}
          data={listings}
          emptyCopy="No spots match this search."
        />
      </DataPanel>

      <Pressable
        style={styles.floatingAdd}
        onPress={() => Alert.alert('Coming soon', "Manually adding a spot isn't wired up yet.")}
      >
        <Plus size={24} color={colors.white} />
      </Pressable>

      <SpotMapOverviewModal
        error={mapError}
        loading={mapLoading}
        onClose={() => setMapVisible(false)}
        onRetry={() => {
          void openMapOverview(true);
        }}
        onSelectSpot={setSelectedMapSpotId}
        selectedSpotId={selectedMapSpotId}
        spots={mapSpots}
        visible={mapVisible}
      />
    </View>
  );
}

function SpotMapOverviewModal({
  visible,
  spots,
  selectedSpotId,
  loading,
  error,
  onSelectSpot,
  onRetry,
  onClose,
}: {
  visible: boolean;
  spots: AdminMapSpotRow[];
  selectedSpotId: string | null;
  loading: boolean;
  error: string | null;
  onSelectSpot: (spotId: string) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 860;
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const categoryOptions = useMemo(() => {
    const counts = new globalThis.Map<string, number>();
    spots.forEach((spot) => {
      const labels = new Set(
        [spot.category, ...spot.categories]
          .map((category) => category?.trim())
          .filter((category): category is string => Boolean(category)),
      );
      labels.forEach((category) => counts.set(category, (counts.get(category) ?? 0) + 1));
    });
    return [
      { label: 'All', count: spots.length },
      ...Array.from(counts.entries())
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([label, count]) => ({ label, count })),
    ];
  }, [spots]);
  const visibleSpots = useMemo(
    () => selectedCategory === 'All'
      ? spots
      : spots.filter((spot) =>
          [spot.category, ...spot.categories].some(
            (category) => category.trim().toLowerCase() === selectedCategory.toLowerCase(),
          ),
        ),
    [selectedCategory, spots],
  );
  const selectedSpot = visibleSpots.find((spot) => spot.id === selectedSpotId) ?? visibleSpots[0] ?? null;
  const center = selectedSpot
    ? { latitude: selectedSpot.latitude, longitude: selectedSpot.longitude }
    : { latitude: 10.3157, longitude: 123.8854 };
  const markers = visibleSpots.map((spot) => ({
    id: spot.id,
    latitude: spot.latitude,
    longitude: spot.longitude,
    label: spot.name,
    category: [spot.category, ...spot.categories].join(' '),
    selected: spot.id === selectedSpot?.id,
    color: getSpotCategoryColor(spot.category, spot.categories),
    variant: 'pin' as const,
  }));

  useEffect(() => {
    if (!categoryOptions.some((option) => option.label === selectedCategory)) {
      setSelectedCategory('All');
    }
  }, [categoryOptions, selectedCategory]);

  function selectCategory(category: string) {
    setSelectedCategory(category);
    setCategoryMenuOpen(false);
    const firstVisibleSpot = category === 'All'
      ? spots[0]
      : spots.find((spot) =>
          [spot.category, ...spot.categories].some(
            (label) => label.trim().toLowerCase() === category.toLowerCase(),
          ),
        );
    if (firstVisibleSpot) onSelectSpot(firstVisibleSpot.id);
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.spotMapBackdrop}>
        <Pressable accessibilityLabel="Close spot map" onPress={onClose} style={styles.spotMapScrim} />
        <View style={[styles.spotMapModal, compact && styles.spotMapModalCompact]}>
          <View style={styles.spotMapHeader}>
            <View style={styles.spotMapHeaderIcon}>
              <Map size={20} color={adminPalette.primary} />
            </View>
            <View style={styles.spotMapHeaderCopy}>
              <Text style={styles.spotMapEyebrow}>SPOT DIRECTORY</Text>
              <Text style={styles.spotMapTitle}>Cebu map overview</Text>
              <Text style={styles.spotMapSubtitle}>
                {selectedCategory === 'All'
                  ? `${spots.length} registered spots with map coordinates`
                  : `${visibleSpots.length} of ${spots.length} spots in ${selectedCategory}`}
              </Text>
            </View>
            <Pressable accessibilityLabel="Close spot map" onPress={onClose} style={styles.spotMapClose}>
              <X size={21} color={adminPalette.onSurfaceVariant} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.spotMapState}>
              <ActivityIndicator color={adminPalette.primary} />
              <Text style={styles.spotMapStateText}>Loading registered spots...</Text>
            </View>
          ) : error ? (
            <View style={styles.spotMapState}>
              <TriangleAlert size={26} color={adminPalette.error} />
              <Text style={styles.spotMapStateTitle}>Map unavailable</Text>
              <Text style={styles.spotMapStateText}>{error}</Text>
              <Pressable onPress={onRetry} style={styles.spotMapRetry}>
                <RefreshCw size={15} color={colors.white} />
                <Text style={styles.spotMapRetryText}>Try again</Text>
              </Pressable>
            </View>
          ) : spots.length === 0 ? (
            <View style={styles.spotMapState}>
              <MapPin size={28} color={adminPalette.outline} />
              <Text style={styles.spotMapStateTitle}>No mapped spots yet</Text>
              <Text style={styles.spotMapStateText}>Spots need valid latitude and longitude values to appear here.</Text>
            </View>
          ) : (
            <View style={[styles.spotMapBody, compact && styles.spotMapBodyCompact]}>
              <View style={[styles.spotMapCanvas, compact && styles.spotMapCanvasCompact]}>
                <TileMap
                  center={center}
                  markers={markers}
                  onMarkerPress={(marker) => onSelectSpot(marker.id)}
                  style={styles.spotMapTile}
                  transitionKey={`${selectedCategory}:${selectedSpot?.id ?? 'none'}`}
                  zoom={selectedSpot ? 14 : 12}
                />
                <View style={styles.spotMapCategoryFilter}>
                  <Pressable
                    accessibilityLabel={`Filter mapped spots. ${selectedCategory === 'All' ? 'All categories' : selectedCategory} selected.`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: categoryMenuOpen }}
                    onPress={() => setCategoryMenuOpen((current) => !current)}
                    style={styles.spotMapCategoryTrigger}
                  >
                    <View
                      style={[
                        styles.spotMapCategoryDot,
                        { backgroundColor: selectedCategory === 'All' ? adminPalette.primary : getSpotCategoryColor(selectedCategory) },
                      ]}
                    />
                    <View style={styles.spotMapCategoryTriggerCopy}>
                      <Text style={styles.spotMapCategoryTriggerLabel} numberOfLines={1}>
                        {selectedCategory === 'All' ? 'All categories' : selectedCategory}
                      </Text>
                      <Text style={styles.spotMapCategoryTriggerMeta}>{visibleSpots.length} visible spots</Text>
                    </View>
                    {categoryMenuOpen
                      ? <ChevronUp size={16} color={adminPalette.onSurfaceVariant} />
                      : <ChevronDown size={16} color={adminPalette.onSurfaceVariant} />}
                  </Pressable>

                  {categoryMenuOpen && (
                    <ScrollView
                      accessibilityLabel="Spot category choices"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      style={[styles.spotMapCategoryMenu, compact && styles.spotMapCategoryMenuCompact]}
                    >
                      {categoryOptions.map((option) => {
                        const active = option.label === selectedCategory;
                        const categoryColor = option.label === 'All'
                          ? adminPalette.primary
                          : getSpotCategoryColor(option.label);
                        return (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            key={option.label}
                            onPress={() => selectCategory(option.label)}
                            style={[styles.spotMapCategoryOption, active && styles.spotMapCategoryOptionActive]}
                          >
                            <View style={[styles.spotMapCategoryDot, { backgroundColor: categoryColor }]} />
                            <Text style={[styles.spotMapCategoryOptionText, active && styles.spotMapCategoryOptionTextActive]} numberOfLines={1}>
                              {option.label === 'All' ? 'All categories' : option.label}
                            </Text>
                            <Text style={styles.spotMapCategoryOptionCount}>{option.count}</Text>
                            {active && <CheckCircle2 size={15} color={adminPalette.primary} />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              </View>

              <View style={[styles.spotMapDirectory, compact && styles.spotMapDirectoryCompact]}>
                {selectedSpot && (
                  <View style={styles.spotMapSelectedCard}>
                    <View
                      style={[
                        styles.spotMapSelectedCategoryIcon,
                        { backgroundColor: getSpotCategoryColor(selectedSpot.category, selectedSpot.categories) + '1f' },
                      ]}
                    >
                      <MapPin size={21} color={getSpotCategoryColor(selectedSpot.category, selectedSpot.categories)} />
                    </View>
                    <View style={styles.spotMapSelectedBody}>
                      <View style={styles.spotMapSelectedTopline}>
                        <StatusBadge label={selectedSpot.isPublic ? 'Published' : 'Hidden'} />
                        {selectedSpot.isReservable && <StatusBadge label="Reservable" />}
                      </View>
                      <Text style={styles.spotMapSelectedName}>{selectedSpot.name}</Text>
                      <View style={styles.spotMapSelectedCategories}>
                        {Array.from(new Set([selectedSpot.category, ...selectedSpot.categories])).map((category) => (
                          <View
                            key={category}
                            style={[
                              styles.spotMapSelectedCategoryChip,
                              { backgroundColor: getSpotCategoryColor(category) + '1a' },
                            ]}
                          >
                            <View style={[styles.spotMapSelectedCategoryDot, { backgroundColor: getSpotCategoryColor(category) }]} />
                            <Text style={[styles.spotMapSelectedCategory, { color: getSpotCategoryColor(category) }]}>{category}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.spotMapAddressRow}>
                        <MapPin size={13} color={adminPalette.primary} />
                        <Text style={styles.spotMapSelectedAddress}>{selectedSpot.address}</Text>
                      </View>
                      <Text style={styles.spotMapRating}>
                        {selectedSpot.rating.toFixed(1)} rating · {selectedSpot.reviewCount} reviews
                      </Text>
                      {selectedSpot.description ? (
                        <Text style={styles.spotMapDescription} numberOfLines={3}>{selectedSpot.description}</Text>
                      ) : null}
                    </View>
                  </View>
                )}

                <Text style={styles.spotMapListHeading}>
                  {selectedCategory === 'All' ? 'ALL MAPPED SPOTS' : `${selectedCategory.toUpperCase()} SPOTS`}
                </Text>
                <ScrollView style={styles.spotMapList} contentContainerStyle={styles.spotMapListContent}>
                  {visibleSpots.map((spot) => {
                    const active = spot.id === selectedSpot?.id;
                    const categoryColor = getSpotCategoryColor(spot.category, spot.categories);
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        key={spot.id}
                        onPress={() => onSelectSpot(spot.id)}
                        style={[styles.spotMapListItem, active && styles.spotMapListItemActive]}
                      >
                        <View style={[styles.spotMapListCategoryIcon, { backgroundColor: categoryColor + '1a' }]}>
                          <MapPin size={17} color={categoryColor} />
                        </View>
                        <View style={styles.spotMapListCopy}>
                          <Text style={styles.spotMapListName} numberOfLines={1}>{spot.name}</Text>
                          <Text style={styles.spotMapListMeta} numberOfLines={1}>{spot.category} · {spot.barangay}</Text>
                        </View>
                        <ChevronRight size={16} color={active ? adminPalette.primary : adminPalette.outline} />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function PendingSubmissionsTable({
  client,
  submissions,
  expandedSubmissionId,
  approvingSubmissionId,
  deletingSubmissionId,
  onToggleSubmission,
  onApproveSubmission,
  onDeleteSubmission,
}: {
  client: SupabaseClient;
  submissions: AdminSpotSubmissionRow[];
  expandedSubmissionId: string | null;
  approvingSubmissionId: string | null;
  deletingSubmissionId: string | null;
  onToggleSubmission: (submission: AdminSpotSubmissionRow) => void;
  onApproveSubmission: (submission: AdminSpotSubmissionRow) => void;
  onDeleteSubmission: (submission: AdminSpotSubmissionRow) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableScrollContainer}>
    <View style={styles.tableScrollContent}>
      <View style={styles.tableHead}>
        {['Submitted Spot', 'Sender', 'Category', 'Popularity', 'Submitted', 'Actions'].map((label, index) => (
          <Text
            key={label}
            style={[
              styles.tableHeadText,
              { flex: index === 0 ? 1.9 : index === 1 ? 1.25 : 1, textAlign: index === 5 ? 'right' : 'left' },
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
      {submissions.map((submission) => {
        const expanded = expandedSubmissionId === submission.id;
        const approving = approvingSubmissionId === submission.id;
        const deleting = deletingSubmissionId === submission.id;
        const busy = approving || deleting;
        return (
          <React.Fragment key={submission.id}>
            <View style={[styles.tableRow, expanded && styles.submissionRowExpanded]}>
              <View style={{ flex: 1.9 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onToggleSubmission(submission)}
                  style={({ pressed }) => [styles.submissionSpotButton, pressed && styles.submissionSpotButtonPressed]}
                >
                  <Image source={{ uri: submission.image }} style={styles.listingImage} />
                  <View style={styles.submissionSpotCopy}>
                    <Text style={styles.tableStrong}>{submission.name}</Text>
                    <Text style={styles.tableMini} numberOfLines={1}>
                      {submission.description || `ID: ${submission.id}`}
                    </Text>
                  </View>
                  {expanded ? <ChevronUp size={16} color={adminPalette.primary} /> : <ChevronRight size={16} color={adminPalette.primary} />}
                </Pressable>
              </View>
              <View style={{ flex: 1.25 }}>
                <Text style={styles.tableStrong} numberOfLines={1}>{submission.submitterName}</Text>
                <Text style={styles.tableMini} numberOfLines={1}>{submission.submitterEmail}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tableMuted}>{submission.category}</Text>
                <Text style={styles.tableMini} numberOfLines={1}>{submission.barangay}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tablePrimary}>{submission.popularityScore} pts</Text>
                <Text style={styles.tableMini}>
                  {submission.voteCount} votes / {submission.searchCount} searches / {submission.similarSubmissionCount} similar
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tableMuted}>{submission.submitted}</Text>
                <StatusBadge label={submission.status} warning />
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <View style={styles.submissionActions}>
                <Pressable
                  accessibilityLabel={`Approve ${submission.name}`}
                  accessibilityRole="button"
                  style={[styles.approveSubmissionButton, busy && styles.tableIconButtonDisabled]}
                  onPress={() => onApproveSubmission(submission)}
                  disabled={busy}
                >
                  {approving ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <>
                      <CheckCircle2 size={16} color={colors.white} />
                      <Text style={styles.approveSubmissionText}>Approve</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel={`Delete ${submission.name} submission`}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => onDeleteSubmission(submission)}
                  style={[styles.deleteSubmissionButton, busy && styles.tableIconButtonDisabled]}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color={adminPalette.error} />
                  ) : (
                    <Trash2 size={16} color={adminPalette.error} />
                  )}
                </Pressable>
                </View>
              </View>
            </View>
            {expanded && <><ExpandedSpotSubmission submission={submission} /><SubmissionPlaceLink submission={submission} client={client} /></>}
          </React.Fragment>
        );
      })}
      {!submissions.length && <EmptyState title="Nothing here yet" copy="No pending spot submissions need approval." compact />}
    </View>
    </ScrollView>
  );
}

type HistoricalRelationshipRow = {
  id: string;
  submission_id: string | null;
  local_update_id: string | null;
  reason: string;
  snapshot: Record<string, any>;
  created_at: string;
};

type RelationshipFilter = 'all' | 'authorship' | 'media' | 'listing' | 'post';

function getHistoricalRelationshipKind(reason: string): RelationshipFilter {
  if (reason === 'historical_author_mismatch') return 'authorship';
  if (reason === 'historical_grouped_media') return 'media';
  if (reason === 'approved_listing_link_unconfirmed') return 'listing';
  return 'post';
}

function getHistoricalRelationshipMeta(reason: string): { label: string; description: string; color: string; background: string; icon: LucideIcon } {
  if (reason === 'historical_author_mismatch') return {
    label: 'Authorship review',
    description: 'The submission author and community-post author do not match. Verify the source without moving reactions or comments.',
    color: '#8a5600',
    background: '#fff1ce',
    icon: User,
  };
  if (reason === 'historical_grouped_media') return {
    label: 'Media review',
    description: 'Historical media may have been combined across submissions. Confirm ownership before making any correction.',
    color: '#7c3aed',
    background: '#f1eafe',
    icon: FileText,
  };
  if (reason === 'approved_listing_link_unconfirmed') return {
    label: 'Listing link',
    description: 'This approved post still needs a confirmed relationship to an existing public map listing.',
    color: adminPalette.primary,
    background: adminPalette.primary + '18',
    icon: MapPin,
  };
  return {
    label: 'Missing post',
    description: 'No independent community post was found for this submission. Review the restored source record and its identifiers.',
    color: adminPalette.error,
    background: adminPalette.errorContainer + '24',
    icon: TriangleAlert,
  };
}

function HistoricalEvidenceItem({ label, value }: { label: string; value: string }) {
  return <View style={styles.relationshipEvidenceItem}>
    <Text style={styles.relationshipEvidenceLabel}>{label}</Text>
    <Text style={styles.relationshipEvidenceValue} numberOfLines={2}>{value}</Text>
  </View>;
}

function HistoricalSpotPostAudit({ client }: { client: SupabaseClient }) {
  const PAGE_SIZE = 20;
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [rows, setRows] = useState<HistoricalRelationshipRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RelationshipFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadPage = useCallback(async (start: number, replace: boolean) => {
    setBusy(true);
    setError('');
    const result = await client.from('spot_post_relationship_audit')
      .select('id,submission_id,local_update_id,reason,snapshot,created_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .order('id')
      .range(start, start + PAGE_SIZE - 1);
    if (result.error) {
      setError(result.error.message);
    } else {
      const nextRows = (result.data ?? []) as HistoricalRelationshipRow[];
      setRows(current => replace ? nextRows : [...current, ...nextRows.filter(next => !current.some(row => row.id === next.id))]);
      setOffset(start + nextRows.length);
      setMore(nextRows.length === PAGE_SIZE);
    }
    setBusy(false);
  }, [client]);

  useEffect(() => {
    setRows([]);
    setOffset(0);
    setExpandedId(null);
    void loadPage(0, true);
  }, [loadPage]);

  const filters: Array<{ id: RelationshipFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'authorship', label: 'Authorship' },
    { id: 'media', label: 'Media' },
    { id: 'listing', label: 'Listing links' },
    { id: 'post', label: 'Missing posts' },
  ];
  const filteredRows = rows.filter((row) => {
    const submission = row.snapshot?.submission ?? row.snapshot ?? {};
    const post = row.snapshot?.post ?? {};
    const name = submission.name ?? post.title ?? 'Historical post';
    const matchesFilter = filter === 'all' || getHistoricalRelationshipKind(row.reason) === filter;
    const needle = query.trim().toLowerCase();
    const matchesSearch = !needle || [name, submission.address, row.reason, row.submission_id, row.local_update_id]
      .some(value => String(value ?? '').toLowerCase().includes(needle));
    return matchesFilter && matchesSearch;
  });
  const filterCount = (id: RelationshipFilter) => id === 'all'
    ? rows.length
    : rows.filter(row => getHistoricalRelationshipKind(row.reason) === id).length;

  return <DataPanel
    title="Historical post relationships"
    right={<View style={styles.relationshipOpenBadge}>
      <TriangleAlert size={14} color={adminPalette.primary} />
      <Text style={styles.relationshipOpenBadgeText}>{rows.length}{more ? '+' : ''} open</Text>
    </View>}
  >
    <View style={styles.relationshipIntro}>
      <View style={styles.relationshipIntroIcon}><GitBranch size={22} color={adminPalette.primary} /></View>
      <View style={styles.relationshipIntroCopy}>
        <Text style={styles.relationshipIntroTitle}>Review history without rewriting it</Text>
        <Text style={styles.relationshipIntroText}>
          These records flag uncertain authorship, combined media, missing posts, or unconfirmed map links. Original posts, reactions, and comments stay in place while you verify the relationship.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh historical relationships"
        disabled={busy}
        onPress={() => void loadPage(0, true)}
        style={({ pressed }) => [styles.relationshipRefreshButton, pressed && styles.submissionSpotButtonPressed, busy && styles.tableIconButtonDisabled]}
      >
        <RefreshCw size={15} color={adminPalette.primary} />
        <Text style={styles.relationshipRefreshText}>Refresh</Text>
      </Pressable>
    </View>

    <View style={styles.relationshipToolbar}>
      <View style={[styles.relationshipSearch, compact && styles.relationshipSearchCompact]}>
        <Search size={16} color={adminPalette.outline} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search post, address, or ID"
          placeholderTextColor={adminPalette.outline}
          accessibilityLabel="Search historical relationships"
          style={styles.relationshipSearchInput}
        />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear historical relationship search" onPress={() => setQuery('')}>
          <X size={15} color={adminPalette.outline} />
        </Pressable>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relationshipFilters}>
        {filters.map(item => {
          const selected = filter === item.id;
          return <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => setFilter(item.id)}
            style={[styles.relationshipFilter, selected && styles.relationshipFilterActive]}
          >
            <Text style={[styles.relationshipFilterText, selected && styles.relationshipFilterTextActive]}>{item.label}</Text>
            <View style={[styles.relationshipFilterCount, selected && styles.relationshipFilterCountActive]}>
              <Text style={[styles.relationshipFilterCountText, selected && styles.relationshipFilterCountTextActive]}>{filterCount(item.id)}</Text>
            </View>
          </Pressable>;
        })}
      </ScrollView>
    </View>

    <View style={styles.relationshipList}>
      {busy && !rows.length ? <View style={styles.relationshipLoading}>
        <ActivityIndicator color={adminPalette.primary} />
        <Text style={styles.relationshipLoadingText}>Loading relationship history…</Text>
      </View> : filteredRows.map(row => {
        const submission = row.snapshot?.submission ?? row.snapshot ?? {};
        const post = row.snapshot?.post ?? {};
        const name = submission.name ?? post.title ?? 'Historical post';
        const expanded = expandedId === row.id;
        const kind = getHistoricalRelationshipKind(row.reason);
        const meta = getHistoricalRelationshipMeta(row.reason);
        const mediaCount = Array.isArray(post.media_urls) ? post.media_urls.length : Array.isArray(submission.images) ? submission.images.length : 0;
        const submissionStatus = String(submission.status ?? '').toLowerCase();
        return <View key={row.id} style={[styles.relationshipCard, expanded && styles.relationshipCardExpanded]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? 'Close' : 'Review'} ${name} historical relationship`}
            accessibilityState={{ expanded }}
            onPress={() => setExpandedId(current => current === row.id ? null : row.id)}
            style={({ pressed }) => [styles.relationshipCardButton, compact && styles.relationshipCardButtonCompact, pressed && styles.submissionSpotButtonPressed]}
          >
            <View style={[styles.relationshipReasonIcon, { backgroundColor: meta.background }]}>
              <meta.icon size={18} color={meta.color} />
            </View>
            <View style={styles.relationshipCardCopy}>
              <View style={styles.relationshipTitleRow}>
                <Text style={styles.relationshipCardTitle} numberOfLines={compact ? 2 : 1}>{name}</Text>
                <View style={[styles.relationshipReasonBadge, { backgroundColor: meta.background }]}>
                  <Text style={[styles.relationshipReasonBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              <Text style={styles.relationshipCardDescription} numberOfLines={expanded ? undefined : 2}>{meta.description}</Text>
              <View style={styles.relationshipMetaRow}>
                <Text style={styles.relationshipMetaText}>Flagged {formatLastUpdated(row.created_at)}</Text>
                {!!submissionStatus && <Text style={styles.relationshipMetaText}>Post {submissionStatus}</Text>}
                {!!mediaCount && <Text style={styles.relationshipMetaText}>{mediaCount} media file{mediaCount === 1 ? '' : 's'}</Text>}
                <Text style={styles.relationshipMetaText}>{row.submission_id ? 'Submission linked' : 'No submission link'}</Text>
              </View>
            </View>
            <View style={styles.relationshipReviewAction}>
              <Text style={styles.relationshipReviewText}>{expanded ? 'Close' : 'Review'}</Text>
              {expanded ? <ChevronUp size={17} color={adminPalette.primary} /> : <ChevronDown size={17} color={adminPalette.primary} />}
            </View>
          </Pressable>
          {expanded && <View style={styles.relationshipEvidence}>
            <View style={styles.relationshipEvidenceHeader}>
              <View>
                <Text style={styles.relationshipEvidenceEyebrow}>Recorded evidence</Text>
                <Text style={styles.relationshipEvidenceTitle}>Compare before linking</Text>
              </View>
              <View style={styles.relationshipEvidenceSafety}>
                <ShieldCheck size={14} color={adminPalette.success} />
                <Text style={styles.relationshipEvidenceSafetyText}>No automatic attribution</Text>
              </View>
            </View>
            <View style={styles.relationshipEvidenceGrid}>
              <HistoricalEvidenceItem label="Submission" value={row.submission_id ?? 'Not available'} />
              <HistoricalEvidenceItem label="Community post" value={row.local_update_id ?? 'Not available'} />
              <HistoricalEvidenceItem label="Address" value={submission.address ?? post.location_name ?? 'Not recorded'} />
              <HistoricalEvidenceItem label="Review type" value={meta.label} />
            </View>
            {(kind === 'authorship' || kind === 'media') && <View style={styles.relationshipCaution}>
              <TriangleAlert size={15} color="#8a5600" />
              <Text style={styles.relationshipCautionText}>A map link does not resolve authorship or media ownership. Keep historical interactions unchanged unless you have independent evidence.</Text>
            </View>}
            {row.submission_id ? <SubmissionPlaceLink
              submission={{ id: row.submission_id, name }}
              client={client}
              embedded
              allowDistinct={submissionStatus === 'pending'}
            /> : <Text style={styles.relationshipUnavailable}>This record has no source submission to link. Use the evidence IDs above for investigation.</Text>}
          </View>}
        </View>;
      })}
      {!busy && !error && !filteredRows.length && <EmptyState
        title={rows.length ? 'No matching relationships' : 'Relationship history is clear'}
        copy={rows.length ? 'Try another search or review type.' : 'No unresolved historical post relationships need review.'}
        compact
      />}
      {!!error && <View style={styles.relationshipError}>
        <TriangleAlert size={17} color={adminPalette.error} />
        <View style={styles.relationshipErrorCopy}>
          <Text accessibilityRole="alert" style={styles.relationshipErrorTitle}>Could not load relationship history</Text>
          <Text style={styles.relationshipErrorText}>{error}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void loadPage(0, true)}><Text style={styles.tablePrimary}>Retry</Text></Pressable>
      </View>}
    </View>

    {!!rows.length && <View style={styles.relationshipFooter}>
      <Text style={styles.relationshipFooterText}>Showing {filteredRows.length} of {rows.length}{more ? '+' : ''} loaded records</Text>
      {more && <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void loadPage(offset, false)}
        style={[styles.relationshipLoadMore, busy && styles.tableIconButtonDisabled]}
      >
        {busy && <ActivityIndicator size="small" color={adminPalette.primary} />}
        <Text style={styles.relationshipLoadMoreText}>{busy ? 'Loading…' : 'Load more'}</Text>
        {!busy && <ChevronDown size={15} color={adminPalette.primary} />}
      </Pressable>}
    </View>}
  </DataPanel>;
}

function SubmissionPlaceLink({
  submission,
  client,
  embedded = false,
  allowDistinct = true,
}: {
  submission: Pick<AdminSpotSubmissionRow, 'id' | 'name'>;
  client: SupabaseClient;
  embedded?: boolean;
  allowDistinct?: boolean;
}) {
  const [query, setQuery] = useState(submission.name);
  const [spots, setSpots] = useState<Array<{ id: string; name: string; address: string }>>([]);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    client.from('spot_submissions').select('spot_id,different_place').eq('id', submission.id).single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setNotice(error.message); return; }
        setLinkedId(data.spot_id);
        if (data.spot_id) setNotice(`Linked to listing ${data.spot_id}. Post approval remains separate.`);
        else if (data.different_place) setNotice('Marked as a different place.');
      });
    return () => { active = false; };
  }, [client, submission.id]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (query.trim().length < 2) { setSpots([]); return; }
      client.from('spots').select('id,name,address').eq('is_public', true)
        .ilike('name', `%${query.trim().replace(/[%_]/g, '')}%`).limit(12)
        .then(({ data, error }) => { if (active) { setSpots(data ?? []); if (error) setNotice(error.message); } });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [client, query]);
  async function link(spotId: string) {
    setBusy(true);
    try {
      await linkSpotSubmission(submission.id, spotId, client);
      setLinkedId(spotId);
      setNotice('Linked to existing spot. Post, reactions and comments preserved. Use Approve to review this post separately.');
    } catch (error: any) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  return <View style={[styles.submissionLinkPanel, embedded && styles.submissionLinkPanelEmbedded]}>
    <View style={styles.submissionLinkHeader}>
      <View style={styles.submissionLinkIcon}><MapPin size={16} color={adminPalette.primary} /></View>
      <View style={styles.submissionLinkHeaderCopy}>
        <Text style={styles.tableStrong}>Link to existing spot</Text>
        <Text style={styles.tableMini}>Check the name and address. Linking preserves the independent post and does not approve it.</Text>
      </View>
    </View>
    <View style={styles.submissionLinkSearch}>
      <Search size={15} color={adminPalette.outline} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search existing spot names"
        placeholderTextColor={adminPalette.outline}
        accessibilityLabel="Find existing spot"
        style={styles.submissionLinkInput}
      />
    </View>
    {!!query.trim() && query.trim().length < 2 && <Text style={styles.submissionLinkHint}>Enter at least 2 characters to search.</Text>}
    <View style={styles.submissionLinkResults}>
      {spots.map((spot) => <Pressable
        key={spot.id}
        disabled={busy}
        onPress={() => void link(spot.id)}
        style={({ pressed }) => [styles.submissionSpotButton, pressed && styles.submissionSpotButtonPressed]}
      >
        <View style={styles.submissionSpotCopy}>
          <Text style={styles.submissionLinkSpotName}>{linkedId === spot.id ? 'Linked · ' : ''}{spot.name}</Text>
          <Text style={styles.submissionLinkSpotAddress} numberOfLines={2}>{spot.address}</Text>
        </View>
        {linkedId === spot.id ? <CheckCircle2 size={18} color={adminPalette.success} /> : <ChevronRight size={18} color={adminPalette.primary} />}
      </Pressable>)}
    </View>
    {!linkedId && allowDistinct && <Pressable disabled={busy} style={({ pressed }) => [styles.submissionDistinctButton, pressed && styles.submissionSpotButtonPressed]} onPress={async () => {
      setBusy(true);
      try { await confirmDistinctSpotSubmission(submission.id, client); setNotice('Confirmed as a different place. It can now be reviewed for a new map listing.'); }
      catch (error: any) { setNotice(error.message); }
      finally { setBusy(false); }
    }}><Text style={styles.submissionDistinctText}>This is a different place</Text></Pressable>}
    {!!notice && <Text accessibilityRole="alert" style={styles.submissionLinkNotice}>{notice}</Text>}
  </View>;
}

function ExpandedSpotSubmission({ submission }: { submission: AdminSpotSubmissionRow }) {
  const images = submission.images.length ? submission.images : [submission.image];
  return (
    <View style={styles.expandedSubmission}>
      <View style={styles.submissionDetailHero}>
        <Image source={{ uri: images[0] }} style={styles.submissionHeroImage} />
        <View style={styles.submissionDetailCopy}>
          <View style={styles.submissionTitleRow}>
            <View style={styles.submissionTitleCopy}>
              <Text style={styles.microHeadingPrimary}>Submitted Spot</Text>
              <Text style={styles.submissionDetailTitle}>{submission.name}</Text>
            </View>
            <StatusBadge label={submission.status} warning />
          </View>
          <Text style={styles.submissionDescription}>
            {submission.description || 'No description was included with this spot submission.'}
          </Text>
          <View style={styles.submissionMetaGrid}>
            <SubmissionMeta label="Category" value={submission.category} />
            <SubmissionMeta label="Barangay" value={submission.barangay} />
            <SubmissionMeta label="Coordinates" value={`${submission.latitude.toFixed(5)}, ${submission.longitude.toFixed(5)}`} />
            <SubmissionMeta label="Reservation" value={submission.isReservable ? `Reservable / ${submission.reservationType ?? 'free'}` : 'Not reservable'} />
            <SubmissionMeta label="Fee" value={submission.paymentRequired ? formatAdminMoney(submission.reservationFee) : 'No payment required'} />
            <SubmissionMeta label="Submitted" value={submission.submitted} />
          </View>
        </View>
      </View>

      <View style={styles.submissionDetailGrid}>
        <View style={styles.submissionDetailBlock}>
          <Text style={styles.microHeadingPrimary}>Sender</Text>
          <View style={styles.senderCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{getSenderInitials(submission.submitterName, submission.submitterEmail)}</Text>
            </View>
            <View style={styles.senderCopy}>
              <Text style={styles.tableStrong}>{submission.submitterName}</Text>
              <Text style={styles.tableMini}>{submission.submitterEmail}</Text>
              <Text style={styles.senderIdText}>ID: {submission.submitterId || 'Unavailable'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.submissionDetailBlock}>
          <Text style={styles.microHeadingPrimary}>Address</Text>
          <View style={styles.addressCard}>
            <MapPin size={15} color={adminPalette.primary} />
            <Text style={styles.addressText}>{submission.address}</Text>
          </View>
        </View>

        <View style={styles.submissionDetailBlockWide}>
          <Text style={styles.microHeadingPrimary}>Submitted Photos</Text>
          <View style={styles.submissionImageGrid}>
            {images.map((image, index) => (
              <Image key={`${image}-${index}`} source={{ uri: image }} style={styles.submissionDetailImage} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function SubmissionMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.submissionMetaItem}>
      <Text style={styles.submissionMetaLabel}>{label}</Text>
      <Text style={styles.submissionMetaValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function getSenderInitials(name?: string | null, email?: string | null) {
  const source = (name && name !== 'Unknown sender' ? name : email) ?? 'Sender';
  return source
    .split(source.includes('@') ? '@' : /\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'S';
}

const reportFilters = ['All', ...REVIEW_REPORT_CATEGORIES, 'Spot edit suggestion'] as const;
type ReportFilter = (typeof reportFilters)[number];

const urgentReportTypes = new Set([
  'Frauds and scams',
  'Hate speech',
  'Harassment or bullying',
  'Pornography and nudity',
  'Illegal activities and regulated goods',
  'Child or minor safety',
]);

const warningReportTypes = new Set(['Inaccurate or misleading review', 'Spam', 'Spot edit suggestion']);

function ReportsSection({
  reports,
  query,
  moderatingReportId,
  onDismissReport,
  onApplyReport,
  onOpenSpot,
}: {
  reports: AdminReportRow[];
  query: string;
  moderatingReportId: string | null;
  onDismissReport: (report: AdminReportRow, notes: string) => void;
  onApplyReport: (report: AdminReportRow, notes: string) => void;
  onOpenSpot: (report: AdminReportRow) => void;
}) {
  const [selectedReportType, setSelectedReportType] = useState<ReportFilter>('All');
  const [activeReportId, setActiveReportId] = useState<string | null>(reports[0]?.id ?? null);
  const visibleReports = filterReports(
    selectedReportType === 'All' ? reports : reports.filter((report) => report.type === selectedReportType),
    query,
  );

  useEffect(() => {
    if (!visibleReports.length) {
      setActiveReportId(null);
      return;
    }
    if (!activeReportId || !visibleReports.some((report) => report.id === activeReportId)) {
      setActiveReportId(visibleReports[0].id);
    }
  }, [activeReportId, visibleReports]);

  return (
    <View>
      <PageIntro
        eyebrow="Moderation"
        title="Reports"
        subtitle="Issues submitted by users about spots, reviews, or content."
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.reportTabsScroller}
        contentContainerStyle={styles.reportTabs}
      >
        {reportFilters.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.reportTab, selectedReportType === tab && styles.reportTabActive]}
            onPress={() => setSelectedReportType(tab)}
          >
            <Text style={[styles.reportTabText, selectedReportType === tab && styles.reportTabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.reportPanel}>
        <View style={styles.reportHeader}>
          {['Type', 'Reported Spot', 'Reported By', 'Date Filed', 'Description', 'Actions'].map((label) => (
            <Text key={label} style={styles.reportHeading}>
              {label}
            </Text>
          ))}
        </View>
        {visibleReports.map((report) => (
          <View key={report.id}>
            <Pressable
              style={[styles.reportRow, activeReportId === report.id && styles.reportRowExpanded]}
              onPress={() => setActiveReportId((current) => (current === report.id ? null : report.id))}
            >
              <View style={styles.reportColumn}>
                <StatusBadge
                  label={report.type}
                  danger={urgentReportTypes.has(report.type)}
                  warning={warningReportTypes.has(report.type)}
                />
              </View>
              <View style={styles.reportColumn}>
                <Text style={styles.tableStrong}>{report.spot}</Text>
                <Text style={styles.tableMini}>{report.area}</Text>
              </View>
              <View style={styles.reportColumn}>
                <View style={styles.initialAvatarSmall}>
                  <Text style={styles.initialAvatarText}>{report.reporter}</Text>
                </View>
              </View>
              <View style={styles.reportColumn}>
                <Text style={styles.tableMuted}>{report.date}</Text>
              </View>
              <View style={[styles.reportColumn, styles.reportDescriptionColumn]}>
                <Text style={styles.tableMuted} numberOfLines={activeReportId === report.id ? 3 : 1}>
                  {report.description}
                </Text>
              </View>
              <View style={[styles.reportColumn, styles.reportActions]}>
                <Pressable
                  style={[styles.reviewButton, activeReportId === report.id && styles.reviewButtonActive]}
                  onPress={() => setActiveReportId((current) => (current === report.id ? null : report.id))}
                >
                  <Text style={styles.reviewButtonText}>{activeReportId === report.id ? 'Hide' : 'Review'}</Text>
                </Pressable>
                <Trash2Safe
                  onPress={() =>
                    Alert.alert(
                      'Dismiss this report?',
                      `This removes "${report.spot}" from the moderation queue with no resolution notes. This can't be undone.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Dismiss', style: 'destructive', onPress: () => onDismissReport(report, '') },
                      ],
                    )
                  }
                  disabled={moderatingReportId === report.id}
                />
              </View>
            </Pressable>
            {activeReportId === report.id && (
              <ExpandedReport
                report={report}
                busy={moderatingReportId === report.id}
                onDismiss={onDismissReport}
                onApply={onApplyReport}
                onOpenSpot={onOpenSpot}
              />
            )}
          </View>
        ))}
        {!visibleReports.length && <EmptyState title="No reports found" copy="There are no matching reports in the moderation queue." compact />}
        <Pagination copy={`Showing ${visibleReports.length} of ${reports.length} reports`} />
      </View>
    </View>
  );
}

function Trash2Safe({ onPress, disabled }: { onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.tableIconButton, disabled && styles.tableIconButtonDisabled]} onPress={onPress} disabled={disabled}>
      {disabled ? <ActivityIndicator color={adminPalette.error} /> : <XCircle size={17} color={adminPalette.error} />}
    </Pressable>
  );
}

function formatCoordinateLabel(coordinate?: { latitude: number; longitude: number } | null) {
  if (!coordinate) return 'No pin data';
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function ExpandedReport({
  report,
  busy,
  onDismiss,
  onApply,
  onOpenSpot,
}: {
  report: AdminReportRow;
  busy: boolean;
  onDismiss: (report: AdminReportRow, notes: string) => void;
  onApply: (report: AdminReportRow, notes: string) => void;
  onOpenSpot: (report: AdminReportRow) => void;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [adminNotes, setAdminNotes] = useState('');
  const isSuggestion = report.source === 'spot_edit_suggestion';
  const hasPinEvidence = Boolean(report.currentCoordinate && report.suggestedCoordinate);
  const evidenceMarkers = hasPinEvidence
    ? [
        {
          id: 'current-pin',
          latitude: report.currentCoordinate!.latitude,
          longitude: report.currentCoordinate!.longitude,
          label: 'Current',
          color: adminPalette.outline,
          variant: 'circle' as const,
          selected: false,
        },
        {
          id: 'suggested-pin',
          latitude: report.suggestedCoordinate!.latitude,
          longitude: report.suggestedCoordinate!.longitude,
          label: 'Suggested',
          color: adminPalette.primary,
          variant: 'pin' as const,
          selected: true,
        },
      ]
    : [];
  const evidenceCenter = report.suggestedCoordinate ?? report.currentCoordinate;
  const canApply = isSuggestion;

  return (
    <View style={styles.expandedReport}>
      <View style={styles.expandedReportTop}>
        <View style={styles.notesColumn}>
          <Text style={styles.microHeading}>Detailed Report</Text>
          <Text style={styles.reportQuote}>{report.description}</Text>
          {report.note && <Text style={styles.reportDetailLine}>Reporter note: {report.note}</Text>}
        </View>
        <Pressable style={styles.spotDetailsButton} onPress={() => onOpenSpot(report)}>
          <MapPin size={15} color={adminPalette.primary} />
          <Text style={styles.spotDetailsButtonText}>Spot Details</Text>
        </Pressable>
      </View>

      <Pressable style={styles.evidenceToggle} onPress={() => setEvidenceOpen((value) => !value)}>
        <Text style={styles.microHeading}>Attached Evidence</Text>
        <ChevronUp
          size={16}
          color={adminPalette.outline}
          style={{ transform: [{ rotate: evidenceOpen ? '0deg' : '180deg' }] }}
        />
      </Pressable>

      {evidenceOpen && (
        <View style={styles.expandedReportBody}>
          {hasPinEvidence && evidenceCenter ? (
            <View style={styles.pinEvidenceColumn}>
              <View style={styles.pinEvidenceMap}>
                <TileMap center={evidenceCenter} zoom={16} markers={evidenceMarkers} style={styles.pinEvidenceTileMap} />
              </View>
              <View style={styles.pinComparisonRow}>
                <View style={styles.pinComparisonBox}>
                  <Text style={styles.microHeading}>Before</Text>
                  <Text style={styles.pinComparisonText}>{formatCoordinateLabel(report.currentCoordinate)}</Text>
                </View>
                <View style={styles.pinComparisonBox}>
                  <Text style={styles.microHeading}>After</Text>
                  <Text style={styles.pinComparisonText}>{formatCoordinateLabel(report.suggestedCoordinate)}</Text>
                </View>
              </View>
            </View>
          ) : report.reviewComment ? (
            <View style={styles.reviewEvidenceBox}>
              <Text style={styles.microHeading}>Flagged Review</Text>
              <View style={styles.flaggedReviewHeader}>
                <View style={styles.initialAvatarSmall}>
                  <Text style={styles.initialAvatarText}>{(report.reviewAuthor ?? report.reporter ?? 'AN').slice(0, 2).toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.tableStrong}>{report.reviewAuthor ?? 'CebSpot user'}</Text>
                  <Text style={styles.tableMini}>
                    {report.reviewRating ? `${report.reviewRating}/5 stars` : 'Rating unavailable'} - {report.reviewDate ?? report.date}
                  </Text>
                </View>
              </View>
              <Text style={styles.reportQuote}>{report.reviewComment}</Text>
              {!!report.reviewMediaUrls?.length && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewEvidenceMedia}>
                  {report.reviewMediaUrls.map((uri) => (
                    <Image key={uri} source={{ uri }} style={styles.evidenceImage} />
                  ))}
                </ScrollView>
              )}
              {!!report.reviewThread?.length && (
                <View style={styles.commentThreadBox}>
                  <Text style={styles.microHeading}>Comment Section</Text>
                  {report.reviewThread.map((review) => (
                    <View key={review.id} style={[styles.commentThreadItem, review.flagged && styles.commentThreadFlagged]}>
                      <View style={styles.commentThreadMeta}>
                        <Text style={styles.tableStrong}>{review.author}</Text>
                        <Text style={styles.tableMini}>
                          {review.rating ? `${review.rating}/5` : 'No rating'} - {review.date}
                        </Text>
                      </View>
                      <Text style={styles.tableMuted}>{review.comment || 'No written comment.'}</Text>
                      {review.flagged && <Text style={styles.flaggedLabel}>Reported review</Text>}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.reviewEvidenceBox}>
              <Text style={styles.tableMuted}>No media was attached. Use the report details and spot context to decide.</Text>
            </View>
          )}
          <View style={styles.notesColumn}>
            <Text style={styles.microHeading}>Admin Notes</Text>
            <TextInput
              multiline
              value={adminNotes}
              onChangeText={setAdminNotes}
              placeholder="Enter resolution notes..."
              placeholderTextColor={adminPalette.outline}
              style={styles.notesInput}
            />
          </View>
        </View>
      )}

      <View style={styles.expandedActions}>
        <Pressable style={[styles.ghostButton, busy && styles.tableIconButtonDisabled]} onPress={() => onDismiss(report, adminNotes)} disabled={busy}>
          <Text style={styles.ghostButtonText}>{busy ? 'Working...' : 'Dismiss Report'}</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, busy && styles.tableIconButtonDisabled]}
          onPress={() => (canApply ? onApply(report, adminNotes) : onDismiss(report, adminNotes || 'Review handled by admin.'))}
          disabled={busy}
        >
          <Text style={styles.primaryButtonText}>
            {canApply ? 'Update Spot Details' : 'Tag Review Handled'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const userRoleFilters = ['All', 'Spotter', 'Owner'] as const;
const usersPerPage = 7;
type UserRoleFilter = (typeof userRoleFilters)[number];
// 'Spotter' in the UI maps to the 'user' role value stored on the record.
const userRoleFilterValue: Record<Exclude<UserRoleFilter, 'All'>, string> = { Spotter: 'user', Owner: 'owner' };

function UsersSection({
  dashboard,
  query,
  onClearQuery,
}: {
  dashboard: AdminDashboardData;
  query: string;
  onClearQuery: () => void;
}) {
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>('All');
  const [currentPage, setCurrentPage] = useState(0);
  const filteredUsers = filterUsers(dashboard.users, query).filter(
    (user) => roleFilter === 'All' || user.role.toLowerCase() === userRoleFilterValue[roleFilter],
  );
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / usersPerPage));
  const safePage = Math.min(currentPage, pageCount - 1);
  const pageStart = safePage * usersPerPage;
  const visibleUsers = filteredUsers.slice(pageStart, pageStart + usersPerPage);
  const pageEnd = pageStart + visibleUsers.length;
  const ownerCount = dashboard.users.filter((user) => user.role.toLowerCase() === 'owner').length;
  const spotterCount = dashboard.users.filter((user) => user.role.toLowerCase() === 'user').length;

  useEffect(() => {
    setCurrentPage(0);
  }, [query, roleFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount - 1));
  }, [pageCount]);
  return (
    <View>
      <PageIntro
        eyebrow="People"
        title="Users"
        subtitle="Profiles registered in CebSpot."
        right={
          <Pressable
            style={styles.addUserButton}
            onPress={() => Alert.alert('Coming soon', "Manually adding a user isn't wired up yet.")}
          >
            <Plus size={19} color={colors.white} />
            <Text style={styles.addUserText}>Add User</Text>
          </Pressable>
        }
      />

      <View style={styles.filterBar}>
        <View style={styles.filterPillRow}>
          {userRoleFilters.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: item === roleFilter }}
              onPress={() => {
                setRoleFilter(item);
                if (item === 'All') onClearQuery();
              }}
              style={[styles.filterPill, item === roleFilter && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, item === roleFilter && styles.filterPillTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.filterSummary}>
          <Text style={styles.filterSummaryStrong}>{filteredUsers.length}</Text> matching - <Text style={styles.filterSummaryPrimary}>{spotterCount}</Text> spotters -{' '}
          <Text style={styles.filterSummaryPrimary}>{ownerCount}</Text> owners
        </Text>
      </View>

      <DataPanel>
        <DataTable
          columns={[
            {
              key: 'name',
              label: 'Name',
              flex: 1.6,
              render: (item) => (
                <View style={styles.userCell}>
                  <View style={styles.userAvatar}>
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.userAvatarImage} />
                    ) : (
                      <Text style={styles.userAvatarText}>{item.avatar}</Text>
                    )}
                  </View>
                  <View>
                    <Text style={styles.tableStrong}>{item.name}</Text>
                    <Text style={styles.tableMini}>{item.email}</Text>
                  </View>
                </View>
              ),
            },
            { key: 'role', label: 'Role', render: (item) => <StatusBadge label={item.role} /> },
            {
              key: 'location',
              label: 'Location',
              flex: 1.5,
              render: (item) => (
                <View style={styles.locationCell}>
                  <MapPin size={12} color={adminPalette.primary} />
                  <Text style={styles.tableMuted}>{item.location}</Text>
                </View>
              ),
            },
            { key: 'joined', label: 'Joined Date', render: (item) => <Text style={styles.tableMuted}>{item.joined}</Text> },
            {
              key: 'actions',
              label: 'Actions',
              align: 'right',
              render: (item) => (
                <View style={styles.inlineActions}>
                  <Pressable
                    style={styles.tableIconButton}
                    onPress={() => Alert.alert('Coming soon', `Editing ${item.name} isn't wired up yet.`)}
                  >
                    <Edit3 size={16} color={adminPalette.primary} />
                  </Pressable>
                  <Pressable
                    style={styles.tableIconButton}
                    onPress={() =>
                      Alert.alert('Coming soon', `Removing ${item.name} isn't wired up yet.`)
                    }
                  >
                    <XCircle size={17} color={adminPalette.error} />
                  </Pressable>
                </View>
              ),
            },
          ]}
          data={visibleUsers}
          emptyCopy="No users match this search."
        />
        <Pagination
          copy={
            filteredUsers.length
              ? `Showing ${pageStart + 1}-${pageEnd} of ${filteredUsers.length} users`
              : 'Showing 0 of 0 users'
          }
          previousDisabled={safePage === 0}
          nextDisabled={safePage >= pageCount - 1}
          onPrevious={() => setCurrentPage((page) => Math.max(0, page - 1))}
          onNext={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))}
        />
      </DataPanel>
    </View>
  );
}

function OwnerRequestsSection({
  dashboard,
  client,
  query,
  reviewingRequestId,
  deletingRequestId,
  onReviewRequest,
  onDeleteRequest,
}: {
  dashboard: AdminDashboardData;
  client: SupabaseClient;
  query: string;
  reviewingRequestId: string | null;
  deletingRequestId: string | null;
  onReviewRequest: (request: AdminOwnerRequestRow, decision: AdminOwnerRequestDecision, notes: string) => Promise<boolean>;
  onDeleteRequest: (request: AdminOwnerRequestRow) => void;
}) {
  const requestFilters = ['All', 'Pending', 'Approved', 'Rejected'] as const;
  const initialExpandedId = dashboard.ownerRequests.find((request) => request.expanded)?.id ?? null;
  const [statusFilter, setStatusFilter] = useState<(typeof requestFilters)[number]>('All');
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(initialExpandedId);
  const [decisionPrompt, setDecisionPrompt] = useState<{
    request: AdminOwnerRequestRow;
    decision: AdminOwnerRequestDecision;
    notes: string;
  } | null>(null);
  const visibleRequests = filterOwnerRequests(dashboard.ownerRequests, query).filter(
    (request) => statusFilter === 'All' || request.status.toLowerCase() === statusFilter.toLowerCase(),
  );

  useEffect(() => {
    if (expandedRequestId && !dashboard.ownerRequests.some((request) => request.id === expandedRequestId)) {
      setExpandedRequestId(null);
    }
  }, [dashboard.ownerRequests, expandedRequestId]);

  function confirmDecision(request: AdminOwnerRequestRow, decision: AdminOwnerRequestDecision, notes = '') {
    setDecisionPrompt({ request, decision, notes });
  }

  return (
    <View>
      <PageIntro
        eyebrow="People & Access"
        title="Owner Requests"
        subtitle="Review owner applications and verification documents manually before granting access."
      />

      <View style={styles.requestToolbar}>
        <View style={styles.filterPillRow}>
          {requestFilters.map((item) => (
            <Pressable
              key={item}
              onPress={() => setStatusFilter(item)}
              style={[styles.requestPill, item === statusFilter && styles.requestPillActive]}
            >
              <Text style={[styles.requestPillText, item === statusFilter && styles.requestPillTextActive]}>{item}</Text>
              {item === 'Pending' && (
                <View style={styles.pendingCount}>
                  <Text style={styles.pendingCountText}>{dashboard.metrics.pendingOwnerRequests}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
        <Text style={styles.filterSummary}>{visibleRequests.length} matching requests</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableScrollContainer}>
      <View style={[styles.requestsTable, styles.ownerRequestsScrollContent]}>
        <View style={styles.requestHeader}>
          {['Applicant', 'Spot Name', 'Category', 'Barangay', 'Applied', 'Actions'].map((label) => (
            <Text key={label} style={styles.requestHeading}>
              {label}
            </Text>
          ))}
        </View>
        {visibleRequests.map((request) => {
          const expanded = expandedRequestId === request.id;
          const pending = request.status.toLowerCase() === 'pending';
          const reviewing = reviewingRequestId === request.id;
          const deleting = deletingRequestId === request.id;
          const busy = reviewing || deleting;
          return (
          <View key={request.id}>
            <View style={[styles.requestRow, expanded && styles.requestRowExpanded]}>
              <View style={styles.requestColumn}>
                <View style={styles.userCell}>
                  <View style={styles.requestAvatar}>
                    <Text style={styles.requestAvatarText}>{request.initials}</Text>
                  </View>
                  <View>
                    <Text style={styles.tableStrong}>{request.applicant}</Text>
                    <Text style={styles.tableMini}>{request.email}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.requestColumn}>
                <Text style={styles.tableStrong}>{request.spot}</Text>
              </View>
              <View style={styles.requestColumn}>
                <StatusBadge label={request.category} />
              </View>
              <View style={styles.requestColumn}>
                <Text style={styles.tableMuted}>{request.barangay}</Text>
              </View>
              <View style={styles.requestColumn}>
                <Text style={styles.tableMuted}>{request.applied}</Text>
              </View>
              <View style={[styles.requestColumn, styles.requestActions]}>
                {pending ? (
                  <>
                    <Pressable
                      accessibilityLabel={`Approve ${request.applicant}'s owner request`}
                      disabled={busy}
                      onPress={() => confirmDecision(request, 'approved', request.adminNotes ?? '')}
                      style={[styles.requestIconAction, busy && styles.ownerActionDisabled]}
                    >
                      {reviewing ? <ActivityIndicator size="small" color="#16a34a" /> : <CheckCircle2 size={18} color="#16a34a" />}
                    </Pressable>
                    <Pressable
                      accessibilityLabel={expanded ? 'Collapse owner request' : 'View owner request details'}
                      onPress={() => setExpandedRequestId(expanded ? null : request.id)}
                      style={[styles.requestIconAction, expanded && styles.collapseAction]}
                    >
                      {expanded ? <ChevronUp size={18} color={colors.white} /> : <Mail size={18} color="#2563eb" />}
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Reject ${request.applicant}'s owner request`}
                      disabled={busy}
                      onPress={() => confirmDecision(request, 'rejected', request.adminNotes ?? '')}
                      style={[styles.requestIconAction, busy && styles.ownerActionDisabled]}
                    >
                      <XCircle size={18} color={adminPalette.error} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Delete ${request.applicant}'s owner request`}
                      disabled={busy}
                      onPress={() => onDeleteRequest(request)}
                      style={[styles.requestIconAction, busy && styles.ownerActionDisabled]}
                    >
                      {deleting ? <ActivityIndicator size="small" color={adminPalette.error} /> : <Trash2 size={17} color={adminPalette.error} />}
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      accessibilityLabel={expanded ? 'Collapse owner request' : 'View owner request details'}
                      disabled={deleting}
                      onPress={() => setExpandedRequestId(expanded ? null : request.id)}
                      style={styles.reviewedRequestAction}
                    >
                      <StatusBadge label={request.status} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Delete ${request.applicant}'s owner request`}
                      disabled={deleting}
                      onPress={() => onDeleteRequest(request)}
                      style={[styles.requestIconAction, deleting && styles.ownerActionDisabled]}
                    >
                      {deleting ? <ActivityIndicator size="small" color={adminPalette.error} /> : <Trash2 size={17} color={adminPalette.error} />}
                    </Pressable>
                  </>
                )}
              </View>
            </View>
            {expanded && (
              <ExpandedOwnerRequest
                client={client}
                request={request}
                reviewing={busy}
                onApprove={(notes) => confirmDecision(request, 'approved', notes)}
                onReject={(notes) => confirmDecision(request, 'rejected', notes)}
              />
            )}
          </View>
          );
        })}
        {!visibleRequests.length && <EmptyState title="No owner requests found" copy="There are no matching access requests." compact />}
        <Pagination copy={`Showing ${visibleRequests.length} of ${dashboard.ownerRequests.length} requests`} />
      </View>
      </ScrollView>

      <View style={styles.bottomBento}>
        <View style={styles.velocityCard}>
          <Text style={styles.microHeadingPrimary}>Request Velocity</Text>
          <BarChart values={requestBars} activeIndex={4} compact />
          <View style={styles.velocityFooter}>
            <View>
              <Text style={styles.velocityValue}>+24%</Text>
              <Text style={styles.velocityLabel}>Growth vs last week</Text>
            </View>
            <View style={styles.velocityIcon}>
              <TrendingUp size={21} color={adminPalette.success} />
            </View>
          </View>
        </View>
      </View>

      <OwnerRequestDecisionModal
        prompt={decisionPrompt}
        reviewing={Boolean(decisionPrompt && reviewingRequestId === decisionPrompt.request.id)}
        onChangeNotes={(notes) => setDecisionPrompt((current) => current ? { ...current, notes } : current)}
        onCancel={() => setDecisionPrompt(null)}
        onConfirm={() => {
          if (!decisionPrompt) return;
          const { request, decision, notes } = decisionPrompt;
          void onReviewRequest(request, decision, notes).then((completed) => {
            if (completed) setDecisionPrompt(null);
          });
        }}
      />
    </View>
  );
}

function OwnerRequestDecisionModal({
  prompt,
  reviewing,
  onChangeNotes,
  onCancel,
  onConfirm,
}: {
  prompt: { request: AdminOwnerRequestRow; decision: AdminOwnerRequestDecision; notes: string } | null;
  reviewing: boolean;
  onChangeNotes: (notes: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const approving = prompt?.decision === 'approved';
  const rejectionNeedsReason = !approving && !prompt?.notes.trim();

  return (
    <Modal animationType="fade" transparent visible={Boolean(prompt)} onRequestClose={onCancel}>
      <View style={styles.ownerDecisionBackdrop}>
        <Pressable accessibilityLabel="Close owner request confirmation" onPress={onCancel} style={styles.ownerDecisionScrim} />
        {prompt && (
          <View style={styles.ownerDecisionModal}>
            <View style={styles.ownerDecisionHeader}>
              <View style={[styles.ownerDecisionIcon, approving ? styles.ownerDecisionIconApprove : styles.ownerDecisionIconReject]}>
                {approving ? (
                  <CheckCircle2 size={24} color={adminPalette.success} />
                ) : (
                  <XCircle size={24} color={adminPalette.error} />
                )}
              </View>
              <View style={styles.ownerDecisionHeadingCopy}>
                <Text style={styles.ownerDecisionEyebrow}>Owner Access</Text>
                <Text style={styles.ownerDecisionTitle}>{approving ? 'Approve request?' : 'Reject request?'}</Text>
              </View>
              <Pressable accessibilityLabel="Close confirmation" onPress={onCancel} style={styles.ownerDecisionClose}>
                <XCircle size={20} color={adminPalette.onSurfaceVariant} />
              </Pressable>
            </View>

            <Text style={styles.ownerDecisionCopy}>
              {approving
                ? `${prompt.request.applicant} will become an owner and receive management access to the matching CebSpot listing.`
                : `${prompt.request.applicant} will not receive owner access to this spot.`}
            </Text>

            <View style={styles.ownerDecisionSpot}>
              <MapPin size={17} color={adminPalette.primary} />
              <View style={styles.ownerDecisionSpotCopy}>
                <Text style={styles.ownerDecisionSpotName}>{prompt.request.spot}</Text>
                <Text style={styles.ownerDecisionSpotAddress}>{prompt.request.fullAddress}</Text>
              </View>
            </View>

            <Text style={styles.ownerDecisionNotesLabel}>{approving ? 'Internal notes (optional)' : 'Rejection reason (required)'}</Text>
            <TextInput
              multiline
              editable={!reviewing}
              value={prompt.notes}
              onChangeText={onChangeNotes}
              placeholder={approving ? 'Add verification notes...' : 'Explain why this request was rejected...'}
              placeholderTextColor={adminPalette.outline}
              style={styles.ownerDecisionNotes}
            />
            {rejectionNeedsReason && <Text style={styles.ownerDecisionValidation}>Add a reason before rejecting this request.</Text>}

            <View style={styles.ownerDecisionActions}>
              <Pressable disabled={reviewing} onPress={onCancel} style={styles.ownerDecisionCancel}>
                <Text style={styles.ownerDecisionCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={reviewing || rejectionNeedsReason}
                onPress={onConfirm}
                style={[
                  styles.ownerDecisionConfirm,
                  approving ? styles.ownerDecisionConfirmApprove : styles.ownerDecisionConfirmReject,
                  (reviewing || rejectionNeedsReason) && styles.ownerActionDisabled,
                ]}
              >
                {reviewing ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.ownerDecisionConfirmText}>{approving ? 'Approve Access' : 'Reject Request'}</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

function ExpandedOwnerRequest({
  client,
  request,
  reviewing,
  onApprove,
  onReject,
}: {
  client: SupabaseClient;
  request: AdminOwnerRequestRow;
  reviewing: boolean;
  onApprove: (notes: string) => void;
  onReject: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(request.adminNotes ?? '');
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);
  const pending = request.status.toLowerCase() === 'pending';

  useEffect(() => {
    setNotes(request.adminNotes ?? '');
  }, [request.adminNotes, request.id]);

  async function openDocument(path: string) {
    try {
      setOpeningDocument(path);
      const url = await ownerVerificationDocumentService.getSignedUrl(path, client);
      await Linking.openURL(url);
    } catch (error: any) {
      Alert.alert('Unable to open document', error.message ?? 'Please try again.');
    } finally {
      setOpeningDocument(null);
    }
  }

  return (
    <View style={styles.expandedRequest}>
      <View style={styles.expandedRequestColumn}>
        <Text style={styles.microHeadingPrimary}>Application Message</Text>
        <View style={styles.messageCard}>
          <Text style={styles.messageText}>
            {request.message || 'No application message was submitted.'}
          </Text>
        </View>
      </View>
      <View style={styles.expandedRequestColumn}>
        <Text style={styles.microHeadingPrimary}>Applicant Details</Text>
        <View style={styles.ownerDetailGroup}>
          <Text style={styles.ownerDetailLabel}>Contact</Text>
          <Text style={styles.ownerDetailValue}>{request.email}</Text>
          <Text style={styles.ownerDetailValue}>{request.phone || 'Phone not provided'}</Text>
        </View>
        <View style={styles.ownerDetailGroup}>
          <Text style={styles.ownerDetailLabel}>Spot Address</Text>
          <Text style={styles.ownerDetailValue}>{request.fullAddress}</Text>
        </View>
        <View style={styles.ownerDetailGroup}>
          <Text style={styles.ownerDetailLabel}>Requested Access</Text>
          <View style={styles.accessNeedRow}>
            {request.accessNeeds.length ? request.accessNeeds.map((need) => (
              <View key={need} style={styles.accessNeedChip}>
                <Text style={styles.accessNeedText}>{need}</Text>
              </View>
            )) : <Text style={styles.ownerDetailValue}>No access areas specified</Text>}
          </View>
        </View>
        <View style={styles.ownerDetailGroup}>
          <Text style={styles.ownerDetailLabel}>Verification Documents</Text>
          {request.verificationDocuments.length ? request.verificationDocuments.map((path, index) => (
            <Pressable key={path} disabled={Boolean(openingDocument)} onPress={() => openDocument(path)} style={styles.documentRow}>
              <FileText size={15} color={adminPalette.primary} />
              <Text style={styles.documentText}>{path.split('/').pop() || `Document ${index + 1}`}</Text>
              <Text style={styles.documentOpenText}>{openingDocument === path ? 'Opening...' : 'Open'}</Text>
            </Pressable>
          )) : <Text style={styles.ownerDetailValue}>No documents attached</Text>}
        </View>
      </View>
      <View style={styles.expandedRequestColumn}>
        <Text style={styles.microHeadingPrimary}>Internal Admin Notes</Text>
        <TextInput
          multiline
          editable={pending && !reviewing}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add private notes about this applicant..."
          placeholderTextColor={adminPalette.outline}
          style={[styles.ownerNotesInput, !pending && styles.ownerNotesInputReadOnly]}
        />
        {pending ? (
          <View style={styles.ownerActionRow}>
            <Pressable disabled={reviewing} onPress={() => onReject(notes)} style={[styles.rejectButton, reviewing && styles.ownerActionDisabled]}>
              <Text style={styles.rejectButtonText}>Reject</Text>
            </Pressable>
            <Pressable disabled={reviewing} onPress={() => onApprove(notes)} style={[styles.approveButton, reviewing && styles.ownerActionDisabled]}>
              {reviewing ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.approveButtonText}>Approve Request</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={styles.reviewedRequestSummary}>
            <StatusBadge label={request.status} />
            <Text style={styles.reviewedRequestCopy}>
              {request.reviewedAt ? `Reviewed ${formatLastUpdated(request.reviewedAt)}` : 'Request reviewed'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SystemSection({ dashboard, client, userId }: { dashboard: AdminDashboardData; client: SupabaseClient; userId?: string }) {
  const queuedJobs = dashboard.metrics.pendingOwnerRequests + dashboard.metrics.reportsFiled;
  const securityAlerts = dashboard.errors.length;
  return (
    <View>
      <PageIntro
        eyebrow="Operations"
        title="System"
        subtitle="Console health, moderation queues, and operational safeguards."
      />
      <View style={styles.supabaseHealthWrap}>
        <SupabaseConnectionPanel
          scope="admin"
          client={client}
          userId={userId}
          title="Admin Supabase Connectivity"
          subtitle="Checks authentication, public spots, reservations, and owner request tables."
        />
      </View>
      <View style={styles.systemGrid}>
        <StatCard label="Data Source" value={dashboard.source === 'live' ? 'Live' : 'Sample'} icon={Radio} tone="green" delta="Active" />
        <StatCard label="Queued Jobs" value={formatCompactNumber(queuedJobs)} icon={FileText} tone="blue" delta="Review" />
        <StatCard label="Data Alerts" value={formatCompactNumber(securityAlerts)} icon={TriangleAlert} tone="danger" delta={securityAlerts ? 'Review' : 'Clear'} />
      </View>
      <DataPanel title="System Checklist">
        {[
          'Review pending owner verification documents',
          'Audit high-volume reservation refunds',
          'Refresh featured Cebu barangay leaderboards',
          `Confirm admin dashboard SQL is applied in Supabase`,
        ].map((item, index) => (
          <View key={item} style={styles.checklistRow}>
            <View style={[styles.checklistNumber, index < 2 && styles.checklistNumberActive]}>
              <Text style={[styles.checklistNumberText, index < 2 && styles.checklistNumberTextActive]}>{index + 1}</Text>
            </View>
            <Text style={styles.checklistText}>{item}</Text>
          </View>
        ))}
      </DataPanel>
    </View>
  );
}

function StatCard({ label, value, icon: Icon, tone = 'primary', delta }: StatCardProps) {
  const tint = iconTone(tone);
  return (
    <View style={styles.statCard}>
      <View style={styles.statCardTop}>
        <View style={[styles.statIcon, { backgroundColor: tint.background }]}>
          <Icon size={23} color={tint.foreground} />
        </View>
        {delta && (
          <View style={styles.deltaPill}>
            <Text style={styles.deltaText}>{delta}</Text>
          </View>
        )}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone === 'danger' && styles.statValueDanger]}>{value}</Text>
    </View>
  );
}

function SimpleRangePills() {
  return (
    <View style={styles.simpleRange}>
      {['24h', '7d', '30d', '90d'].map((range) => (
        <Pressable key={range} style={[styles.simpleRangeButton, range === '30d' && styles.simpleRangeButtonActive]}>
          <Text style={[styles.simpleRangeText, range === '30d' && styles.simpleRangeTextActive]}>{range}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.chartCard}>
      <View style={styles.cardTitleRow}>
        <View>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function BarChart({
  values,
  activeIndex,
  labels,
  compact,
  onBarPress,
  barAccessibilityLabel,
}: {
  values: number[];
  activeIndex?: number;
  labels?: string[];
  compact?: boolean;
  onBarPress?: (index: number) => void;
  barAccessibilityLabel?: (index: number) => string;
}) {
  return (
    <View>
      <View style={[styles.barChart, compact && styles.barChartCompact]}>
        <View style={styles.gridLines}>
          {[0, 1, 2, 3].map((line) => (
            <View key={line} style={styles.gridLine} />
          ))}
        </View>
        {values.map((value, index) => (
          <Pressable
            key={`${value}-${index}`}
            accessibilityRole={onBarPress ? 'button' : undefined}
            accessibilityLabel={barAccessibilityLabel?.(index)}
            onPress={() => onBarPress?.(index)}
            style={({ pressed }) => [styles.barButton, compact && styles.barButtonCompact, pressed && styles.barButtonPressed]}
          >
            <View
              style={[
                styles.bar,
                { height: `${value}%` },
                activeIndex === index ? styles.barActive : styles.barMuted,
                compact && styles.barCompact,
              ]}
            />
          </Pressable>
        ))}
      </View>
      {!!labels?.length && (
        <View style={styles.chartLabels}>
          {labels.map((label) => (
            <Text key={label} style={styles.chartLabel}>
              {label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function LineChart() {
  return (
    <View>
      <View style={styles.lineChartWrap}>
        <Svg width={400} height={220} viewBox="0 0 400 220" style={styles.lineSvg}>
          <Defs>
            <LinearGradient id="orangeFade" x1={0} x2={0} y1={0} y2={1}>
              <Stop offset={0} stopColor={adminPalette.primaryFixed} stopOpacity={0.35} />
              <Stop offset={1} stopColor={adminPalette.primaryFixed} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path
            d="M 0 180 Q 50 158 100 104 T 200 124 T 300 64 T 400 34"
            fill="none"
            stroke={adminPalette.primaryFixed}
            strokeLinecap="round"
            strokeWidth={4}
          />
          <Path d="M 0 180 Q 50 158 100 104 T 200 124 T 300 64 T 400 34 L 400 220 L 0 220 Z" fill="url(#orangeFade)" />
          <Circle cx={400} cy={34} r={6} fill={adminPalette.primaryFixed} />
        </Svg>
        <View style={styles.lineGridLines}>
          {[0, 1, 2, 3].map((line) => (
            <View key={line} style={styles.gridLine} />
          ))}
        </View>
      </View>
      <View style={styles.chartLabels}>
        {['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((label) => (
          <Text key={label} style={styles.chartLabel}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function CategoryRankingOverviewModal({
  visible,
  data,
  onClose,
}: {
  visible: boolean;
  data: AdminProgressItem[];
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const leader = data[0] ?? null;
  const totalAssignments = data.reduce((sum, item) => {
    const count = Number.parseInt(item.copy?.match(/\d+/)?.[0] ?? '0', 10);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.spotMapBackdrop}>
        <Pressable accessibilityLabel="Close category rankings" onPress={onClose} style={styles.spotMapScrim} />
        <View style={[styles.spotMapModal, styles.categoryOverviewModal, compact && styles.spotMapModalCompact]}>
          <View style={styles.spotMapHeader}>
            <View style={styles.spotMapHeaderIcon}>
              <BarChart3 size={20} color={adminPalette.primary} />
            </View>
            <View style={styles.spotMapHeaderCopy}>
              <Text style={styles.spotMapEyebrow}>CATEGORY INSIGHTS</Text>
              <Text style={styles.spotMapTitle}>Category rankings</Text>
              <Text style={styles.spotMapSubtitle}>{data.length} categories ranked by published spot assignments</Text>
            </View>
            <Pressable accessibilityLabel="Close category rankings" onPress={onClose} style={styles.spotMapClose}>
              <X size={21} color={adminPalette.onSurfaceVariant} />
            </Pressable>
          </View>

          {data.length === 0 ? (
            <View style={styles.spotMapState}>
              <BarChart3 size={28} color={adminPalette.outline} />
              <Text style={styles.spotMapStateTitle}>No category data yet</Text>
              <Text style={styles.spotMapStateText}>Published spots will appear here once they have a category.</Text>
            </View>
          ) : (
            <View style={[styles.categoryOverviewBody, compact && styles.categoryOverviewBodyCompact]}>
              <View style={[styles.categoryOverviewSummary, compact && styles.categoryOverviewSummaryCompact]}>
                <Text style={styles.categoryOverviewSectionLabel}>MOST LISTED CATEGORY</Text>
                <View style={styles.categoryOverviewLeaderIcon}>
                  <View style={[styles.categoryOverviewLeaderDot, { backgroundColor: getSpotCategoryColor(leader?.label) }]} />
                  <BarChart3 size={25} color={getSpotCategoryColor(leader?.label)} />
                </View>
                <Text style={styles.categoryOverviewLeaderName}>{leader?.label}</Text>
                <Text style={styles.categoryOverviewLeaderCount}>{leader?.copy}</Text>
                <Text style={styles.categoryOverviewLeaderCopy}>The largest category across currently published CebSpot listings.</Text>
                <View style={styles.categoryOverviewMetrics}>
                  <View style={styles.categoryOverviewMetric}>
                    <Text style={styles.categoryOverviewMetricValue}>{data.length}</Text>
                    <Text style={styles.categoryOverviewMetricLabel}>Categories</Text>
                  </View>
                  <View style={styles.categoryOverviewMetricDivider} />
                  <View style={styles.categoryOverviewMetric}>
                    <Text style={styles.categoryOverviewMetricValue}>{totalAssignments}</Text>
                    <Text style={styles.categoryOverviewMetricLabel}>Assignments</Text>
                  </View>
                </View>
              </View>

              <View style={styles.categoryOverviewRanking}>
                <View style={styles.categoryOverviewRankingHeader}>
                  <View>
                    <Text style={styles.categoryOverviewSectionLabel}>FULL RANKING</Text>
                    <Text style={styles.categoryOverviewRankingHint}>Scroll to compare every spot category.</Text>
                  </View>
                  <Text style={styles.categoryOverviewRankingCount}>{data.length} TOTAL</Text>
                </View>
                <ScrollView
                  accessibilityLabel="Full spot category rankings"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  style={styles.categoryOverviewList}
                  contentContainerStyle={styles.categoryOverviewListContent}
                >
                  {data.map((item, index) => {
                    const categoryColor = getSpotCategoryColor(item.label);
                    return (
                      <View key={item.label} style={styles.categoryOverviewRow}>
                        <View style={[styles.categoryOverviewRank, index < 3 && styles.categoryOverviewRankTop]}>
                          <Text style={[styles.categoryOverviewRankText, index < 3 && styles.categoryOverviewRankTextTop]}>{index + 1}</Text>
                        </View>
                        <View style={styles.categoryOverviewRowContent}>
                          <View style={styles.categoryOverviewRowTopline}>
                            <View style={styles.categoryOverviewRowLabelWrap}>
                              <View style={[styles.categoryOverviewRowDot, { backgroundColor: categoryColor }]} />
                              <Text style={styles.categoryOverviewRowLabel}>{item.label}</Text>
                            </View>
                            <Text style={styles.categoryOverviewRowValue}>{item.copy ?? `${item.value}%`}</Text>
                          </View>
                          <View style={styles.categoryOverviewTrack}>
                            <View style={[styles.categoryOverviewFill, { width: `${item.value}%`, backgroundColor: categoryColor }]} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ProgressPanel({
  title,
  subtitle,
  data,
  yellow,
  categoryOverview,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle: string;
  data: Array<{ label: string; value: number; copy?: string }>;
  yellow?: boolean;
  categoryOverview?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const [categoryOverviewVisible, setCategoryOverviewVisible] = useState(false);
  const visibleData = categoryOverview ? data.slice(0, 5) : data;

  return (
    <View style={styles.chartCard}>
      <View style={styles.cardTitleRow}>
        <View>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
        {categoryOverview ? (
          <Pressable
            accessibilityLabel="Open category ranking overview"
            accessibilityRole="button"
            onPress={() => setCategoryOverviewVisible(true)}
            style={({ pressed }) => [styles.chartCardAction, pressed && styles.chartCardActionPressed]}
          >
            <BarChart3 size={19} color={adminPalette.primary} />
          </Pressable>
        ) : yellow && onAction ? (
          <Pressable
            accessibilityLabel={actionLabel ?? 'Open map'}
            accessibilityRole="button"
            onPress={onAction}
            style={({ pressed }) => [styles.chartCardAction, pressed && styles.chartCardActionPressed]}
          >
            <Map size={19} color={adminPalette.primary} />
          </Pressable>
        ) : yellow ? (
          <Map size={19} color={adminPalette.outlineVariant} />
        ) : (
          <MoreHorizontal size={19} color={adminPalette.outlineVariant} />
        )}
      </View>
      <View style={styles.progressList}>
        {visibleData.map((item) => (
          <View key={item.label}>
            <View style={styles.progressTitleRow}>
              <Text style={styles.progressLabel}>{item.label}</Text>
              <Text style={styles.progressValue}>{item.copy ?? `${item.value}%`}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${item.value}%`, backgroundColor: yellow ? adminPalette.tertiaryContainer : adminPalette.primary },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
      {categoryOverview ? (
        <CategoryRankingOverviewModal
          data={data}
          onClose={() => setCategoryOverviewVisible(false)}
          visible={categoryOverviewVisible}
        />
      ) : null}
    </View>
  );
}

function LiveSessionLabel({ count }: { count: number }) {
  return (
    <View style={styles.liveSessionLabel}>
      <View style={styles.liveSessionDot} />
      <Text style={styles.liveSessionText}>{count} Active Sessions</Text>
    </View>
  );
}

function ToolbarButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <Pressable style={styles.toolbarButton}>
      <Icon size={16} color={adminPalette.onSurface} />
      <Text style={styles.toolbarButtonText}>{label}</Text>
    </Pressable>
  );
}

// Every row in these tables is already loaded and filtered client-side —
// Member controls page through the rows already loaded from Supabase. Other
// dashboard sections keep the compact count-only footer.
function Pagination({
  copy,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
}: {
  copy: string;
  onPrevious?: () => void;
  onNext?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  const hasControls = Boolean(onPrevious && onNext);

  return (
    <View style={styles.pagination}>
      <Text style={styles.paginationText}>{copy}</Text>
      {hasControls ? (
        <View style={styles.paginationActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show previous users"
            disabled={previousDisabled}
            onPress={onPrevious}
            style={[styles.paginationButton, previousDisabled && styles.paginationButtonDisabled]}
          >
            <ChevronLeft size={17} color={adminPalette.onSurface} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show next users"
            disabled={nextDisabled}
            onPress={onNext}
            style={[styles.paginationButton, nextDisabled && styles.paginationButtonDisabled]}
          >
            <ChevronRight size={17} color={adminPalette.onSurface} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
