import React, { useEffect, useMemo, useState } from 'react';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts as useInterFonts,
} from '@expo-google-fonts/inter';
import {
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  useFonts as useMontserratFonts,
} from '@expo-google-fonts/montserrat';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Users,
  UserPlus,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors } from '../../constants/colors';
import { shadow } from '../../constants/design';

type Section = 'overview' | 'spots' | 'moderation' | 'users' | 'requests' | 'system';
type WorkSection = 'spots' | 'moderation' | 'requests';
type Priority = 'urgent' | 'high' | 'normal';
type WorkStatus = 'pending' | 'investigating' | 'approved' | 'published' | 'resolved' | 'rejected' | 'dismissed';

type NavItem = {
  id: Section;
  label: string;
  icon: LucideIcon;
  count?: number;
};

type WorkItem = {
  id: string;
  section: WorkSection;
  title: string;
  subtitle: string;
  status: WorkStatus;
  priority: Priority;
  submitted: string;
  owner: string;
  summary: string;
  details: Array<{ label: string; value: string }>;
  evidence: string[];
};

type Decision = {
  item: WorkItem;
  kind: 'positive' | 'negative';
} | null;

const palette = {
  background: '#F7F5F2',
  panel: '#FFFFFF',
  panelMuted: '#F1EFEC',
  ink: '#211F1D',
  muted: '#6D6863',
  border: '#E2DDD7',
  borderStrong: '#CFC8C0',
  sidebar: '#111110',
  sidebarMuted: '#A9A39D',
  primary: '#FA5F00',
  primarySoft: '#FFF0E7',
  success: '#18864B',
  successSoft: '#E8F7EE',
  danger: '#C4323D',
  dangerSoft: '#FCECEE',
  warning: '#A46400',
  warningSoft: '#FFF4D8',
  blue: '#2C64D8',
  blueSoft: '#EAF0FE',
};

const typography = {
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  display: 'Montserrat_700Bold',
  displayStrong: 'Montserrat_800ExtraBold',
} as const;

const initialWorkItems: WorkItem[] = [
  {
    id: 'spot-001',
    section: 'spots',
    title: 'Harborlight Rooftop Cebu',
    subtitle: 'New nightlife venue · Lahug',
    status: 'pending',
    priority: 'high',
    submitted: '18 minutes ago',
    owner: 'Mika Torres',
    summary: 'A rooftop lounge submitted with reservation support, six photos, operating hours, and a pin near Cebu IT Park.',
    details: [
      { label: 'Category', value: 'Bar & Social Hub' },
      { label: 'Barangay', value: 'Lahug' },
      { label: 'Reservation', value: 'Enabled · ₱500 deposit' },
      { label: 'Popularity', value: '84 points' },
    ],
    evidence: ['6 venue photos', 'Map pin supplied', 'Business hours supplied'],
  },
  {
    id: 'spot-002',
    section: 'spots',
    title: 'Common Ground Coffee Lab',
    subtitle: 'Specialty coffee · Banilad',
    status: 'pending',
    priority: 'normal',
    submitted: '2 hours ago',
    owner: 'Paolo Lim',
    summary: 'Community submission for a newly opened coffee shop. Address and operating hours are complete; the storefront photo needs review.',
    details: [
      { label: 'Category', value: 'Specialty Coffee' },
      { label: 'Barangay', value: 'Banilad' },
      { label: 'Reservation', value: 'Not enabled' },
      { label: 'Popularity', value: '46 points' },
    ],
    evidence: ['3 venue photos', 'Map pin supplied', 'Community submitted'],
  },
  {
    id: 'spot-003',
    section: 'spots',
    title: 'Southside Food Yard',
    subtitle: 'Street food · Talisay',
    status: 'published',
    priority: 'normal',
    submitted: 'Yesterday',
    owner: 'Anne Villamor',
    summary: 'Recently published food-yard listing included to demonstrate completed queue states.',
    details: [
      { label: 'Category', value: 'Street Food' },
      { label: 'Barangay', value: 'Tabunok' },
      { label: 'Reservation', value: 'Walk-in only' },
      { label: 'Popularity', value: '91 points' },
    ],
    evidence: ['8 venue photos', 'Location verified'],
  },
  {
    id: 'report-001',
    section: 'moderation',
    title: 'Possible misleading review',
    subtitle: 'The Green Table · Review report',
    status: 'investigating',
    priority: 'urgent',
    submitted: '7 minutes ago',
    owner: 'Reported by JM',
    summary: 'The reporter says the review describes services that the venue does not offer. Compare the review, venue details, and discussion thread.',
    details: [
      { label: 'Report type', value: 'Inaccurate or misleading' },
      { label: 'Reported item', value: '1-star review' },
      { label: 'Previous reports', value: '2 related' },
      { label: 'Risk', value: 'Customer trust' },
    ],
    evidence: ['Reported review', '4 comment replies', 'Venue profile snapshot'],
  },
  {
    id: 'report-002',
    section: 'moderation',
    title: 'Incorrect map position',
    subtitle: 'Sunset Deck · Spot edit suggestion',
    status: 'pending',
    priority: 'high',
    submitted: '36 minutes ago',
    owner: 'Suggested by Clara D.',
    summary: 'A user proposed moving the venue pin 180 meters east. The sandbox detail view represents the before-and-after map evidence.',
    details: [
      { label: 'Change', value: 'Map coordinates' },
      { label: 'Distance', value: '180 meters' },
      { label: 'Confidence', value: 'High' },
      { label: 'Similar edits', value: '3 suggestions' },
    ],
    evidence: ['Current pin', 'Suggested pin', 'User explanation'],
  },
  {
    id: 'report-003',
    section: 'moderation',
    title: 'Spam promotion in comments',
    subtitle: 'Brew District · Comment thread',
    status: 'resolved',
    priority: 'normal',
    submitted: 'Yesterday',
    owner: 'Reported by AL',
    summary: 'Resolved report retained as a completed-state example for queue filtering and audit-history presentation.',
    details: [
      { label: 'Report type', value: 'Spam' },
      { label: 'Reported item', value: 'Comment' },
      { label: 'Resolution', value: 'Comment removed' },
      { label: 'Moderator', value: 'CebSpot Admin' },
    ],
    evidence: ['Comment snapshot', 'Resolution note'],
  },
  {
    id: 'request-001',
    section: 'requests',
    title: 'Ramon Uy',
    subtitle: 'Owner access · Driftwood Coffee',
    status: 'pending',
    priority: 'high',
    submitted: '24 minutes ago',
    owner: 'ramon@example.com',
    summary: 'Applicant requests access to guest reviews, reservations, venue details, and operating-hour management.',
    details: [
      { label: 'Venue', value: 'Driftwood Coffee' },
      { label: 'Barangay', value: 'Kasambagan' },
      { label: 'Requested access', value: 'Reviews, reservations, profile' },
      { label: 'Identity match', value: 'Likely match' },
    ],
    evidence: ['Government ID', 'Business permit', 'Storefront photo'],
  },
  {
    id: 'request-002',
    section: 'requests',
    title: 'Lea Fernandez',
    subtitle: 'Owner access · North Commons',
    status: 'pending',
    priority: 'normal',
    submitted: '3 hours ago',
    owner: 'lea@example.com',
    summary: 'The application is complete, but the business permit name differs slightly from the public venue name.',
    details: [
      { label: 'Venue', value: 'North Commons' },
      { label: 'Barangay', value: 'Talamban' },
      { label: 'Requested access', value: 'Full venue management' },
      { label: 'Identity match', value: 'Manual review needed' },
    ],
    evidence: ['Government ID', 'Business permit', 'Authorization letter'],
  },
  {
    id: 'request-003',
    section: 'requests',
    title: 'Marco Sy',
    subtitle: 'Owner access · District 7',
    status: 'approved',
    priority: 'normal',
    submitted: 'Sep 28',
    owner: 'marco@example.com',
    summary: 'Approved request retained as a completed-state example.',
    details: [
      { label: 'Venue', value: 'District 7' },
      { label: 'Barangay', value: 'Mabolo' },
      { label: 'Granted access', value: 'Full venue management' },
      { label: 'Reviewed by', value: 'CebSpot Admin' },
    ],
    evidence: ['Government ID', 'Business permit'],
  },
];

const users = [
  { name: 'Exiel Bolambao', email: 'exiel@example.com', role: 'Spotter', location: 'Cebu City', joined: 'Sep 13, 2026', activity: '12 minutes ago' },
  { name: 'Ramon Uy', email: 'ramon@example.com', role: 'Applicant', location: 'Kasambagan', joined: 'Oct 6, 2026', activity: '24 minutes ago' },
  { name: 'Marco Sy', email: 'marco@example.com', role: 'Owner', location: 'Mabolo', joined: 'Sep 28, 2026', activity: '1 hour ago' },
  { name: 'Clara Dela Cruz', email: 'clara@example.com', role: 'Spotter', location: 'Lahug', joined: 'Aug 18, 2026', activity: 'Yesterday' },
];

const activities = [
  { title: 'Owner access approved', copy: 'District 7 · Marco Sy', time: '09:42' },
  { title: 'Spot edit queued', copy: 'Sunset Deck · map position', time: '09:18' },
  { title: 'Reservation confirmed', copy: 'Harborlight · 4 guests', time: '08:54' },
  { title: 'Review reported', copy: 'The Green Table · misleading content', time: '08:39' },
];

const filters = ['All', 'Needs action', 'High priority', 'Completed'] as const;
type QueueFilter = (typeof filters)[number];

function isComplete(status: WorkStatus) {
  return ['approved', 'published', 'resolved', 'rejected', 'dismissed'].includes(status);
}

function statusLabel(status: WorkStatus) {
  return status.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sectionCopy(section: WorkSection) {
  if (section === 'spots') {
    return { eyebrow: 'Discovery', title: 'Spot submissions', subtitle: 'Verify new places before they become public.', positive: 'Publish spot', negative: 'Reject submission' };
  }
  if (section === 'moderation') {
    return { eyebrow: 'Trust & Safety', title: 'Moderation queue', subtitle: 'Review reports and suggested corrections by priority.', positive: 'Resolve report', negative: 'Dismiss report' };
  }
  return { eyebrow: 'People & Access', title: 'Owner requests', subtitle: 'Verify business ownership before granting management access.', positive: 'Approve access', negative: 'Reject request' };
}

export function AdminSandboxScreen() {
  const [interFontsLoaded] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const [displayFontsLoaded] = useMontserratFonts({
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });
  const router = useRouter();
  const { width } = useWindowDimensions();
  const mobile = width < 780;
  const compact = width >= 780 && width < 1080;
  const [section, setSection] = useState<Section>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('All');
  const [items, setItems] = useState(initialWorkItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const navItems: NavItem[] = useMemo(() => [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'spots', label: 'Spots', icon: MapPin, count: items.filter((item) => item.section === 'spots' && !isComplete(item.status)).length },
    { id: 'moderation', label: 'Moderation', icon: ShieldAlert, count: items.filter((item) => item.section === 'moderation' && !isComplete(item.status)).length },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'requests', label: 'Owner requests', icon: UserPlus, count: items.filter((item) => item.section === 'requests' && !isComplete(item.status)).length },
    { id: 'system', label: 'System', icon: Settings, count: 1 },
  ], [items]);

  const activeNav = navItems.find((item) => item.id === section) ?? navItems[0];

  function navigate(nextSection: Section) {
    setSection(nextSection);
    setMenuOpen(false);
    setQuery('');
    setQueueFilter('All');
    setSelectedId(null);
  }

  function openDecision(item: WorkItem, kind: 'positive' | 'negative') {
    setDecision({ item, kind });
    setDecisionNotes('');
  }

  function confirmDecision() {
    if (!decision) return;
    const { item, kind } = decision;
    const nextStatus: WorkStatus = kind === 'negative'
      ? item.section === 'moderation' ? 'dismissed' : 'rejected'
      : item.section === 'spots' ? 'published' : item.section === 'moderation' ? 'resolved' : 'approved';
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: nextStatus } : entry));
    setToast(`${item.title} updated to ${statusLabel(nextStatus)} in sandbox only.`);
    setDecision(null);
    setDecisionNotes('');
  }

  if (!interFontsLoaded || !displayFontsLoaded) {
    return <View style={[styles.screen, styles.fontLoading]}><Text style={styles.fontLoadingText}>Preparing admin workspace...</Text></View>;
  }

  return (
    <View style={styles.screen}>
      {!mobile && <Sidebar items={navItems} active={section} compact={compact} onNavigate={navigate} onExit={() => router.push('/admin')} />}
      <MobileNavigation visible={menuOpen} items={navItems} active={section} onClose={() => setMenuOpen(false)} onNavigate={navigate} />

      <View style={styles.main}>
        <Header
          mobile={mobile}
          sectionLabel={activeNav.label}
          query={query}
          onQueryChange={setQuery}
          onOpenMenu={() => setMenuOpen(true)}
          onExit={() => router.push('/admin')}
        />

        {toast && (
          <View style={styles.toast}>
            <CheckCircle2 size={18} color={palette.success} />
            <Text style={styles.toastText}>{toast}</Text>
            <Pressable accessibilityLabel="Dismiss notification" onPress={() => setToast(null)} style={styles.iconHitbox}>
              <X size={17} color={palette.muted} />
            </Pressable>
          </View>
        )}

        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, mobile && styles.contentMobile]} showsVerticalScrollIndicator={false}>
          <View style={styles.sandboxBanner}>
            <View style={styles.sandboxDot} />
            <Text style={styles.sandboxBannerText}>UI sandbox · mock data · no Supabase writes</Text>
          </View>

          {section === 'overview' && <Overview items={items} mobile={mobile} onNavigate={navigate} />}
          {(section === 'spots' || section === 'moderation' || section === 'requests') && (
            <WorkQueue
              section={section}
              items={items}
              query={query}
              filter={queueFilter}
              mobile={mobile}
              selectedId={selectedId}
              onFilter={setQueueFilter}
              onSelect={setSelectedId}
              onDecision={openDecision}
            />
          )}
          {section === 'users' && <UsersView query={query} mobile={mobile} />}
          {section === 'system' && <SystemView />}
        </ScrollView>
      </View>

      <DecisionModal
        decision={decision}
        notes={decisionNotes}
        onChangeNotes={setDecisionNotes}
        onCancel={() => setDecision(null)}
        onConfirm={confirmDecision}
      />
    </View>
  );
}

function Sidebar({ items, active, compact, onNavigate, onExit }: {
  items: NavItem[];
  active: Section;
  compact: boolean;
  onNavigate: (section: Section) => void;
  onExit: () => void;
}) {
  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <View style={styles.brand}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>C</Text></View>
        {!compact && <View><Text style={styles.brandTitle}>CebSpot Admin</Text><Text style={styles.brandSubtitle}>Operations Console</Text></View>}
      </View>

      {!compact && <Text style={styles.navGroup}>WORKSPACE</Text>}
      <View style={styles.navList}>
        {items.map((item) => {
          const Icon = item.icon;
          const selected = item.id === active;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => onNavigate(item.id)}
              style={({ pressed }) => [styles.navItem, selected && styles.navItemActive, compact && styles.navItemCompact, pressed && styles.pressed]}
            >
              <Icon size={19} color={selected ? palette.primary : '#C9C4BE'} />
              {!compact && <Text style={[styles.navItemText, selected && styles.navItemTextActive]}>{item.label}</Text>}
              {!!item.count && <View style={[styles.navCount, compact && styles.navCountCompact]}><Text style={styles.navCountText}>{item.count}</Text></View>}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sidebarFooter}>
        <View style={[styles.profileCard, compact && styles.profileCardCompact]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>CA</Text></View>
          {!compact && <View style={styles.profileCopy}><Text style={styles.profileName}>CebSpot Admin</Text><Text style={styles.profileRole}>Sandbox reviewer</Text></View>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Return to live admin" onPress={onExit} style={[styles.exitButton, compact && styles.exitButtonCompact]}>
          <LogOut size={17} color={palette.sidebarMuted} />
          {!compact && <Text style={styles.exitText}>Return to live admin</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function MobileNavigation({ visible, items, active, onClose, onNavigate }: {
  visible: boolean;
  items: NavItem[];
  active: Section;
  onClose: () => void;
  onNavigate: (section: Section) => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.drawerBackdrop}>
        <Pressable accessibilityLabel="Close navigation" onPress={onClose} style={styles.drawerScrim} />
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <View style={styles.brand}><View style={styles.brandMark}><Text style={styles.brandMarkText}>C</Text></View><Text style={styles.brandTitle}>CebSpot Admin</Text></View>
            <Pressable accessibilityLabel="Close navigation" onPress={onClose} style={styles.iconHitbox}><X size={22} color={colors.white} /></Pressable>
          </View>
          <View style={styles.navList}>
            {items.map((item) => {
              const Icon = item.icon;
              const selected = item.id === active;
              return (
                <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onNavigate(item.id)} style={[styles.navItem, selected && styles.navItemActive]}>
                  <Icon size={20} color={selected ? palette.primary : '#C9C4BE'} />
                  <Text style={[styles.navItemText, selected && styles.navItemTextActive]}>{item.label}</Text>
                  {!!item.count && <View style={styles.navCount}><Text style={styles.navCountText}>{item.count}</Text></View>}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Header({ mobile, sectionLabel, query, onQueryChange, onOpenMenu, onExit }: {
  mobile: boolean;
  sectionLabel: string;
  query: string;
  onQueryChange: (value: string) => void;
  onOpenMenu: () => void;
  onExit: () => void;
}) {
  return (
    <View style={[styles.header, mobile && styles.headerMobile]}>
      <View style={styles.headerPrimary}>
        {mobile && <Pressable accessibilityRole="button" accessibilityLabel="Open navigation" onPress={onOpenMenu} style={styles.headerIcon}><Menu size={21} color={palette.ink} /></Pressable>}
        {mobile && <Text style={styles.mobileTitle}>{sectionLabel}</Text>}
        {!mobile && (
          <View style={styles.searchBox}>
            <Search size={18} color={palette.muted} />
            <TextInput accessibilityLabel={`Search ${sectionLabel}`} value={query} onChangeText={onQueryChange} placeholder={`Search ${sectionLabel.toLowerCase()}...`} placeholderTextColor="#918B85" style={styles.searchInput} />
            {!!query && <Pressable accessibilityLabel="Clear search" onPress={() => onQueryChange('')}><X size={17} color={palette.muted} /></Pressable>}
          </View>
        )}
      </View>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh sandbox data" style={styles.headerIcon}><RefreshCw size={18} color={palette.muted} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications, four unread" style={styles.headerIcon}><Bell size={18} color={palette.muted} /><View style={styles.notificationDot} /></Pressable>
        <View style={styles.livePill}><Radio size={13} color={palette.primary} /><Text style={styles.livePillText}>Sandbox</Text></View>
        {!mobile && <Pressable accessibilityRole="button" onPress={onExit} style={styles.liveAdminButton}><Text style={styles.liveAdminText}>Live admin</Text><ArrowUpRight size={15} color={palette.ink} /></Pressable>}
      </View>
      {mobile && (
        <View style={styles.mobileSearch}>
          <Search size={17} color={palette.muted} />
          <TextInput accessibilityLabel={`Search ${sectionLabel}`} value={query} onChangeText={onQueryChange} placeholder={`Search ${sectionLabel.toLowerCase()}...`} placeholderTextColor="#918B85" style={styles.searchInput} />
        </View>
      )}
    </View>
  );
}

function Overview({ items, mobile, onNavigate }: { items: WorkItem[]; mobile: boolean; onNavigate: (section: Section) => void }) {
  const queueCards = [
    { section: 'requests' as Section, label: 'Owner requests', value: items.filter((item) => item.section === 'requests' && !isComplete(item.status)).length, helper: 'Waiting for verification', icon: UserPlus, tone: 'orange' },
    { section: 'moderation' as Section, label: 'Unresolved reports', value: items.filter((item) => item.section === 'moderation' && !isComplete(item.status)).length, helper: 'One urgent item', icon: ShieldAlert, tone: 'red' },
    { section: 'spots' as Section, label: 'Spot submissions', value: items.filter((item) => item.section === 'spots' && !isComplete(item.status)).length, helper: 'Ready for review', icon: MapPin, tone: 'blue' },
    { section: 'system' as Section, label: 'System alerts', value: 1, helper: 'Storage nearing limit', icon: AlertTriangle, tone: 'amber' },
  ];
  return (
    <View>
      <PageHeading eyebrow="Workspace" title="Operations overview" subtitle="Start with what needs attention, then review platform performance." />

      <View style={styles.queueGrid}>
        {queueCards.map((card) => {
          const Icon = card.icon;
          return (
            <Pressable key={card.label} accessibilityRole="button" onPress={() => onNavigate(card.section)} style={({ pressed }) => [styles.queueCard, pressed && styles.pressed]}>
              <View style={[styles.queueIcon, card.tone === 'red' ? styles.queueIconRed : card.tone === 'blue' ? styles.queueIconBlue : card.tone === 'amber' ? styles.queueIconAmber : styles.queueIconOrange]}>
                <Icon size={19} color={card.tone === 'red' ? palette.danger : card.tone === 'blue' ? palette.blue : card.tone === 'amber' ? palette.warning : palette.primary} />
              </View>
              <View style={styles.queueCardTop}><Text style={styles.queueCardLabel}>{card.label}</Text><ChevronRight size={17} color={palette.muted} /></View>
              <Text style={styles.queueCardValue}>{card.value}</Text>
              <Text style={styles.queueCardHelper}>{card.helper}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.overviewSplit, mobile && styles.stack]}>
        <View style={styles.performancePanel}>
          <View style={styles.panelHeader}>
            <View><Text style={styles.panelEyebrow}>LAST 7 DAYS</Text><Text style={[styles.panelTitle, styles.panelTitleInverse]}>Platform performance</Text></View>
            <View style={styles.datePill}><Clock3 size={14} color={palette.muted} /><Text style={styles.datePillText}>Oct 2–8</Text></View>
          </View>
          <View style={styles.metricRow}>
            <Metric label="Reservations" value="86" change="+12%" />
            <Metric label="Revenue" value="₱48.6k" change="+8%" />
            <Metric label="New spots" value="11" change="+22%" />
          </View>
          <View style={styles.chartArea}>
            {[34, 58, 46, 72, 63, 91, 78].map((height, index) => (
              <View key={index} style={styles.chartColumn}><View style={[styles.chartBar, { height: `${height}%` }]} /><Text style={styles.chartLabel}>{['W', 'T', 'F', 'S', 'S', 'M', 'T'][index]}</Text></View>
            ))}
          </View>
        </View>

        <View style={styles.activityPanel}>
          <View style={styles.panelHeader}><View><Text style={styles.panelEyebrow}>LIVE</Text><Text style={styles.panelTitle}>Recent activity</Text></View><View style={styles.activityLiveDot} /></View>
          {activities.map((activity) => (
            <View key={`${activity.time}-${activity.title}`} style={styles.activityRow}>
              <View style={styles.activityMark} />
              <View style={styles.activityCopy}><Text style={styles.activityTitle}>{activity.title}</Text><Text style={styles.activitySubtitle}>{activity.copy}</Text></View>
              <Text style={styles.activityTime}>{activity.time}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.healthStrip}>
        <View style={styles.healthStatus}><CheckCircle2 size={19} color={palette.success} /><View><Text style={styles.healthTitle}>All core services operational</Text><Text style={styles.healthCopy}>Supabase, reservations, storage, and anonymization are reachable.</Text></View></View>
        <Pressable accessibilityRole="button" onPress={() => onNavigate('system')} style={styles.textButton}><Text style={styles.textButtonLabel}>View system health</Text><ChevronRight size={16} color={palette.primary} /></Pressable>
      </View>
    </View>
  );
}

function Metric({ label, value, change }: { label: string; value: string; change: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricChange}>{change}</Text></View>;
}

function WorkQueue({ section, items, query, filter, mobile, selectedId, onFilter, onSelect, onDecision }: {
  section: WorkSection;
  items: WorkItem[];
  query: string;
  filter: QueueFilter;
  mobile: boolean;
  selectedId: string | null;
  onFilter: (filter: QueueFilter) => void;
  onSelect: (id: string) => void;
  onDecision: (item: WorkItem, kind: 'positive' | 'negative') => void;
}) {
  const copy = sectionCopy(section);
  const visible = items.filter((item) => {
    if (item.section !== section) return false;
    const matchesSearch = `${item.title} ${item.subtitle} ${item.owner}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFilter = filter === 'All' || (filter === 'Needs action' && !isComplete(item.status)) || (filter === 'High priority' && ['urgent', 'high'].includes(item.priority)) || (filter === 'Completed' && isComplete(item.status));
    return matchesSearch && matchesFilter;
  });
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) onSelect(selected.id);
  }, [onSelect, selected, selectedId]);

  return (
    <View>
      <PageHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} right={<View style={styles.queueSummary}><Text style={styles.queueSummaryValue}>{visible.length}</Text><Text style={styles.queueSummaryLabel}>matching</Text></View>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <View style={styles.filterLead}><Filter size={16} color={palette.muted} /><Text style={styles.filterLeadText}>Filters</Text></View>
        {filters.map((item) => (
          <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === filter }} onPress={() => onFilter(item)} style={[styles.filterPill, item === filter && styles.filterPillActive]}>
            <Text style={[styles.filterPillText, item === filter && styles.filterPillTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.queueWorkspace, mobile && styles.stack]}>
        <View style={styles.queueListPanel}>
          <View style={styles.queueListHeader}><Text style={styles.queueListTitle}>Review queue</Text><Text style={styles.queueListMeta}>Priority ordered</Text></View>
          {visible.map((item) => <QueueRow key={item.id} item={item} active={selected?.id === item.id} onPress={() => onSelect(item.id)} />)}
          {!visible.length && <EmptyState title="No matching records" copy="Try another status filter or search term." />}
        </View>
        {selected && <DetailPanel item={selected} copy={copy} onDecision={onDecision} />}
      </View>
    </View>
  );
}

function QueueRow({ item, active, onPress }: { item: WorkItem; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.queueRow, active && styles.queueRowActive, pressed && styles.pressed]}>
      <View style={styles.queueRowTop}><PriorityBadge priority={item.priority} /><StatusBadge status={item.status} /></View>
      <Text style={styles.queueRowTitle}>{item.title}</Text>
      <Text style={styles.queueRowSubtitle}>{item.subtitle}</Text>
      <View style={styles.queueRowFooter}><Text style={styles.queueRowOwner}>{item.owner}</Text><Text style={styles.queueRowTime}>{item.submitted}</Text></View>
    </Pressable>
  );
}

function DetailPanel({ item, copy, onDecision }: {
  item: WorkItem;
  copy: ReturnType<typeof sectionCopy>;
  onDecision: (item: WorkItem, kind: 'positive' | 'negative') => void;
}) {
  const complete = isComplete(item.status);
  return (
    <View style={styles.detailPanel}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderCopy}><Text style={styles.panelEyebrow}>RECORD DETAILS</Text><Text style={styles.detailTitle}>{item.title}</Text><Text style={styles.detailSubtitle}>{item.subtitle}</Text></View>
        <StatusBadge status={item.status} />
      </View>
      <Text style={styles.detailSummary}>{item.summary}</Text>
      <View style={styles.detailGrid}>
        {item.details.map((detail) => <View key={detail.label} style={styles.detailMeta}><Text style={styles.detailMetaLabel}>{detail.label}</Text><Text style={styles.detailMetaValue}>{detail.value}</Text></View>)}
      </View>
      <View style={styles.evidencePanel}>
        <View style={styles.evidenceHeader}><FileText size={17} color={palette.primary} /><Text style={styles.evidenceTitle}>Evidence and verification</Text></View>
        {item.evidence.map((evidence) => <View key={evidence} style={styles.evidenceRow}><CheckCircle2 size={15} color={palette.success} /><Text style={styles.evidenceText}>{evidence}</Text><Pressable accessibilityLabel={`Open ${evidence}`}><Text style={styles.evidenceOpen}>Open</Text></Pressable></View>)}
      </View>
      <View style={styles.timeline}>
        <Text style={styles.timelineTitle}>Activity</Text>
        <View style={styles.timelineRow}><View style={styles.timelineDot} /><View><Text style={styles.timelineEvent}>Submitted to CebSpot</Text><Text style={styles.timelineTime}>{item.submitted}</Text></View></View>
        <View style={styles.timelineRow}><View style={[styles.timelineDot, styles.timelineDotMuted]} /><View><Text style={styles.timelineEvent}>Awaiting administrator decision</Text><Text style={styles.timelineTime}>Current step</Text></View></View>
      </View>
      {complete ? (
        <View style={styles.completedCallout}><CheckCircle2 size={18} color={palette.success} /><Text style={styles.completedText}>This record is complete. The activity remains available for audit review.</Text></View>
      ) : (
        <View style={styles.detailActions}>
          <Pressable accessibilityRole="button" onPress={() => onDecision(item, 'negative')} style={styles.secondaryAction}><XCircle size={17} color={palette.danger} /><Text style={styles.secondaryActionText}>{copy.negative}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => onDecision(item, 'positive')} style={styles.primaryAction}><CheckCircle2 size={17} color={colors.white} /><Text style={styles.primaryActionText}>{copy.positive}</Text></Pressable>
        </View>
      )}
    </View>
  );
}

function UsersView({ query, mobile }: { query: string; mobile: boolean }) {
  const visible = users.filter((user) => `${user.name} ${user.email} ${user.role} ${user.location}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <View>
      <PageHeading eyebrow="People" title="Users" subtitle="Search profiles, inspect roles, and review recent account activity." right={<Pressable style={styles.primarySmall}><UserPlus size={16} color={colors.white} /><Text style={styles.primarySmallText}>Invite user</Text></Pressable>} />
      <View style={styles.userStats}><MiniStat label="Total profiles" value="1,284" /><MiniStat label="Active owners" value="46" /><MiniStat label="New this week" value="38" /></View>
      <View style={styles.usersPanel}>
        {!mobile && <View style={styles.userHeader}><Text style={[styles.userHeading, styles.userNameColumn]}>USER</Text><Text style={styles.userHeading}>ROLE</Text><Text style={styles.userHeading}>LOCATION</Text><Text style={styles.userHeading}>JOINED</Text><Text style={styles.userHeading}>LAST ACTIVE</Text></View>}
        {visible.map((user) => (
          <View key={user.email} style={[styles.userRow, mobile && styles.userRowMobile]}>
            <View style={[styles.userIdentity, !mobile && styles.userNameColumn]}><View style={styles.userAvatar}><Text style={styles.userAvatarText}>{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</Text></View><View><Text style={styles.userName}>{user.name}</Text><Text style={styles.userEmail}>{user.email}</Text></View></View>
            {mobile ? <View style={styles.userMobileMeta}><StatusPill label={user.role} /><Text style={styles.userCell}>{user.location}</Text><Text style={styles.userCell}>{user.activity}</Text></View> : <><View style={styles.userCellWrap}><StatusPill label={user.role} /></View><Text style={styles.userCell}>{user.location}</Text><Text style={styles.userCell}>{user.joined}</Text><Text style={styles.userCell}>{user.activity}</Text></>}
          </View>
        ))}
      </View>
    </View>
  );
}

function SystemView() {
  const services = [
    { name: 'Supabase database', status: 'Operational', detail: '542 ms average latency' },
    { name: 'Authentication', status: 'Operational', detail: 'No incidents detected' },
    { name: 'Image anonymization', status: 'Operational', detail: '12 jobs processed today' },
    { name: 'Storage capacity', status: 'Attention', detail: '78% of allocation used' },
  ];
  return (
    <View>
      <PageHeading eyebrow="Operations" title="System health" subtitle="Technical status, capacity, integrations, and administrative audit activity." />
      <View style={styles.systemGrid}>
        {services.map((service) => (
          <View key={service.name} style={styles.serviceCard}><View style={styles.serviceTop}><View style={[styles.serviceIcon, service.status === 'Attention' && styles.serviceIconWarning]}>{service.status === 'Attention' ? <AlertTriangle size={19} color={palette.warning} /> : <CheckCircle2 size={19} color={palette.success} />}</View><StatusPill label={service.status} warning={service.status === 'Attention'} /></View><Text style={styles.serviceName}>{service.name}</Text><Text style={styles.serviceDetail}>{service.detail}</Text></View>
        ))}
      </View>
      <View style={styles.auditPanel}>
        <View style={styles.panelHeader}><View><Text style={styles.panelEyebrow}>AUDIT TRAIL</Text><Text style={styles.panelTitle}>Recent administrator activity</Text></View><Pressable style={styles.textButton}><Text style={styles.textButtonLabel}>Export log</Text><ArrowUpRight size={15} color={palette.primary} /></Pressable></View>
        {activities.map((activity) => <View key={activity.title} style={styles.auditRow}><View style={styles.auditIcon}><FileText size={16} color={palette.primary} /></View><View style={styles.activityCopy}><Text style={styles.activityTitle}>{activity.title}</Text><Text style={styles.activitySubtitle}>{activity.copy}</Text></View><Text style={styles.activityTime}>{activity.time}</Text></View>)}
      </View>
    </View>
  );
}

function DecisionModal({ decision, notes, onChangeNotes, onCancel, onConfirm }: {
  decision: Decision;
  notes: string;
  onChangeNotes: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!decision) return null;
  const copy = sectionCopy(decision.item.section);
  const negative = decision.kind === 'negative';
  const actionLabel = negative ? copy.negative : copy.positive;
  const needsReason = negative && !notes.trim();
  return (
    <Modal animationType="fade" transparent visible onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <Pressable accessibilityLabel="Close confirmation" onPress={onCancel} style={styles.modalScrim} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><View style={[styles.modalIcon, negative ? styles.modalIconDanger : styles.modalIconSuccess]}>{negative ? <XCircle size={24} color={palette.danger} /> : <CheckCircle2 size={24} color={palette.success} />}</View><View style={styles.modalHeadingCopy}><Text style={styles.panelEyebrow}>SANDBOX DECISION</Text><Text style={styles.modalTitle}>{actionLabel}?</Text></View><Pressable accessibilityLabel="Close confirmation" onPress={onCancel} style={styles.iconHitbox}><X size={20} color={palette.muted} /></Pressable></View>
          <Text style={styles.modalCopy}>This updates only local mock data for <Text style={styles.modalStrong}>{decision.item.title}</Text>. Production records will not change.</Text>
          <Text style={styles.inputLabel}>{negative ? 'Decision reason (required)' : 'Internal notes (optional)'}</Text>
          <TextInput multiline value={notes} onChangeText={onChangeNotes} placeholder={negative ? 'Explain the decision...' : 'Add verification notes...'} placeholderTextColor="#918B85" style={styles.notesInput} />
          {needsReason && <Text style={styles.validationText}>Add a reason before continuing.</Text>}
          <View style={styles.modalActions}><Pressable onPress={onCancel} style={styles.modalCancel}><Text style={styles.modalCancelText}>Cancel</Text></Pressable><Pressable disabled={needsReason} onPress={onConfirm} style={[styles.modalConfirm, negative && styles.modalConfirmDanger, needsReason && styles.disabled]}><Text style={styles.modalConfirmText}>{actionLabel}</Text></Pressable></View>
        </View>
      </View>
    </Modal>
  );
}

function PageHeading({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle: string; right?: React.ReactNode }) {
  return <View style={styles.pageHeading}><View style={styles.pageHeadingCopy}><Text style={styles.pageEyebrow}>{eyebrow}</Text><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View>{right}</View>;
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <View style={[styles.priorityBadge, priority === 'urgent' ? styles.priorityUrgent : priority === 'high' ? styles.priorityHigh : styles.priorityNormal]}><Text style={[styles.priorityText, priority === 'urgent' ? styles.priorityTextUrgent : priority === 'high' ? styles.priorityTextHigh : styles.priorityTextNormal]}>{priority}</Text></View>;
}

function StatusBadge({ status }: { status: WorkStatus }) {
  const complete = isComplete(status);
  return <View style={[styles.statusBadge, complete ? styles.statusComplete : status === 'investigating' ? styles.statusInvestigating : styles.statusPending]}><Text style={[styles.statusText, complete ? styles.statusTextComplete : status === 'investigating' ? styles.statusTextInvestigating : styles.statusTextPending]}>{statusLabel(status)}</Text></View>;
}

function StatusPill({ label, warning = false }: { label: string; warning?: boolean }) {
  return <View style={[styles.simplePill, warning && styles.simplePillWarning]}><Text style={[styles.simplePillText, warning && styles.simplePillTextWarning]}>{label}</Text></View>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.miniStat}><Text style={styles.miniStatLabel}>{label}</Text><Text style={styles.miniStatValue}>{value}</Text></View>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <View style={styles.emptyState}><Search size={25} color={palette.borderStrong} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyCopy}>{copy}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: '100%', flexDirection: 'row', backgroundColor: palette.background },
  fontLoading: { alignItems: 'center', justifyContent: 'center' },
  fontLoadingText: { color: palette.muted, fontFamily: typography.medium, fontSize: 13 },
  main: { flex: 1, minWidth: 0 },
  sidebar: { width: 248, backgroundColor: palette.sidebar, paddingHorizontal: 14, paddingVertical: 20 },
  sidebarCompact: { width: 82, paddingHorizontal: 10 },
  brand: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 8 },
  brandMark: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontFamily: typography.displayStrong, fontSize: 16 },
  brandTitle: { color: colors.white, fontFamily: typography.display, fontSize: 14, letterSpacing: -0.25 },
  brandSubtitle: { color: palette.sidebarMuted, fontFamily: typography.medium, fontSize: 10, lineHeight: 14, marginTop: 2 },
  navGroup: { color: '#79736D', fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.5, marginTop: 26, marginBottom: 10, marginLeft: 12 },
  navList: { gap: 6, marginTop: 14 },
  navItem: { minHeight: 46, borderRadius: 11, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  navItemActive: { backgroundColor: '#2B1C14', borderLeftWidth: 3, borderLeftColor: palette.primary },
  navItemCompact: { justifyContent: 'center', paddingHorizontal: 0 },
  navItemText: { flex: 1, color: '#D3CEC8', fontFamily: typography.semibold, fontSize: 13, lineHeight: 18 },
  navItemTextActive: { color: colors.white },
  navCount: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  navCountCompact: { position: 'absolute', top: 4, right: 3, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3 },
  navCountText: { color: colors.white, fontFamily: typography.bold, fontSize: 10, fontVariant: ['tabular-nums'] },
  sidebarFooter: { marginTop: 'auto', gap: 10 },
  profileCard: { borderRadius: 12, backgroundColor: '#1D1C1A', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileCardCompact: { justifyContent: 'center', paddingHorizontal: 5 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontFamily: typography.bold, fontSize: 11 },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { color: colors.white, fontFamily: typography.semibold, fontSize: 11 },
  profileRole: { color: palette.sidebarMuted, fontFamily: typography.body, fontSize: 9, lineHeight: 13, marginTop: 2 },
  exitButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11 },
  exitButtonCompact: { justifyContent: 'center' },
  exitText: { color: palette.sidebarMuted, fontFamily: typography.semibold, fontSize: 11 },
  header: { minHeight: 72, backgroundColor: palette.panel, borderBottomWidth: 1, borderBottomColor: palette.border, paddingHorizontal: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  headerMobile: { minHeight: 118, paddingHorizontal: 14, paddingVertical: 10, flexWrap: 'wrap', alignContent: 'center', gap: 8 },
  headerPrimary: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { width: '100%', maxWidth: 560, minHeight: 42, borderWidth: 1, borderColor: palette.borderStrong, borderRadius: 10, backgroundColor: '#FBFAF9', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, minHeight: 40, color: palette.ink, fontFamily: typography.body, fontSize: 13, outlineStyle: 'none' } as any,
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationDot: { position: 'absolute', right: 8, top: 7, width: 7, height: 7, borderRadius: 4, backgroundColor: palette.primary, borderWidth: 1.5, borderColor: colors.white },
  livePill: { minHeight: 34, borderRadius: 17, backgroundColor: palette.primarySoft, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  livePillText: { color: palette.primary, fontFamily: typography.bold, fontSize: 10, letterSpacing: 0.1 },
  liveAdminButton: { minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveAdminText: { color: palette.ink, fontFamily: typography.semibold, fontSize: 11 },
  mobileTitle: { color: palette.ink, fontFamily: typography.display, fontSize: 15, lineHeight: 20, letterSpacing: -0.25 },
  mobileSearch: { width: '100%', minHeight: 42, borderWidth: 1, borderColor: palette.borderStrong, borderRadius: 10, backgroundColor: '#FBFAF9', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 1580, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 20, paddingBottom: 60 },
  contentMobile: { paddingHorizontal: 14, paddingTop: 14 },
  sandboxBanner: { alignSelf: 'flex-start', minHeight: 30, borderRadius: 15, backgroundColor: '#EEEAE5', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 22 },
  sandboxDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.primary },
  sandboxBannerText: { color: palette.muted, fontFamily: typography.semibold, fontSize: 10, letterSpacing: 0.1 },
  pageHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, marginBottom: 24 },
  pageHeadingCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 260 },
  pageEyebrow: { color: palette.primary, fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  pageTitle: { color: palette.ink, fontFamily: typography.displayStrong, fontSize: 31, lineHeight: 39, letterSpacing: -0.85 },
  pageSubtitle: { color: palette.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginTop: 4 },
  queueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 18 },
  queueCard: { flexGrow: 1, flexBasis: 220, minWidth: 210, borderRadius: 15, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, padding: 16, ...shadow.card },
  queueIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  queueIconOrange: { backgroundColor: palette.primarySoft },
  queueIconRed: { backgroundColor: palette.dangerSoft },
  queueIconBlue: { backgroundColor: palette.blueSoft },
  queueIconAmber: { backgroundColor: palette.warningSoft },
  queueCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  queueCardLabel: { color: palette.muted, fontFamily: typography.semibold, fontSize: 11, lineHeight: 16 },
  queueCardValue: { color: palette.ink, fontFamily: typography.extraBold, fontSize: 31, lineHeight: 37, letterSpacing: -0.7, fontVariant: ['tabular-nums'], marginTop: 8 },
  queueCardHelper: { color: palette.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
  overviewSplit: { flexDirection: 'row', gap: 16, marginBottom: 18 },
  stack: { flexDirection: 'column' },
  performancePanel: { flex: 1.65, minWidth: 0, minHeight: 350, borderRadius: 16, backgroundColor: palette.sidebar, padding: 20, overflow: 'hidden' },
  activityPanel: { flex: 1, minWidth: 290, borderRadius: 16, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, padding: 20 },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 17 },
  panelEyebrow: { color: palette.primary, fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.25, marginBottom: 6 },
  panelTitle: { color: palette.ink, fontFamily: typography.display, fontSize: 17, lineHeight: 23, letterSpacing: -0.35 },
  panelTitleInverse: { color: colors.white },
  datePill: { minHeight: 31, borderRadius: 16, backgroundColor: '#FFFFFF13', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  datePillText: { color: '#CFC9C3', fontFamily: typography.semibold, fontSize: 10, fontVariant: ['tabular-nums'] },
  metricRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  metric: { flex: 1, borderLeftWidth: 1, borderLeftColor: '#FFFFFF1F', paddingLeft: 12 },
  metricLabel: { color: '#AFA9A3', fontFamily: typography.medium, fontSize: 10, lineHeight: 14 },
  metricValue: { color: colors.white, fontFamily: typography.extraBold, fontSize: 23, lineHeight: 29, letterSpacing: -0.55, fontVariant: ['tabular-nums'], marginTop: 3 },
  metricChange: { color: '#6ED79B', fontFamily: typography.bold, fontSize: 10, fontVariant: ['tabular-nums'], marginTop: 2 },
  chartArea: { height: 188, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 12 },
  chartColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  chartBar: { width: '70%', minWidth: 12, maxWidth: 44, borderRadius: 7, backgroundColor: palette.primary },
  chartLabel: { color: '#928C86', fontFamily: typography.semibold, fontSize: 9 },
  activityLiveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.success, marginTop: 5 },
  activityRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: palette.border },
  activityMark: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.primary },
  activityCopy: { flex: 1, minWidth: 0 },
  activityTitle: { color: palette.ink, fontFamily: typography.semibold, fontSize: 11, lineHeight: 15 },
  activitySubtitle: { color: palette.muted, fontFamily: typography.body, fontSize: 9, lineHeight: 13, marginTop: 3 },
  activityTime: { color: palette.muted, fontFamily: typography.medium, fontSize: 9, fontVariant: ['tabular-nums'] },
  healthStrip: { borderRadius: 14, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  healthStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  healthTitle: { color: palette.ink, fontFamily: typography.semibold, fontSize: 12, lineHeight: 17 },
  healthCopy: { color: palette.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 2 },
  textButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 8 },
  textButtonLabel: { color: palette.primary, fontFamily: typography.bold, fontSize: 11 },
  queueSummary: { borderRadius: 12, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  queueSummaryValue: { color: palette.ink, fontFamily: typography.extraBold, fontSize: 17, fontVariant: ['tabular-nums'] },
  queueSummaryLabel: { color: palette.muted, fontFamily: typography.medium, fontSize: 9 },
  filterRow: { alignItems: 'center', gap: 8, paddingBottom: 16 },
  filterLead: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 2 },
  filterLeadText: { color: palette.muted, fontFamily: typography.semibold, fontSize: 11 },
  filterPill: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: palette.borderStrong, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.panel },
  filterPillActive: { backgroundColor: palette.sidebar, borderColor: palette.sidebar },
  filterPillText: { color: palette.muted, fontFamily: typography.semibold, fontSize: 11 },
  filterPillTextActive: { color: colors.white },
  queueWorkspace: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  queueListPanel: { flex: 0.9, minWidth: 280, borderRadius: 15, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' },
  queueListHeader: { minHeight: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.border },
  queueListTitle: { color: palette.ink, fontFamily: typography.bold, fontSize: 13, lineHeight: 18 },
  queueListMeta: { color: palette.muted, fontFamily: typography.medium, fontSize: 9 },
  queueRow: { padding: 15, borderBottomWidth: 1, borderBottomColor: palette.border, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  queueRowActive: { backgroundColor: palette.primarySoft, borderLeftColor: palette.primary },
  queueRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  queueRowTitle: { color: palette.ink, fontFamily: typography.bold, fontSize: 13, lineHeight: 18, letterSpacing: -0.1 },
  queueRowSubtitle: { color: palette.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 3 },
  queueRowFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  queueRowOwner: { flex: 1, color: palette.muted, fontFamily: typography.medium, fontSize: 9 },
  queueRowTime: { color: palette.muted, fontFamily: typography.medium, fontSize: 9, fontVariant: ['tabular-nums'] },
  detailPanel: { flex: 1.35, minWidth: 0, borderRadius: 15, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, padding: 20, ...shadow.card },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  detailHeaderCopy: { flex: 1 },
  detailTitle: { color: palette.ink, fontFamily: typography.display, fontSize: 20, lineHeight: 27, letterSpacing: -0.45 },
  detailSubtitle: { color: palette.muted, fontFamily: typography.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
  detailSummary: { color: palette.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 20, marginVertical: 17 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailMeta: { flexGrow: 1, flexBasis: 150, minHeight: 65, borderRadius: 10, backgroundColor: palette.panelMuted, padding: 11 },
  detailMetaLabel: { color: palette.muted, fontFamily: typography.bold, fontSize: 8, letterSpacing: 0.75, textTransform: 'uppercase' },
  detailMetaValue: { color: palette.ink, fontFamily: typography.semibold, fontSize: 11, lineHeight: 16, marginTop: 7 },
  evidencePanel: { borderRadius: 12, borderWidth: 1, borderColor: palette.border, padding: 13, marginTop: 15 },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  evidenceTitle: { color: palette.ink, fontFamily: typography.bold, fontSize: 11 },
  evidenceRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: palette.border },
  evidenceText: { flex: 1, color: palette.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 15 },
  evidenceOpen: { color: palette.primary, fontFamily: typography.bold, fontSize: 9 },
  timeline: { marginTop: 16 },
  timelineTitle: { color: palette.ink, fontFamily: typography.bold, fontSize: 11, marginBottom: 10 },
  timelineRow: { flexDirection: 'row', gap: 9, minHeight: 44 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.primary, marginTop: 2 },
  timelineDotMuted: { backgroundColor: palette.borderStrong },
  timelineEvent: { color: palette.ink, fontFamily: typography.semibold, fontSize: 10, lineHeight: 14 },
  timelineTime: { color: palette.muted, fontFamily: typography.body, fontSize: 9, lineHeight: 13, marginTop: 2 },
  completedCallout: { borderRadius: 10, backgroundColor: palette.successSoft, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 },
  completedText: { flex: 1, color: palette.success, fontFamily: typography.semibold, fontSize: 10, lineHeight: 15 },
  detailActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 9, paddingTop: 15, borderTopWidth: 1, borderTopColor: palette.border },
  secondaryAction: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#E5B9BD', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryActionText: { color: palette.danger, fontFamily: typography.bold, fontSize: 11 },
  primaryAction: { minHeight: 44, borderRadius: 10, backgroundColor: palette.primary, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryActionText: { color: colors.white, fontFamily: typography.bold, fontSize: 11 },
  priorityBadge: { minHeight: 22, borderRadius: 11, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  priorityUrgent: { backgroundColor: palette.dangerSoft },
  priorityHigh: { backgroundColor: palette.warningSoft },
  priorityNormal: { backgroundColor: palette.panelMuted },
  priorityText: { fontFamily: typography.bold, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.45 },
  priorityTextUrgent: { color: palette.danger },
  priorityTextHigh: { color: palette.warning },
  priorityTextNormal: { color: palette.muted },
  statusBadge: { minHeight: 23, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  statusPending: { backgroundColor: palette.primarySoft },
  statusInvestigating: { backgroundColor: palette.blueSoft },
  statusComplete: { backgroundColor: palette.successSoft },
  statusText: { fontFamily: typography.bold, fontSize: 8 },
  statusTextPending: { color: palette.primary },
  statusTextInvestigating: { color: palette.blue },
  statusTextComplete: { color: palette.success },
  primarySmall: { minHeight: 40, borderRadius: 9, backgroundColor: palette.primary, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  primarySmallText: { color: colors.white, fontFamily: typography.bold, fontSize: 11 },
  userStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  miniStat: { flexGrow: 1, flexBasis: 180, borderRadius: 13, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, padding: 15 },
  miniStatLabel: { color: palette.muted, fontFamily: typography.medium, fontSize: 10 },
  miniStatValue: { color: palette.ink, fontFamily: typography.extraBold, fontSize: 23, lineHeight: 29, letterSpacing: -0.5, fontVariant: ['tabular-nums'], marginTop: 4 },
  usersPanel: { borderRadius: 15, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' },
  userHeader: { minHeight: 46, backgroundColor: palette.panelMuted, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 12 },
  userHeading: { flex: 1, color: palette.muted, fontFamily: typography.bold, fontSize: 8, letterSpacing: 0.8 },
  userNameColumn: { flex: 1.5 },
  userRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 12, borderTopWidth: 1, borderTopColor: palette.border },
  userRowMobile: { alignItems: 'flex-start', flexDirection: 'column', paddingVertical: 14 },
  userIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  userAvatar: { width: 35, height: 35, borderRadius: 18, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: palette.primary, fontFamily: typography.bold, fontSize: 10 },
  userName: { color: palette.ink, fontFamily: typography.semibold, fontSize: 11, lineHeight: 15 },
  userEmail: { color: palette.muted, fontFamily: typography.body, fontSize: 9, lineHeight: 13, marginTop: 2 },
  userCellWrap: { flex: 1 },
  userCell: { flex: 1, color: palette.muted, fontFamily: typography.medium, fontSize: 10, lineHeight: 15 },
  userMobileMeta: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  simplePill: { alignSelf: 'flex-start', minHeight: 24, borderRadius: 12, backgroundColor: palette.panelMuted, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  simplePillWarning: { backgroundColor: palette.warningSoft },
  simplePillText: { color: palette.ink, fontFamily: typography.bold, fontSize: 8 },
  simplePillTextWarning: { color: palette.warning },
  systemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginBottom: 17 },
  serviceCard: { flexGrow: 1, flexBasis: 220, borderRadius: 14, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, padding: 16 },
  serviceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  serviceIcon: { width: 37, height: 37, borderRadius: 11, backgroundColor: palette.successSoft, alignItems: 'center', justifyContent: 'center' },
  serviceIconWarning: { backgroundColor: palette.warningSoft },
  serviceName: { color: palette.ink, fontFamily: typography.bold, fontSize: 12, lineHeight: 17 },
  serviceDetail: { color: palette.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 4 },
  auditPanel: { borderRadius: 15, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, padding: 18 },
  auditRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, borderTopColor: palette.border },
  auditIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyState: { minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { color: palette.ink, fontFamily: typography.display, fontSize: 14, lineHeight: 20, marginTop: 10 },
  emptyCopy: { color: palette.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 4 },
  toast: { position: 'absolute', zIndex: 30, top: 84, right: 24, maxWidth: 430, minHeight: 48, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, ...shadow.lifted },
  toastText: { flex: 1, color: palette.ink, fontFamily: typography.medium, fontSize: 11, lineHeight: 16 },
  iconHitbox: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  drawerBackdrop: { flex: 1, flexDirection: 'row' },
  drawerScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0000007A' },
  drawer: { width: 288, height: '100%', backgroundColor: palette.sidebar, padding: 16, ...shadow.lifted },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#17151399' },
  modalCard: { width: '100%', maxWidth: 520, borderRadius: 17, backgroundColor: palette.panel, padding: 20, ...shadow.lifted },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  modalIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  modalIconSuccess: { backgroundColor: palette.successSoft },
  modalIconDanger: { backgroundColor: palette.dangerSoft },
  modalHeadingCopy: { flex: 1 },
  modalTitle: { color: palette.ink, fontFamily: typography.display, fontSize: 20, lineHeight: 27, letterSpacing: -0.4 },
  modalCopy: { color: palette.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 20, marginVertical: 18 },
  modalStrong: { color: palette.ink, fontFamily: typography.bold },
  inputLabel: { color: palette.ink, fontFamily: typography.semibold, fontSize: 10, marginBottom: 7 },
  notesInput: { minHeight: 104, borderRadius: 11, borderWidth: 1, borderColor: palette.borderStrong, backgroundColor: '#FBFAF9', color: palette.ink, padding: 12, fontFamily: typography.body, fontSize: 12, lineHeight: 19, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  validationText: { color: palette.danger, fontFamily: typography.medium, fontSize: 9, marginTop: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 18 },
  modalCancel: { minHeight: 42, borderRadius: 9, borderWidth: 1, borderColor: palette.borderStrong, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { color: palette.ink, fontFamily: typography.semibold, fontSize: 11 },
  modalConfirm: { minHeight: 42, borderRadius: 9, backgroundColor: palette.success, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' },
  modalConfirmDanger: { backgroundColor: palette.danger },
  modalConfirmText: { color: colors.white, fontFamily: typography.bold, fontSize: 11 },
  disabled: { opacity: 0.45 },
});
