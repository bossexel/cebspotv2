import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Svg, Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Edit3,
  FileText,
  Filter,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  LucideIcon,
  Mail,
  Map,
  MapPin,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  TicketCheck,
  TrendingUp,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react-native';
import { SupabaseConnectionPanel } from '../src/components/SupabaseConnectionPanel';
import { colors } from '../src/constants/colors';
import { shadow } from '../src/constants/design';
import { sampleSpots } from '../src/constants/sampleData';
import { useAuth } from '../src/hooks/useAuth';

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

type TableColumn<T> = {
  key: string;
  label: string;
  flex?: number;
  align?: 'left' | 'right';
  render: (item: T) => React.ReactNode;
};

const adminPalette = {
  background: '#f9f6f5',
  surfaceBright: '#f9f6f5',
  surfaceLowest: '#ffffff',
  surfaceLow: '#f3f0ef',
  surfaceContainer: '#eae7e7',
  surfaceHigh: '#e5e2e1',
  inverseSurface: '#0e0e0e',
  onSurface: '#2f2e2e',
  onSurfaceVariant: '#5c5b5b',
  outline: '#787676',
  outlineVariant: '#afacac',
  primary: '#a33800',
  primaryFixed: '#ff7941',
  primaryContainer: '#ff7941',
  secondaryContainer: '#ffc5a5',
  tertiaryContainer: '#f8a91f',
  error: '#b31b25',
  errorContainer: '#fb5151',
  success: '#15803d',
  successContainer: '#dcfce7',
};

const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, searchPlaceholder: 'Search in overview...' },
  { id: 'spots', label: 'Spots', icon: MapPin, searchPlaceholder: 'Search in spots...' },
  { id: 'reports', label: 'Reports', icon: BarChart3, searchPlaceholder: 'Search in reports...' },
  { id: 'users', label: 'All Users', icon: Users, searchPlaceholder: 'Search in users...' },
  { id: 'requests', label: 'Owner Requests', icon: UserPlus, searchPlaceholder: 'Search in requests...' },
  { id: 'system', label: 'System', icon: Settings, searchPlaceholder: 'Search system settings...' },
];

const reservationsBars = [38, 58, 44, 73, 90, 82, 64, 48, 28, 44];
const requestBars = [40, 60, 30, 80, 100, 52, 70];

const recentListings = [
  {
    id: 'SP-8842',
    name: 'Draft House Cebu',
    category: 'Bars',
    barangay: 'Lahug',
    status: 'Verified',
    date: 'Oct 24, 2023',
    image:
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80&w=240',
  },
  {
    id: 'SP-8841',
    name: 'Civet Coffee',
    category: 'Cafes',
    barangay: 'IT Park',
    status: 'Pending',
    date: 'Oct 23, 2023',
    image:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=240',
  },
  {
    id: 'SP-8839',
    name: 'The Social Cebu',
    category: 'Restaurant',
    barangay: 'Luz',
    status: 'Verified',
    date: 'Oct 22, 2023',
    image:
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=240',
  },
];

const livePulse = [
  {
    id: 'pulse-1',
    action: 'New Reservation',
    user: 'Alex Rivera',
    location: 'Downtown Hub - Spot #402',
    value: 'P 1,240.00',
    status: 'Success',
  },
  {
    id: 'pulse-2',
    action: 'New Spot Request',
    user: 'Sarah Jenkins',
    location: 'Westside Rooftop',
    value: '-',
    status: 'Pending',
  },
];

const reports = [
  {
    id: 'report-1',
    type: 'Spot Issue',
    spot: 'Lantaw Il Corso',
    area: 'South Road Properties',
    reporter: 'JD',
    date: 'Oct 24, 2023',
    description: 'The location pinned on the map is approximately two blocks away from the entrance.',
  },
  {
    id: 'report-2',
    type: 'Fake Review',
    spot: 'Le Village Cebu',
    area: 'Lahug',
    reporter: 'MK',
    date: 'Oct 23, 2023',
    description:
      "This review seems completely fabricated. The user mentions dishes that are not even on the menu, and the photo appears unrelated.",
    expanded: true,
  },
  {
    id: 'report-3',
    type: 'Wrong Info',
    spot: 'Cebu Ocean Park',
    area: 'Mambaling',
    reporter: 'AL',
    date: 'Oct 22, 2023',
    description: 'The opening hours listed are outdated. They now close at 6 PM instead of 8 PM.',
  },
];

const users = [
  { id: 'CS-2938', name: 'Exiel', role: 'Spotter', location: 'Mabolo, Cebu City', joined: 'Oct 12, 2023', avatar: 'E' },
  { id: 'CS-1042', name: 'Clyde', role: 'Owner', location: 'Lahug, Cebu City', joined: 'Aug 28, 2023', avatar: 'C' },
  { id: 'CS-3101', name: 'Recanil', role: 'Spotter', location: 'Guadalupe, Cebu City', joined: 'Nov 05, 2023', avatar: 'R' },
  { id: 'CS-2884', name: 'Eniceta', role: 'Spotter', location: 'Banilad, Cebu City', joined: 'Dec 15, 2023', avatar: 'E' },
  { id: 'CS-0821', name: 'Brian', role: 'Owner', location: 'Apas, Cebu City', joined: 'Jun 14, 2023', avatar: 'B' },
  { id: 'CS-4112', name: 'Ocio', role: 'Spotter', location: 'Talamban, Cebu City', joined: 'Jan 02, 2024', avatar: 'O' },
];

const ownerRequests = [
  {
    id: 'REQ-1028',
    applicant: '-',
    initials: 'JD',
    email: 'j.delacruz@email.com',
    spot: 'Liv Superclub',
    category: 'Coffee Shop',
    barangay: 'Mabolo',
    applied: 'Oct 24, 2023',
  },
  {
    id: 'REQ-1029',
    applicant: '-',
    initials: 'MS',
    email: 'm.santos@bizhub.ph',
    spot: 'The Social Cebu',
    category: 'Restaurant',
    barangay: 'Luz',
    applied: 'Oct 25, 2023',
    expanded: true,
  },
  {
    id: 'REQ-1030',
    applicant: 'Rico Blanco',
    initials: 'RC',
    email: 'rico.b@itpark.org',
    spot: 'Draft Punk',
    category: 'Bar',
    barangay: 'Lahug',
    applied: 'Oct 26, 2023',
  },
];

const categories = [
  { label: 'Cafes', value: 42 },
  { label: 'Restaurants', value: 35 },
  { label: 'Clubs', value: 18 },
  { label: 'Bars', value: 5 },
];

const barangays = [
  { label: 'Lahug', value: 70, copy: '24 spots' },
  { label: 'IT Park', value: 55, copy: '18 spots' },
  { label: 'Mabolo', value: 40, copy: '14 spots' },
  { label: 'Guadalupe', value: 35, copy: '12 spots' },
];

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
  const { profile, logOut } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [query, setQuery] = useState('');

  const activeNav = navItems.find((item) => item.id === activeSection) ?? navItems[0];
  const compact = width < 1180;
  const adminName = profile?.display_name || 'Admin User';
  const adminInitial = adminName.charAt(0).toUpperCase();

  const platformTotals = useMemo(() => {
    const reservable = sampleSpots.filter((spot) => spot.is_reservable).length;
    const estimatedRevenue = sampleSpots.reduce((sum, spot) => sum + (spot.reservation_fee || 0) * 42, 0);
    return {
      reservable,
      estimatedRevenue: Math.max(estimatedRevenue, 42069),
    };
  }, []);

  async function handleSignOut() {
    try {
      await logOut();
      router.replace('/login');
    } catch (error: any) {
      Alert.alert('Sign out failed', error.message ?? 'Please try again.');
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>CebSpot Admin</Text>
          <Text style={styles.brandSub}>Super Admin Console</Text>
        </View>

        <View style={styles.nav}>
          {navItems.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              active={activeSection === item.id}
              compact={compact}
              onPress={() => setActiveSection(item.id)}
            />
          ))}
        </View>

        <View style={styles.sidebarFooter}>
          <View style={styles.adminCard}>
            <View style={styles.adminAvatar}>
              <Text style={styles.adminAvatarText}>{adminInitial}</Text>
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
          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <LogOut size={18} color={adminPalette.outlineVariant} />
            {!compact && <Text style={styles.signOutText}>Sign out</Text>}
          </Pressable>
        </View>
      </View>

      <View style={styles.workspace}>
        <View style={styles.topbar}>
          <View style={styles.searchBox}>
            <Search size={18} color={adminPalette.outline} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={activeNav.searchPlaceholder}
              placeholderTextColor={adminPalette.outline}
              style={styles.searchInput}
            />
          </View>
          <View style={styles.topbarActions}>
            <IconButton icon={HelpCircle} />
            <IconButton icon={Bell} dot />
            <View style={styles.topbarDivider} />
            <View style={styles.liveBadge}>
              <Radio size={14} color={colors.white} fill={colors.white} />
              <Text style={styles.liveBadgeText}>Live</Text>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.canvas}
          contentContainerStyle={styles.canvasContent}
          showsVerticalScrollIndicator={false}
        >
          {activeSection === 'overview' && <OverviewSection estimatedRevenue={platformTotals.estimatedRevenue} />}
          {activeSection === 'spots' && <SpotsSection />}
          {activeSection === 'reports' && <ReportsSection />}
          {activeSection === 'users' && <UsersSection />}
          {activeSection === 'requests' && <OwnerRequestsSection />}
          {activeSection === 'system' && <SystemSection />}
        </ScrollView>
      </View>
    </View>
  );
}

function SidebarItem({
  item,
  active,
  compact,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const Icon = item.icon;
  return (
    <Pressable style={[styles.navItem, active && styles.navItemActive, compact && styles.navItemCompact]} onPress={onPress}>
      <Icon size={19} color={active ? adminPalette.primaryFixed : '#d8d4d1'} strokeWidth={active ? 2.7 : 2.1} />
      {!compact && <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>}
    </Pressable>
  );
}

function IconButton({ icon: Icon, dot }: { icon: LucideIcon; dot?: boolean }) {
  return (
    <Pressable style={styles.iconButton}>
      <Icon size={18} color={adminPalette.onSurfaceVariant} />
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
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.pageTitle}>{title}</Text>
        <Text style={styles.pageSubtitle}>{subtitle}</Text>
      </View>
      {right}
    </View>
  );
}

function SegmentedRange() {
  return (
    <View style={styles.rangeControl}>
      {['24h', '7d', '30d', '90d'].map((range) => (
        <Pressable key={range} style={[styles.rangeButton, range === '30d' && styles.rangeButtonActive]}>
          <Text style={[styles.rangeText, range === '30d' && styles.rangeTextActive]}>{range}</Text>
        </Pressable>
      ))}
      <View style={styles.rangeDivider} />
      <View style={styles.calendarChip}>
        <CalendarDays size={15} color={adminPalette.onSurfaceVariant} />
        <Text style={styles.calendarChipText}>Oct 1 - Oct 31</Text>
      </View>
    </View>
  );
}

function OverviewSection({ estimatedRevenue }: { estimatedRevenue: number }) {
  return (
    <View>
      <PageIntro
        eyebrow="Insights"
        title="Overview"
        subtitle="Real-time platform health - last update Oct 24, 2023"
        right={<SegmentedRange />}
      />

      <View style={styles.supabaseHealthWrap}>
        <SupabaseConnectionPanel
          scope="admin"
          title="Admin Supabase Connectivity"
          subtitle="Checks auth, public spots, reservations, and owner request tables from this dashboard."
        />
      </View>

      <View style={styles.overviewGrid}>
        <View style={styles.heroCard}>
          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>Estimated Spot Revenue</Text>
            <View style={styles.heroValueRow}>
              <Text style={styles.heroValue}>P {estimatedRevenue.toLocaleString('en-US')}</Text>
              <View style={styles.heroDelta}>
                <TrendingUp size={12} color={colors.white} />
                <Text style={styles.heroDeltaText}>12.4%</Text>
              </View>
            </View>
            <Text style={styles.heroCopy}>From confirmed bookings only through platform transactions.</Text>
          </View>
          <View style={styles.heroStats}>
            <DarkMiniStat label="Spots Today" value="42" />
            <DarkMiniStat label="Reservations" value="118" />
            <DarkMiniStat label="Lifetime Total" value="18.4k" />
          </View>
          <TrendingUp size={210} color="#a33800" style={styles.heroWatermark} />
        </View>

        <View style={styles.overviewSideStats}>
          <StatCard label="Total Spots" value="842" icon={Map} />
          <StatCard label="Active Owners" value="156" icon={User} />
          <StatCard label="Reports Filed" value="14" icon={TriangleAlert} tone="danger" />
        </View>
      </View>

      <View style={styles.twoColumnGrid}>
        <ChartCard
          title="Reservations per day"
          subtitle="Volume tracking for confirmed bookings"
          action={<MoreHorizontal size={20} color={adminPalette.outline} />}
        >
          <BarChart values={reservationsBars} activeIndex={5} labels={['Oct 01', 'Oct 10', 'Oct 20', 'Oct 31']} />
        </ChartCard>
        <ChartCard
          title="New spots per day"
          subtitle="Inventory growth metrics"
          action={<Text style={styles.exportLink}>Export CSV</Text>}
        >
          <LineChart />
        </ChartCard>
      </View>

      <DataPanel title="Live Platform Pulse" right={<LiveSessionLabel count={32} />}>
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
          data={livePulse}
        />
      </DataPanel>
    </View>
  );
}

function DarkMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.darkMiniStat}>
      <Text style={styles.darkMiniLabel}>{label}</Text>
      <Text style={styles.darkMiniValue}>{value}</Text>
    </View>
  );
}

function SpotsSection() {
  return (
    <View>
      <PageIntro
        eyebrow="Discovery"
        title="Spots"
        subtitle="Venue listings registered in CebSpot."
        right={<SimpleRangePills />}
      />
      <View style={styles.spotStatsGrid}>
        <StatCard label="Spots in range" value="86" icon={MapPin} delta="+12%" />
        <StatCard label="Active owners" value="34" icon={ShieldCheck} tone="warning" delta="+5.4%" />
        <View style={styles.growthCard}>
          <View style={styles.growthContent}>
            <Text style={styles.growthLabel}>Growth Projection</Text>
            <Text style={styles.growthTitle}>Network expansion expected to reach +120 spots by Q4.</Text>
            <View style={styles.growthLinkRow}>
              <Text style={styles.growthLink}>View forecast report</Text>
              <TrendingUp size={15} color={colors.white} />
            </View>
          </View>
          <TrendingUp size={155} color="#ffffff30" style={styles.growthWatermark} />
        </View>
      </View>

      <View style={styles.twoColumnGrid}>
        <ProgressPanel title="Top spot categories" subtitle="Categorical distribution by venue type" data={categories} />
        <ProgressPanel title="Top barangays in Cebu" subtitle="Leaderboard areas for registered spots." data={barangays} yellow />
      </View>

      <DataPanel title="Recent Listings" right={<Text style={styles.exportLink}>Export CSV</Text>}>
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
              render: () => (
                <Pressable style={styles.tableIconButton}>
                  <Edit3 size={16} color={adminPalette.onSurfaceVariant} />
                </Pressable>
              ),
            },
          ]}
          data={recentListings}
        />
      </DataPanel>

      <Pressable style={styles.floatingAdd}>
        <Plus size={24} color={colors.white} />
      </Pressable>
    </View>
  );
}

function ReportsSection() {
  return (
    <View>
      <PageIntro
        eyebrow="Moderation"
        title="Reports"
        subtitle="Issues submitted by users about spots, reviews, or content."
      />
      <View style={styles.reportTabs}>
        {['All', 'Spot Issue', 'Fake Review', 'Wrong Info', 'Offensive Content'].map((tab) => (
          <Pressable key={tab} style={[styles.reportTab, tab === 'All' && styles.reportTabActive]}>
            <Text style={[styles.reportTabText, tab === 'All' && styles.reportTabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.reportPanel}>
        <View style={styles.reportHeader}>
          {['Type', 'Reported Spot', 'Reported By', 'Date Filed', 'Description', 'Actions'].map((label) => (
            <Text key={label} style={styles.reportHeading}>
              {label}
            </Text>
          ))}
        </View>
        {reports.map((report) => (
          <View key={report.id}>
            <View style={[styles.reportRow, report.expanded && styles.reportRowExpanded]}>
              <View style={styles.reportColumn}>
                <StatusBadge label={report.type} danger={report.type === 'Fake Review'} warning={report.type === 'Wrong Info'} />
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
                <Text style={styles.tableMuted} numberOfLines={report.expanded ? 3 : 1}>
                  {report.description}
                </Text>
              </View>
              <View style={[styles.reportColumn, styles.reportActions]}>
                <Pressable style={styles.reviewButton}>
                  <Text style={styles.reviewButtonText}>Review</Text>
                </Pressable>
                <Trash2Safe />
              </View>
            </View>
            {report.expanded && <ExpandedReport />}
          </View>
        ))}
        <Pagination copy="Showing 1-10 of 42 reports" />
      </View>
    </View>
  );
}

function Trash2Safe() {
  return (
    <Pressable style={styles.tableIconButton}>
      <XCircle size={17} color={adminPalette.error} />
    </Pressable>
  );
}

function ExpandedReport() {
  return (
    <View style={styles.expandedReport}>
      <Text style={styles.reportQuote}>
        "This review seems completely fabricated. The user mentions dishes that are not even on the menu, and the uploaded
        photo looks unrelated. I was there yesterday and the experience was totally different."
      </Text>
      <View style={styles.expandedReportBody}>
        <View>
          <Text style={styles.microHeading}>Attached Evidence</Text>
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=240',
            }}
            style={styles.evidenceImage}
          />
        </View>
        <View style={styles.notesColumn}>
          <Text style={styles.microHeading}>Admin Notes</Text>
          <TextInput
            multiline
            placeholder="Enter resolution notes..."
            placeholderTextColor={adminPalette.outline}
            style={styles.notesInput}
          />
        </View>
      </View>
      <View style={styles.expandedActions}>
        <Pressable style={styles.ghostButton}>
          <Text style={styles.ghostButtonText}>Dismiss Report</Text>
        </Pressable>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Update Spot Details</Text>
        </Pressable>
      </View>
    </View>
  );
}

function UsersSection() {
  return (
    <View>
      <PageIntro
        eyebrow="People"
        title="Users"
        subtitle="Profiles registered in CebSpot."
        right={
          <Pressable style={styles.addUserButton}>
            <Plus size={19} color={colors.white} />
            <Text style={styles.addUserText}>Add User</Text>
          </Pressable>
        }
      />

      <View style={styles.filterBar}>
        <View style={styles.filterPillRow}>
          {['All', 'Spotter', 'Owner'].map((item) => (
            <Pressable key={item} style={[styles.filterPill, item === 'All' && styles.filterPillActive]}>
              <Text style={[styles.filterPillText, item === 'All' && styles.filterPillTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.filterSummary}>
          <Text style={styles.filterSummaryStrong}>42</Text> shown - <Text style={styles.filterSummaryPrimary}>35</Text> spotters -{' '}
          <Text style={styles.filterSummaryPrimary}>7</Text> owners
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
                    <Text style={styles.userAvatarText}>{item.avatar}</Text>
                  </View>
                  <View>
                    <Text style={styles.tableStrong}>{item.name}</Text>
                    <Text style={styles.tableMini}>UID: {item.id}</Text>
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
                  <MapPin size={14} color={adminPalette.primary} />
                  <Text style={styles.tableMuted}>{item.location}</Text>
                </View>
              ),
            },
            { key: 'joined', label: 'Joined Date', render: (item) => <Text style={styles.tableMuted}>{item.joined}</Text> },
            {
              key: 'actions',
              label: 'Actions',
              align: 'right',
              render: () => (
                <View style={styles.inlineActions}>
                  <Pressable style={styles.tableIconButton}>
                    <Edit3 size={16} color={adminPalette.primary} />
                  </Pressable>
                  <Pressable style={styles.tableIconButton}>
                    <XCircle size={17} color={adminPalette.error} />
                  </Pressable>
                </View>
              ),
            },
          ]}
          data={users}
        />
        <Pagination copy="Showing 8 of 42 users" />
      </DataPanel>
    </View>
  );
}

function OwnerRequestsSection() {
  return (
    <View>
      <PageIntro
        eyebrow="People & Access"
        title="Owner Requests"
        subtitle="Manage applications from users wanting to register as spot owners and integrate reservation systems."
      />

      <View style={styles.requestToolbar}>
        <View style={styles.filterPillRow}>
          {['All', 'Pending', 'Approved', 'Rejected'].map((item) => (
            <Pressable key={item} style={[styles.requestPill, item === 'All' && styles.requestPillActive]}>
              <Text style={[styles.requestPillText, item === 'All' && styles.requestPillTextActive]}>{item}</Text>
              {item === 'Pending' && (
                <View style={styles.pendingCount}>
                  <Text style={styles.pendingCountText}>12</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
        <View style={styles.inlineActions}>
          <ToolbarButton icon={Filter} label="Filter" />
          <ToolbarButton icon={Download} label="Export" />
        </View>
      </View>

      <View style={styles.requestsTable}>
        <View style={styles.requestHeader}>
          {['Applicant', 'Spot Name', 'Category', 'Barangay', 'Applied', 'Actions'].map((label) => (
            <Text key={label} style={styles.requestHeading}>
              {label}
            </Text>
          ))}
        </View>
        {ownerRequests.map((request) => (
          <View key={request.id}>
            <View style={[styles.requestRow, request.expanded && styles.requestRowExpanded]}>
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
                <Pressable style={[styles.requestIconAction, styles.approveAction]}>
                  <CheckCircle2 size={18} color={request.expanded ? colors.white : '#16a34a'} />
                </Pressable>
                <Pressable style={[styles.requestIconAction, request.expanded && styles.collapseAction]}>
                  {request.expanded ? <ChevronUp size={18} color={colors.white} /> : <Mail size={18} color="#2563eb" />}
                </Pressable>
                {!request.expanded && (
                  <Pressable style={styles.requestIconAction}>
                    <XCircle size={18} color={adminPalette.error} />
                  </Pressable>
                )}
              </View>
            </View>
            {request.expanded && <ExpandedOwnerRequest />}
          </View>
        ))}
        <Pagination copy="Showing 1 to 10 of 48 requests" numbered />
      </View>

      <View style={styles.bottomBento}>
        <View style={styles.systemUpdateCard}>
          <View style={styles.updateTagRow}>
            <Text style={styles.updateTag}>System Update</Text>
            <Text style={styles.updateVersion}>Ver 2.4.0</Text>
          </View>
          <Text style={styles.updateTitle}>Automated Verification is Live</Text>
          <Text style={styles.updateCopy}>
            The document scanner has pre-verified 85% of today's applicants. Gold badges mark instant approval suggestions.
          </Text>
          <Pressable style={styles.updateButton}>
            <Text style={styles.updateButtonText}>Review Logs</Text>
          </Pressable>
          <ShieldCheck size={150} color="#ff794118" style={styles.updateWatermark} />
        </View>
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
    </View>
  );
}

function ExpandedOwnerRequest() {
  return (
    <View style={styles.expandedRequest}>
      <View style={styles.expandedRequestColumn}>
        <Text style={styles.microHeadingPrimary}>Application Message</Text>
        <View style={styles.messageCard}>
          <Text style={styles.messageText}>
            "Good day CebSpot Team. We would like to register The Social Cebu as an official partner. We are looking to
            integrate our existing reservation system with your platform to manage weekend peak hours more effectively."
          </Text>
        </View>
      </View>
      <View style={styles.expandedRequestColumn}>
        <Text style={styles.microHeadingPrimary}>Verification Documents</Text>
        <Image
          source={{
            uri: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=400',
          }}
          style={styles.documentImage}
        />
        <View style={styles.documentRow}>
          <FileText size={13} color={adminPalette.onSurfaceVariant} />
          <Text style={styles.documentText}>Mayors_Permit_2023_TheSocial.pdf (2.4 MB)</Text>
        </View>
      </View>
      <View style={styles.expandedRequestColumn}>
        <Text style={styles.microHeadingPrimary}>Internal Admin Notes</Text>
        <TextInput
          multiline
          placeholder="Add private notes about this applicant..."
          placeholderTextColor={adminPalette.outline}
          style={styles.ownerNotesInput}
        />
        <View style={styles.ownerActionRow}>
          <Pressable style={styles.rejectButton}>
            <Text style={styles.rejectButtonText}>Reject</Text>
          </Pressable>
          <Pressable style={styles.approveButton}>
            <Text style={styles.approveButtonText}>Approve Request</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SystemSection() {
  return (
    <View>
      <PageIntro
        eyebrow="Operations"
        title="System"
        subtitle="Console health, moderation queues, and operational safeguards."
      />
      <View style={styles.systemGrid}>
        <StatCard label="API Health" value="99.98%" icon={Radio} tone="green" delta="Stable" />
        <StatCard label="Queued Jobs" value="28" icon={FileText} tone="blue" delta="-9%" />
        <StatCard label="Security Alerts" value="2" icon={TriangleAlert} tone="danger" delta="Review" />
      </View>
      <DataPanel title="System Checklist">
        {[
          'Review pending owner verification documents',
          'Audit high-volume reservation refunds',
          'Refresh featured Cebu barangay leaderboards',
          'Check map tile fallback availability',
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
}: {
  values: number[];
  activeIndex?: number;
  labels?: string[];
  compact?: boolean;
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
          <View
            key={`${value}-${index}`}
            style={[
              styles.bar,
              { height: `${value}%` },
              activeIndex === index ? styles.barActive : styles.barMuted,
              compact && styles.barCompact,
            ]}
          />
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

function ProgressPanel({
  title,
  subtitle,
  data,
  yellow,
}: {
  title: string;
  subtitle: string;
  data: Array<{ label: string; value: number; copy?: string }>;
  yellow?: boolean;
}) {
  return (
    <View style={styles.chartCard}>
      <View style={styles.cardTitleRow}>
        <View>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
        {yellow ? <Map size={19} color={adminPalette.outlineVariant} /> : <MoreHorizontal size={19} color={adminPalette.outlineVariant} />}
      </View>
      <View style={styles.progressList}>
        {data.map((item) => (
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
    </View>
  );
}

function DataPanel({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.dataPanel}>
      {!!title && (
        <View style={styles.dataPanelHeader}>
          <Text style={styles.dataPanelTitle}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

function DataTable<T extends { id: string }>({ columns, data }: { columns: TableColumn<T>[]; data: T[] }) {
  return (
    <View>
      <View style={styles.tableHead}>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[
              styles.tableHeadText,
              { flex: column.flex ?? 1, textAlign: column.align ?? 'left' },
            ]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {data.map((item) => (
        <View key={item.id} style={styles.tableRow}>
          {columns.map((column) => (
            <View key={column.key} style={{ flex: column.flex ?? 1, alignItems: column.align === 'right' ? 'flex-end' : 'flex-start' }}>
              {column.render(item)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function StatusBadge({
  label,
  danger,
  warning,
}: {
  label: string;
  danger?: boolean;
  warning?: boolean;
}) {
  const lower = label.toLowerCase();
  const isOwner = lower === 'owner' || lower === 'restaurant';
  const isPending = lower === 'pending';
  const isSuccess = lower === 'verified' || lower === 'success' || lower === 'spotter';
  const background = danger
    ? adminPalette.errorContainer
    : warning
      ? adminPalette.tertiaryContainer
      : isOwner
        ? adminPalette.primaryContainer
        : isPending
          ? adminPalette.secondaryContainer
          : isSuccess
            ? adminPalette.successContainer
            : adminPalette.surfaceContainer;
  const foreground = danger
    ? adminPalette.error
    : warning
      ? '#593900'
      : isOwner
        ? '#431200'
        : isPending
          ? '#763400'
          : isSuccess
            ? '#166534'
            : adminPalette.onSurfaceVariant;
  return (
    <View style={[styles.statusBadge, { backgroundColor: background }]}>
      <Text style={[styles.statusBadgeText, { color: foreground }]}>{label}</Text>
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

function Pagination({ copy, numbered }: { copy: string; numbered?: boolean }) {
  return (
    <View style={styles.pagination}>
      <Text style={styles.paginationText}>{copy}</Text>
      <View style={styles.paginationActions}>
        <Pressable style={styles.paginationButton}>
          <ChevronLeft size={16} color={adminPalette.onSurfaceVariant} />
        </Pressable>
        {numbered && (
          <>
            <View style={styles.pageNumberActive}>
              <Text style={styles.pageNumberActiveText}>1</Text>
            </View>
            {[2, 3].map((page) => (
              <View key={page} style={styles.pageNumber}>
                <Text style={styles.pageNumberText}>{page}</Text>
              </View>
            ))}
          </>
        )}
        <Pressable style={styles.paginationButton}>
          <ChevronRight size={16} color={adminPalette.onSurfaceVariant} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: adminPalette.background,
  },
  sidebar: {
    width: 250,
    backgroundColor: adminPalette.inverseSurface,
    paddingTop: 28,
    paddingBottom: 24,
    borderRightWidth: 1,
    borderRightColor: '#ffffff12',
  },
  sidebarCompact: {
    width: 78,
  },
  brandBlock: {
    paddingHorizontal: 22,
    marginBottom: 34,
  },
  brand: {
    color: adminPalette.surfaceLowest,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  brandSub: {
    color: adminPalette.outlineVariant,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  nav: {
    flex: 1,
    gap: 4,
  },
  navItem: {
    minHeight: 48,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  navItemCompact: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: '#a338001a',
    borderLeftColor: adminPalette.primaryFixed,
  },
  navText: {
    color: '#ded9d6',
    fontSize: 14,
    fontWeight: '700',
  },
  navTextActive: {
    color: adminPalette.surfaceLowest,
    fontWeight: '900',
  },
  sidebarFooter: {
    paddingHorizontal: 14,
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: '#ffffff12',
    gap: 18,
  },
  adminCard: {
    minHeight: 58,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff0a',
  },
  adminAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminPalette.primaryContainer,
  },
  adminAvatarText: {
    color: '#431200',
    fontSize: 14,
    fontWeight: '900',
  },
  adminCopy: {
    flex: 1,
    minWidth: 0,
  },
  adminName: {
    color: adminPalette.surfaceLowest,
    fontSize: 12,
    fontWeight: '900',
  },
  adminRole: {
    color: adminPalette.outlineVariant,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  signOutButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
  },
  signOutText: {
    color: adminPalette.surfaceLowest,
    fontSize: 13,
    fontWeight: '700',
  },
  workspace: {
    flex: 1,
    minWidth: 0,
  },
  topbar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
    backgroundColor: adminPalette.surfaceBright,
  },
  searchBox: {
    width: '100%',
    maxWidth: 560,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant,
    backgroundColor: adminPalette.surfaceLowest,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: adminPalette.onSurface,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 8,
  },
  topbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 20,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    right: 10,
    top: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: adminPalette.primary,
  },
  topbarDivider: {
    width: 1,
    height: 28,
    backgroundColor: adminPalette.outlineVariant,
    opacity: 0.65,
    marginHorizontal: 4,
  },
  liveBadge: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: adminPalette.primary,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...shadow.card,
  },
  liveBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  canvas: {
    flex: 1,
  },
  canvasContent: {
    padding: 28,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    gap: 24,
  },
  pageIntro: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 18,
    marginBottom: 28,
  },
  eyebrow: {
    color: adminPalette.primary,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  pageTitle: {
    color: adminPalette.onSurface,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 4,
  },
  pageSubtitle: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    marginTop: 4,
    maxWidth: 620,
  },
  supabaseHealthWrap: {
    marginBottom: 24,
  },
  rangeControl: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant,
    backgroundColor: adminPalette.surfaceLowest,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rangeButton: {
    height: 34,
    minWidth: 48,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeButtonActive: {
    backgroundColor: adminPalette.primary,
  },
  rangeText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
  rangeTextActive: {
    color: colors.white,
    fontWeight: '900',
  },
  rangeDivider: {
    width: 1,
    height: 24,
    backgroundColor: adminPalette.outlineVariant,
    marginHorizontal: 6,
  },
  calendarChip: {
    height: 34,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  calendarChipText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  heroCard: {
    flex: 1,
    minHeight: 330,
    borderRadius: 20,
    backgroundColor: adminPalette.inverseSurface,
    padding: 30,
    overflow: 'hidden',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: adminPalette.primary + '22',
    ...shadow.lifted,
  },
  heroContent: {
    zIndex: 2,
  },
  heroLabel: {
    color: adminPalette.primaryFixed,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  heroValue: {
    color: adminPalette.surfaceLowest,
    fontSize: 58,
    lineHeight: 66,
    fontWeight: '900',
    letterSpacing: 0,
  },
  heroDelta: {
    borderRadius: 999,
    backgroundColor: adminPalette.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroDeltaText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
  },
  heroCopy: {
    color: adminPalette.outlineVariant,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  heroStats: {
    zIndex: 2,
    flexDirection: 'row',
    gap: 20,
  },
  darkMiniStat: {
    flex: 1,
    minHeight: 84,
    borderRadius: 12,
    backgroundColor: '#ffffff0d',
    borderWidth: 1,
    borderColor: '#ffffff14',
    padding: 17,
    justifyContent: 'center',
  },
  darkMiniLabel: {
    color: adminPalette.outlineVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  darkMiniValue: {
    color: adminPalette.surfaceLowest,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 3,
  },
  heroWatermark: {
    position: 'absolute',
    right: -25,
    top: 42,
    opacity: 0.18,
  },
  overviewSideStats: {
    width: 290,
    gap: 22,
  },
  statCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '66',
    backgroundColor: adminPalette.surfaceLowest,
    padding: 22,
    justifyContent: 'space-between',
    ...shadow.card,
  },
  statCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deltaPill: {
    borderRadius: 999,
    backgroundColor: adminPalette.primary + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deltaText: {
    color: adminPalette.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  statLabel: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 12,
  },
  statValue: {
    color: adminPalette.onSurface,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  statValueDanger: {
    color: adminPalette.error,
  },
  twoColumnGrid: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  chartCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '75',
    backgroundColor: adminPalette.surfaceLowest,
    padding: 28,
    ...shadow.card,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 26,
  },
  cardTitle: {
    color: adminPalette.onSurface,
    fontSize: 18,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  exportLink: {
    color: adminPalette.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  barChart: {
    height: 220,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    position: 'relative',
  },
  barChartCompact: {
    height: 138,
    gap: 8,
  },
  gridLines: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  gridLine: {
    height: 1,
    backgroundColor: adminPalette.surfaceContainer,
  },
  bar: {
    flex: 1,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    zIndex: 2,
  },
  barCompact: {
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  barMuted: {
    backgroundColor: adminPalette.primary + '22',
  },
  barActive: {
    backgroundColor: adminPalette.primary,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  chartLabel: {
    color: adminPalette.outline,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  lineChartWrap: {
    height: 220,
    position: 'relative',
  },
  lineSvg: {
    width: '100%',
    height: 220,
  },
  lineGridLines: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingVertical: 20,
    opacity: 0.55,
  },
  dataPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '75',
    backgroundColor: adminPalette.surfaceLowest,
    overflow: 'hidden',
    marginBottom: 24,
    ...shadow.card,
  },
  dataPanelHeader: {
    minHeight: 72,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
    backgroundColor: adminPalette.surfaceBright,
  },
  dataPanelTitle: {
    color: adminPalette.onSurface,
    fontSize: 18,
    fontWeight: '900',
  },
  liveSessionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveSessionDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: adminPalette.primary,
  },
  liveSessionText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tableHead: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminPalette.surfaceLow,
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
    paddingHorizontal: 24,
    gap: 14,
  },
  tableHeadText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  tableRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
  },
  rowWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminPalette.primaryContainer + '33',
  },
  tableStrong: {
    color: adminPalette.onSurface,
    fontSize: 13,
    fontWeight: '900',
  },
  tableMuted: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
  },
  tablePrimary: {
    color: adminPalette.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  tableMini: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  simpleRange: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant,
    backgroundColor: adminPalette.surfaceLowest,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  simpleRangeButton: {
    minWidth: 48,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleRangeButtonActive: {
    backgroundColor: adminPalette.primary,
  },
  simpleRangeText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
  simpleRangeTextActive: {
    color: colors.white,
    fontWeight: '900',
  },
  spotStatsGrid: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  growthCard: {
    flex: 2,
    minHeight: 152,
    borderRadius: 14,
    backgroundColor: adminPalette.primary,
    padding: 24,
    overflow: 'hidden',
    justifyContent: 'space-between',
    ...shadow.lifted,
  },
  growthContent: {
    zIndex: 2,
  },
  growthLabel: {
    color: '#ffffffcc',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  growthTitle: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
    maxWidth: 380,
    marginTop: 6,
  },
  growthLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 18,
  },
  growthLink: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
  },
  growthWatermark: {
    position: 'absolute',
    right: -15,
    bottom: -20,
  },
  progressList: {
    gap: 22,
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    color: adminPalette.onSurface,
    fontSize: 12,
    fontWeight: '900',
  },
  progressValue: {
    color: adminPalette.onSurface,
    fontSize: 12,
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: adminPalette.surfaceContainer,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  listingCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listingImage: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: adminPalette.surfaceContainer,
  },
  tableIconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingAdd: {
    position: 'absolute',
    right: 0,
    bottom: 10,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: adminPalette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: adminPalette.primary + '22',
    ...shadow.lifted,
  },
  reportTabs: {
    flexDirection: 'row',
    gap: 22,
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
    marginBottom: 24,
  },
  reportTab: {
    paddingHorizontal: 6,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  reportTabActive: {
    borderBottomColor: adminPalette.primary,
  },
  reportTabText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
  },
  reportTabTextActive: {
    color: adminPalette.primary,
    fontWeight: '900',
  },
  reportPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '65',
    backgroundColor: adminPalette.surfaceLowest,
    overflow: 'hidden',
    ...shadow.card,
  },
  reportHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminPalette.surfaceLow,
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
    paddingHorizontal: 24,
  },
  reportHeading: {
    flex: 1,
    color: adminPalette.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  reportRow: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
  },
  reportRowExpanded: {
    backgroundColor: adminPalette.surfaceLow + '80',
    alignItems: 'flex-start',
    paddingTop: 22,
  },
  reportColumn: {
    flex: 1,
    paddingRight: 14,
  },
  reportDescriptionColumn: {
    flex: 1.6,
  },
  reportActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  initialAvatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminPalette.primaryContainer,
  },
  initialAvatarText: {
    color: '#431200',
    fontSize: 10,
    fontWeight: '900',
  },
  reviewButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reviewButtonText: {
    color: adminPalette.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  expandedReport: {
    marginLeft: 345,
    marginRight: 24,
    marginBottom: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '44',
    backgroundColor: adminPalette.surfaceLowest,
    padding: 24,
    ...shadow.card,
  },
  reportQuote: {
    color: adminPalette.onSurface,
    fontSize: 13,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  expandedReportBody: {
    flexDirection: 'row',
    gap: 40,
    marginTop: 22,
  },
  microHeading: {
    color: adminPalette.outline,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  evidenceImage: {
    width: 92,
    height: 92,
    borderRadius: 12,
    backgroundColor: adminPalette.surfaceContainer,
  },
  notesColumn: {
    flex: 1,
  },
  notesInput: {
    height: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant,
    backgroundColor: adminPalette.surfaceLow,
    padding: 12,
    color: adminPalette.onSurface,
    fontSize: 12,
    textAlignVertical: 'top',
  },
  expandedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: adminPalette.surfaceContainer,
    marginTop: 24,
    paddingTop: 18,
  },
  ghostButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ghostButtonText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
  },
  primaryButton: {
    borderRadius: 8,
    backgroundColor: adminPalette.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    ...shadow.card,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
  },
  addUserButton: {
    borderRadius: 10,
    backgroundColor: adminPalette.primaryFixed,
    paddingHorizontal: 20,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...shadow.card,
  },
  addUserText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  filterBar: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '45',
    backgroundColor: adminPalette.surfaceLowest,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    ...shadow.card,
  },
  filterPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  filterPill: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: adminPalette.surfaceContainer,
  },
  filterPillActive: {
    backgroundColor: adminPalette.primary,
  },
  filterPillText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
  },
  filterPillTextActive: {
    color: colors.white,
  },
  filterSummary: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '800',
    borderRadius: 999,
    backgroundColor: adminPalette.surfaceLow,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '35',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterSummaryStrong: {
    color: adminPalette.onSurface,
    fontWeight: '900',
  },
  filterSummaryPrimary: {
    color: adminPalette.primary,
    fontWeight: '900',
  },
  userCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminPalette.secondaryContainer,
  },
  userAvatarText: {
    color: '#582500',
    fontSize: 13,
    fontWeight: '900',
  },
  locationCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 16,
  },
  requestPill: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant,
    backgroundColor: adminPalette.surfaceLowest,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestPillActive: {
    borderColor: adminPalette.inverseSurface,
    backgroundColor: adminPalette.inverseSurface,
    ...shadow.card,
  },
  requestPillText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '800',
  },
  requestPillTextActive: {
    color: colors.white,
    fontWeight: '900',
  },
  pendingCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: adminPalette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  pendingCountText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
  },
  toolbarButton: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant,
    backgroundColor: adminPalette.surfaceLowest,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarButtonText: {
    color: adminPalette.onSurface,
    fontSize: 12,
    fontWeight: '900',
  },
  requestsTable: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '55',
    backgroundColor: adminPalette.surfaceLowest,
    overflow: 'hidden',
    marginBottom: 24,
    ...shadow.card,
  },
  requestHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: adminPalette.surfaceLow,
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
  },
  requestHeading: {
    flex: 1,
    color: adminPalette.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  requestRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
  },
  requestRowExpanded: {
    backgroundColor: adminPalette.primary + '08',
  },
  requestColumn: {
    flex: 1,
    paddingRight: 12,
  },
  requestAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminPalette.primaryFixed,
  },
  requestAvatarText: {
    color: '#431200',
    fontSize: 12,
    fontWeight: '900',
  },
  requestActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
  },
  requestIconAction: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveAction: {},
  collapseAction: {
    backgroundColor: adminPalette.primary,
  },
  expandedRequest: {
    marginHorizontal: 42,
    marginBottom: 30,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminPalette.primary + '22',
    backgroundColor: adminPalette.surfaceLowest,
    padding: 28,
    flexDirection: 'row',
    gap: 28,
    ...shadow.lifted,
  },
  expandedRequestColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: adminPalette.surfaceContainer,
    paddingRight: 24,
  },
  microHeadingPrimary: {
    color: adminPalette.primary,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 14,
  },
  messageCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '35',
    backgroundColor: adminPalette.surfaceBright,
    padding: 18,
  },
  messageText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 22,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  documentImage: {
    height: 105,
    borderRadius: 10,
    backgroundColor: adminPalette.surfaceContainer,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  documentText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '700',
  },
  ownerNotesInput: {
    height: 104,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant,
    backgroundColor: adminPalette.surfaceBright,
    padding: 14,
    color: adminPalette.onSurface,
    fontSize: 12,
    textAlignVertical: 'top',
  },
  ownerActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 18,
  },
  rejectButton: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: adminPalette.error,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  rejectButtonText: {
    color: adminPalette.error,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  approveButton: {
    borderRadius: 8,
    backgroundColor: adminPalette.primary,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  approveButtonText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  bottomBento: {
    flexDirection: 'row',
    gap: 24,
  },
  systemUpdateCard: {
    flex: 2,
    minHeight: 245,
    borderRadius: 18,
    backgroundColor: adminPalette.inverseSurface,
    padding: 32,
    overflow: 'hidden',
    ...shadow.lifted,
  },
  updateTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  updateTag: {
    color: colors.white,
    backgroundColor: adminPalette.primary,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  updateVersion: {
    color: adminPalette.primaryFixed,
    fontSize: 11,
    fontWeight: '900',
  },
  updateTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
  },
  updateCopy: {
    color: adminPalette.outlineVariant,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '600',
    maxWidth: 560,
    marginTop: 12,
  },
  updateButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: adminPalette.primary,
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: 24,
  },
  updateButtonText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  updateWatermark: {
    position: 'absolute',
    right: -20,
    bottom: -24,
  },
  velocityCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '45',
    backgroundColor: adminPalette.surfaceLowest,
    padding: 24,
    ...shadow.card,
  },
  velocityFooter: {
    borderTopWidth: 1,
    borderTopColor: adminPalette.surfaceContainer,
    marginTop: 18,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  velocityValue: {
    color: adminPalette.onSurface,
    fontSize: 28,
    fontWeight: '900',
  },
  velocityLabel: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  velocityIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminPalette.successContainer,
  },
  pagination: {
    minHeight: 60,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: adminPalette.surfaceLow,
    borderTopWidth: 1,
    borderTopColor: adminPalette.surfaceContainer,
  },
  paginationText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '800',
  },
  paginationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paginationButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminPalette.outlineVariant + '55',
    backgroundColor: adminPalette.surfaceLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNumberActive: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminPalette.primary,
  },
  pageNumberActiveText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
  },
  pageNumber: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNumberText: {
    color: adminPalette.onSurface,
    fontSize: 11,
    fontWeight: '900',
  },
  systemGrid: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  checklistRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: adminPalette.surfaceContainer,
  },
  checklistNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminPalette.surfaceContainer,
  },
  checklistNumberActive: {
    backgroundColor: adminPalette.primary,
  },
  checklistNumberText: {
    color: adminPalette.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
  },
  checklistNumberTextActive: {
    color: colors.white,
  },
  checklistText: {
    color: adminPalette.onSurface,
    fontSize: 14,
    fontWeight: '800',
  },
});
