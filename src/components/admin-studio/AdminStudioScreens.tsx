import React, { useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';
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

const palette = {
  orange: '#FF5A1F',
  orangeDark: '#D9400B',
  orangeSoft: '#FFF0E9',
  ink: '#181716',
  sidebar: '#151413',
  sidebarSoft: '#24211F',
  canvas: '#F6F4F1',
  surface: '#FFFFFF',
  surfaceMuted: '#F0EDEA',
  border: '#DED8D2',
  borderStrong: '#C8C0B8',
  muted: '#6B6560',
  subtle: '#958E87',
  green: '#168653',
  greenSoft: '#E7F7EF',
  red: '#C43D43',
  redSoft: '#FCEBEC',
  amber: '#A66708',
  amberSoft: '#FFF2D8',
  blue: '#315ECA',
  blueSoft: '#EAF0FF',
};

const type = {
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  display: 'Montserrat_700Bold',
  displayStrong: 'Montserrat_800ExtraBold',
} as const;

type Section = 'overview' | 'spots' | 'reports' | 'users' | 'requests' | 'system';
type QueueSection = 'spots' | 'reports' | 'requests';
type QueueStatus = 'Pending' | 'Investigating' | 'Approved' | 'Resolved' | 'Rejected';

type QueueItem = {
  id: string;
  section: QueueSection;
  title: string;
  context: string;
  owner: string;
  time: string;
  priority: 'Urgent' | 'High' | 'Normal';
  status: QueueStatus;
  description: string;
};

const initialQueue: QueueItem[] = [
  { id: 'r1', section: 'reports', title: 'Misleading accessibility details', context: 'The Green Table · Banilad', owner: 'Reported by Ana C.', time: '8 min ago', priority: 'Urgent', status: 'Investigating', description: 'The listing claims step-free access, but the uploaded evidence shows a raised entrance without a ramp.' },
  { id: 'o1', section: 'requests', title: 'Ramon Uy', context: 'Driftwood Coffee · Owner access', owner: 'ramon@example.com', time: '24 min ago', priority: 'High', status: 'Pending', description: 'Ownership request includes a business permit, matching storefront photo, and verified contact number.' },
  { id: 's1', section: 'spots', title: 'Harborlight Rooftop', context: 'Lahug · New spot submission', owner: 'Submitted by Mika T.', time: '42 min ago', priority: 'High', status: 'Pending', description: 'New nightlife venue with complete hours, location pin, six photos, and reservation information.' },
  { id: 'r2', section: 'reports', title: 'Duplicate venue listing', context: 'North Commons · Talamban', owner: 'Reported by Paolo L.', time: '2 hr ago', priority: 'Normal', status: 'Pending', description: 'A newly submitted listing appears to duplicate an existing venue with a slightly different name.' },
  { id: 'o2', section: 'requests', title: 'Lea Fernandez', context: 'North Commons · Owner access', owner: 'lea@example.com', time: '3 hr ago', priority: 'Normal', status: 'Pending', description: 'The request has a matching email domain but the business permit still needs manual verification.' },
  { id: 's2', section: 'spots', title: 'Common Ground Coffee Lab', context: 'Banilad · New spot submission', owner: 'Submitted by Paolo L.', time: '5 hr ago', priority: 'Normal', status: 'Approved', description: 'Specialty coffee venue with complete listing information and verified map location.' },
];

const navItems: Array<{ id: Section; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'spots', label: 'Spots', icon: MapPin },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'requests', label: 'Owner requests', icon: UserPlus },
  { id: 'system', label: 'System', icon: Settings },
];

const activity = [
  ['Owner access approved', 'Marco Sy · District 7', '09:42'],
  ['Spot edit queued', 'Sunset Deck · map position', '09:18'],
  ['Reservation confirmed', 'Harborlight · 4 guests', '08:54'],
  ['Review reported', 'The Green Table · content', '08:39'],
];

const categoryLeaderboard = [
  { label: 'Street Food', value: 14 },
  { label: 'Outdoor', value: 11 },
  { label: 'Restaurant', value: 11 },
  { label: 'Specialty Coffee', value: 11 },
  { label: 'Cafe', value: 10 },
];

const barangayLeaderboard = [
  { label: 'Apas', value: 7 },
  { label: 'Kamputhaw', value: 6 },
  { label: 'Luz', value: 5 },
  { label: 'Banilad', value: 4 },
  { label: 'Mabolo', value: 4 },
];

function useStudioFonts() {
  const [inter] = useInterFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const [montserrat] = useMontserratFonts({ Montserrat_700Bold, Montserrat_800ExtraBold });
  return inter && montserrat;
}

function LoadingScreen() {
  return <View style={styles.loading}><Text style={styles.loadingText}>Preparing CebSpot Admin...</Text></View>;
}

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>C</Text></View>
      <View><Text style={[styles.brandName, dark && styles.textWhite]}>CebSpot Admin</Text><Text style={[styles.brandTag, dark && styles.textSidebarMuted]}>Operations Console</Text></View>
    </View>
  );
}

export function AdminStudioLanding() {
  const fontsLoaded = useStudioFonts();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const mobile = width < 820;
  if (!fontsLoaded) return <LoadingScreen />;

  return (
    <ScrollView style={styles.landingScreen} contentContainerStyle={styles.landingContent}>
      <View style={styles.landingNav}>
        <Brand />
        {!mobile && <View style={styles.landingNavLinks}><Text style={styles.landingNavLink}>Platform</Text><Text style={styles.landingNavLink}>Workflow</Text><Text style={styles.landingNavLink}>Security</Text></View>}
        <Pressable onPress={() => router.push('/admin-studio/login')} style={styles.outlineButton}><LockKeyhole size={15} color={palette.ink} /><Text style={styles.outlineButtonText}>Admin sign in</Text></Pressable>
      </View>

      <View style={[styles.hero, mobile && styles.stack]}>
        <View style={styles.heroCopy}>
          <View style={styles.previewPill}><View style={styles.previewDot} /><Text style={styles.previewPillText}>CONCEPT B · LEGACY ADMIN ENHANCED</Text></View>
          <Text style={[styles.heroTitle, mobile && styles.heroTitleMobile]}>Operate CebSpot with clarity.</Text>
          <Text style={styles.heroSubtitle}>One focused workspace for discovery, trust and safety, owner verification, and platform health.</Text>
          <View style={[styles.heroActions, mobile && styles.actionsMobile]}>
            <Pressable onPress={() => router.push('/admin-studio/login')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Open admin console</Text><ArrowRight size={17} color="#FFFFFF" /></Pressable>
            <Pressable onPress={() => router.push('/admin-studio/dashboard')} style={styles.ghostButton}><Text style={styles.ghostButtonText}>Preview dashboard</Text></Pressable>
          </View>
          <View style={styles.trustRow}><ShieldCheck size={17} color={palette.green} /><Text style={styles.trustText}>Role-protected access · auditable decisions · live operational signals</Text></View>
        </View>

        <View style={styles.heroVisual}>
          <View style={styles.visualTop}><View><Text style={styles.visualEyebrow}>TODAY'S FOCUS</Text><Text style={styles.visualTitle}>Operations pulse</Text></View><View style={styles.liveBadge}><Radio size={12} color={palette.orange} /><Text style={styles.liveBadgeText}>Live</Text></View></View>
          <View style={styles.visualMetricRow}><VisualMetric value="6" label="Need action" tone="orange" /><VisualMetric value="98.7%" label="Service health" tone="green" /><VisualMetric value="4m" label="Response time" tone="blue" /></View>
          <View style={styles.visualQueue}>
            <Text style={styles.visualQueueTitle}>Priority queue</Text>
            {initialQueue.slice(0, 3).map((item) => <View key={item.id} style={styles.visualQueueRow}><View style={[styles.priorityBar, item.priority === 'Urgent' && styles.priorityBarUrgent]} /><View style={styles.visualQueueCopy}><Text style={styles.visualQueueName}>{item.title}</Text><Text style={styles.visualQueueMeta}>{item.context}</Text></View><ChevronRight size={16} color={palette.subtle} /></View>)}
          </View>
        </View>
      </View>

      <View style={[styles.valueStrip, mobile && styles.valueStripMobile]}>
        <ValueItem icon={Sparkles} title="Priority-first" copy="See what needs attention before metrics." />
        <ValueItem icon={ShieldCheck} title="Decision-ready" copy="Evidence and actions stay in one review flow." />
        <ValueItem icon={Activity} title="Operationally aware" copy="Health signals remain visible without taking over." />
      </View>

      <View style={styles.landingFooter}><Text style={styles.footerText}>CebSpot Admin Studio · Local UI preview only</Text><Pressable onPress={() => router.push('/admin-sandbox')}><Text style={styles.footerLink}>View Concept A</Text></Pressable></View>
    </ScrollView>
  );
}

function VisualMetric({ value, label, tone }: { value: string; label: string; tone: 'orange' | 'green' | 'blue' }) {
  return <View style={styles.visualMetric}><View style={[styles.visualMetricIcon, tone === 'green' && styles.iconGreen, tone === 'blue' && styles.iconBlue]}><TrendingUp size={15} color={tone === 'green' ? palette.green : tone === 'blue' ? palette.blue : palette.orange} /></View><Text style={styles.visualMetricValue}>{value}</Text><Text style={styles.visualMetricLabel}>{label}</Text></View>;
}

function ValueItem({ icon: Icon, title, copy }: { icon: LucideIcon; title: string; copy: string }) {
  return <View style={styles.valueItem}><View style={styles.valueIcon}><Icon size={20} color={palette.orange} /></View><View style={styles.valueCopy}><Text style={styles.valueTitle}>{title}</Text><Text style={styles.valueText}>{copy}</Text></View></View>;
}

export function AdminStudioAuth() {
  const fontsLoaded = useStudioFonts();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const mobile = width < 860;
  const [mode, setMode] = useState<'login' | 'recovery'>('login');
  const [email, setEmail] = useState('testadmin6000@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  if (!fontsLoaded) return <LoadingScreen />;

  function submit() {
    setError('');
    setNotice('');
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid admin email address.');
    if (mode === 'recovery') return setNotice('Preview complete: a reset link would be sent securely if this were connected.');
    if (!password) return setError('Enter your password to continue.');
    router.push('/admin-studio/dashboard');
  }

  return (
    <View style={[styles.authScreen, mobile && styles.authScreenMobile]}>
      {!mobile && <View style={styles.authStory}>
        <Pressable onPress={() => router.push('/admin-studio')} style={styles.backLink}><ArrowLeft size={16} color="#D7D1CC" /><Text style={styles.backLinkText}>Back to admin overview</Text></Pressable>
        <View style={styles.authStoryCenter}><Brand dark /><Text style={styles.authStoryTitle}>Every decision starts with the right context.</Text><Text style={styles.authStoryCopy}>Review queues, evidence, and platform health in a workspace designed for fast, accountable operations.</Text><View style={styles.authPromise}><CheckCircle2 size={17} color="#6DE0A3" /><Text style={styles.authPromiseText}>Protected by role-based access</Text></View><View style={styles.authPromise}><CheckCircle2 size={17} color="#6DE0A3" /><Text style={styles.authPromiseText}>Every moderation action is auditable</Text></View><View style={styles.authPromise}><CheckCircle2 size={17} color="#6DE0A3" /><Text style={styles.authPromiseText}>Production data stays isolated in this preview</Text></View></View>
        <Text style={styles.authStoryFooter}>CEBSPOT · ADMIN OPERATIONS</Text>
      </View>}

      <ScrollView style={styles.authFormSide} contentContainerStyle={styles.authFormContent} keyboardShouldPersistTaps="handled">
        {mobile && <View style={styles.authMobileTop}><Brand /><Pressable accessibilityLabel="Back to admin overview" onPress={() => router.push('/admin-studio')} style={styles.iconButton}><X size={19} color={palette.ink} /></Pressable></View>}
        <View style={styles.authCard}>
          <View style={styles.authIcon}><KeyRound size={22} color={palette.orange} /></View>
          <Text style={styles.authEyebrow}>{mode === 'login' ? 'SECURE ADMIN ACCESS' : 'ACCOUNT RECOVERY'}</Text>
          <Text style={styles.authTitle}>{mode === 'login' ? 'Welcome back' : 'Reset your password'}</Text>
          <Text style={styles.authCopy}>{mode === 'login' ? 'Use your authorized CebSpot administrator account.' : 'Enter the admin email connected to your account.'}</Text>
          <View style={styles.previewNotice}><CircleHelp size={16} color={palette.blue} /><Text style={styles.previewNoticeText}>UI preview: credentials are not sent or verified.</Text></View>

          <Text style={styles.fieldLabel}>Email address</Text>
          <TextInput accessibilityLabel="Admin email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@company.com" placeholderTextColor={palette.subtle} style={styles.fieldInput} />
          {mode === 'login' && <><Text style={styles.fieldLabel}>Password</Text><View style={styles.passwordField}><TextInput accessibilityLabel="Admin password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder="Enter your password" placeholderTextColor={palette.subtle} onSubmitEditing={submit} style={styles.passwordInput} /><Pressable accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((value) => !value)} style={styles.eyeButton}>{showPassword ? <EyeOff size={18} color={palette.muted} /> : <Eye size={18} color={palette.muted} />}</Pressable></View></>}
          {!!error && <View style={styles.formMessageError}><AlertTriangle size={15} color={palette.red} /><Text style={styles.formErrorText}>{error}</Text></View>}
          {!!notice && <View style={styles.formMessageSuccess}><CheckCircle2 size={15} color={palette.green} /><Text style={styles.formSuccessText}>{notice}</Text></View>}
          <Pressable accessibilityRole="button" onPress={submit} style={styles.authSubmit}><Text style={styles.authSubmitText}>{mode === 'login' ? 'Sign in to console' : 'Send reset instructions'}</Text><ArrowRight size={17} color="#FFFFFF" /></Pressable>
          <Pressable onPress={() => { setMode(mode === 'login' ? 'recovery' : 'login'); setError(''); setNotice(''); }} style={styles.authSwitch}><Text style={styles.authSwitchText}>{mode === 'login' ? 'Forgot your password?' : 'Return to sign in'}</Text></Pressable>
        </View>
        <Text style={styles.authLegal}>Authorized personnel only · Activity may be logged for security.</Text>
      </ScrollView>
    </View>
  );
}

export function AdminStudioDashboard() {
  const fontsLoaded = useStudioFonts();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const mobile = width < 800;
  const compact = width >= 800 && width < 1120;
  const [section, setSection] = useState<Section>('overview');
  const [queue, setQueue] = useState(initialQueue);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('7d');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [toast, setToast] = useState('');

  const counts = useMemo(() => ({
    spots: queue.filter((item) => item.section === 'spots' && item.status === 'Pending').length,
    reports: queue.filter((item) => item.section === 'reports' && !['Resolved', 'Rejected'].includes(item.status)).length,
    requests: queue.filter((item) => item.section === 'requests' && item.status === 'Pending').length,
  }), [queue]);

  if (!fontsLoaded) return <LoadingScreen />;

  function navigate(next: Section) {
    setSection(next);
    setQuery('');
    setSelected(null);
    setDrawerOpen(false);
  }

  function decide(item: QueueItem, positive: boolean) {
    const status: QueueStatus = positive ? (item.section === 'reports' ? 'Resolved' : 'Approved') : 'Rejected';
    setQueue((current) => current.map((entry) => entry.id === item.id ? { ...entry, status } : entry));
    setSelected((current) => current?.id === item.id ? { ...current, status } : current);
    setToast(`${item.title} marked ${status.toLowerCase()} in preview only.`);
  }

  return (
    <View style={styles.dashboardScreen}>
      {!mobile && <DashboardSidebar section={section} counts={counts} compact={compact} onNavigate={navigate} onExit={() => router.push('/admin-studio/login')} />}
      <DashboardDrawer visible={drawerOpen} section={section} counts={counts} onClose={() => setDrawerOpen(false)} onNavigate={navigate} />
      <View style={styles.dashboardMain}>
        <DashboardHeader mobile={mobile} section={section} query={query} onQuery={setQuery} onMenu={() => setDrawerOpen(true)} onNotifications={() => setNotificationsOpen(true)} onExit={() => router.push('/admin-studio/login')} />
        {!!toast && <View style={styles.toast}><CheckCircle2 size={17} color={palette.green} /><Text style={styles.toastText}>{toast}</Text><Pressable accessibilityLabel="Dismiss message" onPress={() => setToast('')}><X size={17} color={palette.muted} /></Pressable></View>}
        <ScrollView style={styles.dashboardScroll} contentContainerStyle={[styles.dashboardContent, mobile && styles.dashboardContentMobile]}>
          <View style={styles.localBanner}><View style={styles.previewDot} /><Text style={styles.localBannerText}>Concept B · local mock workflow · no Supabase writes</Text></View>
          {section === 'overview' && <DashboardOverview queue={queue} range={range} mobile={mobile} onRange={setRange} onNavigate={navigate} onSelect={(item) => { setSelected(item); setSection(item.section); }} />}
          {(section === 'spots' || section === 'reports' || section === 'requests') && <QueueWorkspace section={section} queue={queue} query={query} selected={selected} mobile={mobile} onSelect={setSelected} onDecision={decide} />}
          {section === 'users' && <UsersWorkspace query={query} mobile={mobile} />}
          {section === 'system' && <SystemWorkspace />}
        </ScrollView>
      </View>
      <NotificationsModal visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} onNavigate={(next) => { setNotificationsOpen(false); navigate(next); }} />
    </View>
  );
}

function DashboardSidebar({ section, counts, compact, onNavigate, onExit }: { section: Section; counts: Record<QueueSection, number>; compact: boolean; onNavigate: (section: Section) => void; onExit: () => void }) {
  return <View style={[styles.dashboardSidebar, compact && styles.dashboardSidebarCompact]}><Brand dark />{!compact && <Text style={styles.sidebarGroup}>WORKSPACE</Text>}<View style={styles.sidebarNav}>{navItems.map((item) => <DashboardNavItem key={item.id} item={item} active={section === item.id} compact={compact} count={item.id === 'spots' || item.id === 'reports' || item.id === 'requests' ? counts[item.id] : 0} onPress={() => onNavigate(item.id)} />)}</View><View style={styles.sidebarBottom}>{!compact && <View style={styles.sidebarProfile}><View style={styles.sidebarAvatar}><Text style={styles.sidebarAvatarText}>TA</Text></View><View><Text style={styles.sidebarProfileName}>Test Admin</Text><Text style={styles.sidebarProfileRole}>Administrator</Text></View></View>}<Pressable accessibilityLabel="Exit admin preview" onPress={onExit} style={[styles.sidebarExit, compact && styles.center]}><LogOut size={17} color="#AAA39D" />{!compact && <Text style={styles.sidebarExitText}>Sign out of preview</Text>}</Pressable></View></View>;
}

function DashboardNavItem({ item, active, compact, count, onPress }: { item: typeof navItems[number]; active: boolean; compact: boolean; count: number; onPress: () => void }) {
  const Icon = item.icon;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.label}${count ? ` ${count}` : ''}`} onPress={onPress} style={[styles.dashboardNavItem, active && styles.dashboardNavItemActive, compact && styles.dashboardNavItemCompact]}><Icon size={19} color={active ? palette.orange : '#CBC5BF'} />{!compact && <Text style={[styles.dashboardNavText, active && styles.dashboardNavTextActive]}>{item.label}</Text>}{count > 0 && <View style={[styles.navBadge, compact && styles.navBadgeCompact]}><Text style={styles.navBadgeText}>{count}</Text></View>}</Pressable>;
}

function DashboardDrawer({ visible, section, counts, onClose, onNavigate }: { visible: boolean; section: Section; counts: Record<QueueSection, number>; onClose: () => void; onNavigate: (section: Section) => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.drawerBackdrop}><Pressable accessibilityLabel="Close navigation" onPress={onClose} style={styles.drawerScrim} /><View style={styles.drawer}><View style={styles.drawerTop}><Brand dark /><Pressable accessibilityLabel="Close navigation" onPress={onClose} style={styles.iconButtonDark}><X size={19} color="#FFFFFF" /></Pressable></View><Text style={styles.sidebarGroup}>WORKSPACE</Text><View style={styles.sidebarNav}>{navItems.map((item) => <DashboardNavItem key={item.id} item={item} active={section === item.id} compact={false} count={item.id === 'spots' || item.id === 'reports' || item.id === 'requests' ? counts[item.id] : 0} onPress={() => onNavigate(item.id)} />)}</View></View></View></Modal>;
}

function DashboardHeader({ mobile, section, query, onQuery, onMenu, onNotifications, onExit }: { mobile: boolean; section: Section; query: string; onQuery: (value: string) => void; onMenu: () => void; onNotifications: () => void; onExit: () => void }) {
  const label = navItems.find((item) => item.id === section)?.label ?? 'Overview';
  return <View style={[styles.dashboardHeader, mobile && styles.dashboardHeaderMobile]}><View style={styles.headerLead}>{mobile && <Pressable accessibilityLabel="Open navigation" onPress={onMenu} style={styles.headerIcon}><Menu size={21} color={palette.ink} /></Pressable>}{mobile && <Text style={styles.headerMobileTitle}>{label}</Text>}<View style={[styles.dashboardSearch, mobile && styles.dashboardSearchMobile]}><Search size={17} color={palette.subtle} /><TextInput accessibilityLabel={`Search ${label}`} value={query} onChangeText={onQuery} placeholder={`Search ${label.toLowerCase()}...`} placeholderTextColor={palette.subtle} style={styles.dashboardSearchInput} /></View></View><View style={styles.headerTools}><Pressable accessibilityLabel="Notifications" onPress={onNotifications} style={styles.headerIcon}><Bell size={18} color={palette.muted} /><View style={styles.notificationDot} /></Pressable><View style={styles.studioBadge}><Radio size={12} color={palette.orange} /><Text style={styles.studioBadgeText}>Studio</Text></View>{!mobile && <Pressable onPress={onExit} style={styles.headerProfile}><View style={styles.headerAvatar}><Text style={styles.headerAvatarText}>TA</Text></View><View><Text style={styles.headerProfileName}>Test Admin</Text><Text style={styles.headerProfileRole}>Administrator</Text></View></Pressable>}</View></View>;
}

function DashboardOverview({ queue, range, mobile, onRange, onNavigate, onSelect }: { queue: QueueItem[]; range: string; mobile: boolean; onRange: (range: string) => void; onNavigate: (section: Section) => void; onSelect: (item: QueueItem) => void }) {
  const pending = queue.filter((item) => !['Approved', 'Resolved', 'Rejected'].includes(item.status));
  return <View><PageHeader eyebrow="Operations" title="Good morning, Test Admin" subtitle="Start with what needs attention, then review platform performance." right={<View style={styles.rangeControl}>{['24h', '7d', '30d'].map((item) => <Pressable key={item} onPress={() => onRange(item)} style={[styles.rangeButton, range === item && styles.rangeButtonActive]}><Text style={[styles.rangeButtonText, range === item && styles.rangeButtonTextActive]}>{item}</Text></Pressable>)}</View>} /><View style={styles.kpiGrid}><KpiCard icon={UserPlus} label="Owner requests" value="2" change="1 high priority" tone="orange" onPress={() => onNavigate('requests')} /><KpiCard icon={FileText} label="Open reports" value="2" change="1 urgent" tone="red" onPress={() => onNavigate('reports')} /><KpiCard icon={MapPin} label="Spot submissions" value="1" change="Awaiting review" tone="blue" onPress={() => onNavigate('spots')} /><KpiCard icon={Activity} label="Platform health" value="98.7%" change="All core services up" tone="green" onPress={() => onNavigate('system')} /></View><View style={[styles.overviewMain, mobile && styles.stack]}><View style={styles.focusPanel}><View style={styles.panelTop}><View><Text style={styles.panelEyebrow}>ACTION CENTER</Text><Text style={styles.panelTitle}>Needs your attention</Text></View><Text style={styles.panelMeta}>{pending.length} open</Text></View>{pending.slice(0, 4).map((item) => <Pressable key={item.id} onPress={() => onSelect(item)} style={styles.focusRow}><PriorityPill priority={item.priority} /><View style={styles.focusCopy}><Text style={styles.focusTitle}>{item.title}</Text><Text style={styles.focusMeta}>{item.context} · {item.time}</Text></View><ChevronRight size={17} color={palette.subtle} /></Pressable>)}</View><View style={styles.performanceCard}><View style={styles.panelTop}><View><Text style={styles.panelEyebrowOrange}>PERFORMANCE</Text><Text style={styles.panelTitleWhite}>Platform activity</Text></View><Text style={styles.performanceRange}>{range}</Text></View><View style={styles.performanceMetrics}><View><Text style={styles.performanceValue}>86</Text><Text style={styles.performanceLabel}>Reservations</Text></View><View><Text style={styles.performanceValue}>₱48.6k</Text><Text style={styles.performanceLabel}>Revenue</Text></View><View><Text style={styles.performanceValue}>11</Text><Text style={styles.performanceLabel}>New spots</Text></View></View><View style={styles.bars}>{[42, 65, 52, 78, 69, 94, 82].map((height, index) => <View key={index} style={styles.barColumn}><View style={[styles.bar, { height: `${height}%` }]} /><Text style={styles.barLabel}>{['W', 'T', 'F', 'S', 'S', 'M', 'T'][index]}</Text></View>)}</View></View></View><View style={styles.activityPanel}><View style={styles.panelTop}><View><Text style={styles.panelEyebrow}>LIVE ACTIVITY</Text><Text style={styles.panelTitle}>Recent changes</Text></View><View style={styles.greenDot} /></View>{activity.map(([title, copy, time]) => <View key={title} style={styles.activityRow}><View style={styles.activityDot} /><View style={styles.activityCopy}><Text style={styles.activityTitle}>{title}</Text><Text style={styles.activitySubtitle}>{copy}</Text></View><Text style={styles.activityTime}>{time}</Text></View>)}</View><View style={[styles.leaderboardGrid, mobile && styles.stack]}><LeaderboardPanel title="Top spot categories" subtitle="Categorical distribution by venue type." data={categoryLeaderboard} /><LeaderboardPanel title="Top barangays in Cebu" subtitle="Leaderboard areas for registered spots." data={barangayLeaderboard} barangay /></View></View>;
}

function LeaderboardPanel({ title, subtitle, data, barangay = false }: { title: string; subtitle: string; data: Array<{ label: string; value: number }>; barangay?: boolean }) {
  const maximum = Math.max(...data.map((item) => item.value), 1);
  return <View style={styles.leaderboardPanel}><View style={styles.leaderboardHeader}><View><Text style={styles.leaderboardTitle}>{title}</Text><Text style={styles.leaderboardSubtitle}>{subtitle}</Text></View>{barangay ? <MapPin size={18} color={palette.subtle} /> : <BarChart3 size={18} color={palette.subtle} />}</View><View style={styles.leaderboardList}>{data.map((item, index) => <View key={item.label} style={styles.leaderboardRow}><View style={styles.leaderboardLabelRow}><View style={styles.leaderboardNameGroup}><Text style={styles.leaderboardRank}>{index + 1}</Text><Text style={styles.leaderboardName}>{item.label}</Text></View><Text style={styles.leaderboardValue}>{item.value} spots</Text></View><View style={styles.leaderboardTrack}><View style={[styles.leaderboardFill, barangay && styles.leaderboardFillBarangay, { width: `${Math.max((item.value / maximum) * 100, 8)}%` }]} /></View></View>)}</View></View>;
}

function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle: string; right?: React.ReactNode }) {
  return <View style={styles.pageHeader}><View style={styles.pageHeaderCopy}><Text style={styles.pageEyebrow}>{eyebrow}</Text><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View>{right}</View>;
}

function KpiCard({ icon: Icon, label, value, change, tone, onPress }: { icon: LucideIcon; label: string; value: string; change: string; tone: 'orange' | 'red' | 'blue' | 'green'; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.kpiCard}><View style={[styles.kpiIcon, tone === 'red' && styles.kpiRed, tone === 'blue' && styles.kpiBlue, tone === 'green' && styles.kpiGreen]}><Icon size={18} color={tone === 'red' ? palette.red : tone === 'blue' ? palette.blue : tone === 'green' ? palette.green : palette.orange} /></View><View style={styles.kpiTop}><Text style={styles.kpiLabel}>{label}</Text><ChevronRight size={16} color={palette.subtle} /></View><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiChange}>{change}</Text></Pressable>;
}

function QueueWorkspace({ section, queue, query, selected, mobile, onSelect, onDecision }: { section: QueueSection; queue: QueueItem[]; query: string; selected: QueueItem | null; mobile: boolean; onSelect: (item: QueueItem) => void; onDecision: (item: QueueItem, positive: boolean) => void }) {
  const copy = section === 'spots' ? ['Discovery', 'Spot submissions', 'Verify new places before they become public.'] : section === 'reports' ? ['Trust & Safety', 'Reports', 'Resolve community reports with evidence and context.'] : ['People & Access', 'Owner requests', 'Verify ownership before granting management access.'];
  const visible = queue.filter((item) => item.section === section && `${item.title} ${item.context} ${item.owner}`.toLowerCase().includes(query.toLowerCase()));
  const active = selected?.section === section ? selected : visible[0] ?? null;
  return <View><PageHeader eyebrow={copy[0]} title={copy[1]} subtitle={copy[2]} right={<View style={styles.queueCount}><Text style={styles.queueCountValue}>{visible.length}</Text><Text style={styles.queueCountLabel}>matching</Text></View>} /><View style={[styles.queueLayout, mobile && styles.stack]}><View style={styles.queuePanel}><View style={styles.queuePanelHeader}><Text style={styles.queuePanelTitle}>Review queue</Text><Text style={styles.queuePanelMeta}>Priority ordered</Text></View>{visible.map((item) => <Pressable key={item.id} onPress={() => onSelect(item)} style={[styles.queueItem, active?.id === item.id && styles.queueItemActive]}><View style={styles.queueItemTop}><PriorityPill priority={item.priority} /><StatusPill status={item.status} /></View><Text style={styles.queueItemTitle}>{item.title}</Text><Text style={styles.queueItemContext}>{item.context}</Text><View style={styles.queueItemBottom}><Text style={styles.queueItemOwner}>{item.owner}</Text><Text style={styles.queueItemTime}>{item.time}</Text></View></Pressable>)}</View>{active ? <View style={styles.reviewPanel}><View style={styles.reviewHeader}><View style={styles.reviewHeaderCopy}><Text style={styles.panelEyebrow}>REVIEW DETAILS</Text><Text style={styles.reviewTitle}>{active.title}</Text><Text style={styles.reviewContext}>{active.context}</Text></View><StatusPill status={active.status} /></View><Text style={styles.reviewDescription}>{active.description}</Text><View style={styles.evidenceGrid}><InfoCell label="PRIORITY" value={active.priority} /><InfoCell label="SUBMITTED" value={active.time} /><InfoCell label="REQUESTER" value={active.owner} /><InfoCell label="STATUS" value={active.status} /></View><View style={styles.evidenceBox}><View style={styles.evidenceBoxTitle}><ShieldCheck size={17} color={palette.orange} /><Text style={styles.evidenceTitle}>Evidence and verification</Text></View><Text style={styles.evidenceText}>Supporting records are grouped here so the reviewer can validate the decision without leaving the queue.</Text><View style={styles.evidenceLink}><FileText size={15} color={palette.orange} /><Text style={styles.evidenceLinkText}>Open attached evidence</Text><ChevronRight size={15} color={palette.orange} /></View></View><View style={styles.decisionBar}><Pressable onPress={() => onDecision(active, false)} style={styles.rejectButton}><X size={16} color={palette.red} /><Text style={styles.rejectButtonText}>{section === 'reports' ? 'Dismiss' : 'Reject'}</Text></Pressable><Pressable onPress={() => onDecision(active, true)} style={styles.approveButton}><Check size={16} color="#FFFFFF" /><Text style={styles.approveButtonText}>{section === 'reports' ? 'Resolve report' : section === 'spots' ? 'Approve spot' : 'Approve access'}</Text></Pressable></View></View> : <View style={styles.reviewPanel}><Text style={styles.emptyTitle}>No matching work</Text><Text style={styles.emptyCopy}>Adjust your search to see more items.</Text></View>}</View></View>;
}

function PriorityPill({ priority }: { priority: QueueItem['priority'] }) {
  return <View style={[styles.priorityPill, priority === 'Urgent' && styles.priorityUrgent, priority === 'High' && styles.priorityHigh]}><Text style={[styles.priorityPillText, priority === 'Urgent' && styles.priorityTextUrgent, priority === 'High' && styles.priorityTextHigh]}>{priority}</Text></View>;
}

function StatusPill({ status }: { status: QueueStatus }) {
  const complete = ['Approved', 'Resolved'].includes(status);
  return <View style={[styles.statusPill, complete && styles.statusComplete, status === 'Rejected' && styles.statusRejected, status === 'Investigating' && styles.statusInvestigating]}><Text style={[styles.statusPillText, complete && styles.statusTextComplete, status === 'Rejected' && styles.statusTextRejected, status === 'Investigating' && styles.statusTextInvestigating]}>{status}</Text></View>;
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoCell}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function UsersWorkspace({ query, mobile }: { query: string; mobile: boolean }) {
  const users = [
    ['Mika Torres', 'mika@example.com', 'Owner', 'Cebu City', '2 min ago'],
    ['Ana Cruz', 'ana@example.com', 'User', 'Mandaue', '18 min ago'],
    ['Paolo Lim', 'paolo@example.com', 'Owner', 'Lapu-Lapu', '1 hr ago'],
    ['Lea Fernandez', 'lea@example.com', 'User', 'Cebu City', 'Yesterday'],
  ].filter((user) => user.join(' ').toLowerCase().includes(query.toLowerCase()));
  return <View><PageHeader eyebrow="People" title="Users" subtitle="Inspect profiles, roles, location, and recent activity." right={<Pressable style={styles.approveButton}><UserPlus size={16} color="#FFFFFF" /><Text style={styles.approveButtonText}>Invite user</Text></Pressable>} /><View style={styles.userStats}><MiniStat label="Total profiles" value="1,284" /><MiniStat label="Active owners" value="46" /><MiniStat label="New this week" value="38" /></View><View style={styles.usersTable}>{!mobile && <View style={styles.userTableHeader}><Text style={[styles.tableHeading, styles.userWide]}>USER</Text><Text style={styles.tableHeading}>ROLE</Text><Text style={styles.tableHeading}>LOCATION</Text><Text style={styles.tableHeading}>LAST ACTIVE</Text></View>}{users.map(([name, email, role, location, last]) => <View key={email} style={[styles.userTableRow, mobile && styles.userTableRowMobile]}><View style={[styles.userIdentity, !mobile && styles.userWide]}><View style={styles.userAvatar}><Text style={styles.userAvatarText}>{name.split(' ').map((part) => part[0]).join('')}</Text></View><View><Text style={styles.userName}>{name}</Text><Text style={styles.userEmail}>{email}</Text></View></View><View style={styles.userCell}><Text style={styles.userCellText}>{role}</Text></View><View style={styles.userCell}><Text style={styles.userCellText}>{location}</Text></View><View style={styles.userCell}><Text style={styles.userCellText}>{last}</Text></View></View>)}</View></View>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.miniStat}><Text style={styles.miniStatLabel}>{label}</Text><Text style={styles.miniStatValue}>{value}</Text></View>;
}

function SystemWorkspace() {
  const services = [['Supabase database', 'Operational', '542 ms average latency'], ['Authentication', 'Operational', 'No incidents detected'], ['Image anonymization', 'Operational', '12 jobs processed today'], ['Storage capacity', 'Attention', '78% of allocation used']];
  return <View><PageHeader eyebrow="Operations" title="System health" subtitle="Monitor service health, capacity, and administrative activity." /><View style={styles.serviceGrid}>{services.map(([name, status, detail]) => <View key={name} style={styles.serviceCard}><View style={styles.serviceTop}>{status === 'Attention' ? <AlertTriangle size={20} color={palette.amber} /> : <CheckCircle2 size={20} color={palette.green} />}<Text style={[styles.serviceStatus, status === 'Attention' && styles.serviceStatusWarning]}>{status}</Text></View><Text style={styles.serviceName}>{name}</Text><Text style={styles.serviceDetail}>{detail}</Text></View>)}</View><View style={styles.activityPanel}><View style={styles.panelTop}><View><Text style={styles.panelEyebrow}>AUDIT TRAIL</Text><Text style={styles.panelTitle}>Recent administrator activity</Text></View></View>{activity.map(([title, copy, time]) => <View key={title} style={styles.activityRow}><View style={styles.activityDot} /><View style={styles.activityCopy}><Text style={styles.activityTitle}>{title}</Text><Text style={styles.activitySubtitle}>{copy}</Text></View><Text style={styles.activityTime}>{time}</Text></View>)}</View></View>;
}

function NotificationsModal({ visible, onClose, onNavigate }: { visible: boolean; onClose: () => void; onNavigate: (section: Section) => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.notificationsBackdrop}><Pressable accessibilityLabel="Close notifications" onPress={onClose} style={styles.notificationsScrim} /><View style={styles.notificationsPanel}><View style={styles.notificationsHeader}><View><Text style={styles.panelEyebrow}>INBOX</Text><Text style={styles.panelTitle}>Notifications</Text></View><Pressable accessibilityLabel="Close notifications" onPress={onClose} style={styles.iconButton}><X size={18} color={palette.ink} /></Pressable></View><Pressable onPress={() => onNavigate('reports')} style={styles.notificationRow}><View style={styles.notificationIconRed}><AlertTriangle size={17} color={palette.red} /></View><View style={styles.notificationCopy}><Text style={styles.notificationTitle}>Urgent report needs review</Text><Text style={styles.notificationText}>Accessibility details may be misleading.</Text></View></Pressable><Pressable onPress={() => onNavigate('requests')} style={styles.notificationRow}><View style={styles.notificationIconOrange}><UserPlus size={17} color={palette.orange} /></View><View style={styles.notificationCopy}><Text style={styles.notificationTitle}>New owner request</Text><Text style={styles.notificationText}>Ramon Uy submitted verification evidence.</Text></View></Pressable></View></View></Modal>;
}

const shadow = {
  shadowColor: '#3A2518',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.08,
  shadowRadius: 24,
  elevation: 4,
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
  loadingText: { color: palette.muted, fontFamily: type.medium, fontSize: 13 },
  textWhite: { color: '#FFFFFF' },
  textSidebarMuted: { color: '#A49D96' },
  stack: { flexDirection: 'column' },
  center: { justifyContent: 'center' },

  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 11, backgroundColor: palette.orange, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#FFFFFF', fontFamily: type.displayStrong, fontSize: 17 },
  brandName: { color: palette.ink, fontFamily: type.display, fontSize: 14, letterSpacing: -0.3 },
  brandTag: { color: palette.muted, fontFamily: type.medium, fontSize: 9, marginTop: 2 },

  landingScreen: { flex: 1, backgroundColor: '#FBFAF8' },
  landingContent: { minHeight: '100%', paddingHorizontal: 28, paddingBottom: 24 },
  landingNav: { width: '100%', maxWidth: 1240, alignSelf: 'center', minHeight: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  landingNavLinks: { flexDirection: 'row', alignItems: 'center', gap: 30 },
  landingNavLink: { color: palette.muted, fontFamily: type.semibold, fontSize: 12 },
  outlineButton: { minHeight: 42, borderWidth: 1, borderColor: palette.border, borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#FFFFFF' },
  outlineButtonText: { color: palette.ink, fontFamily: type.semibold, fontSize: 11 },
  hero: { width: '100%', maxWidth: 1240, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 70, paddingVertical: 72 },
  heroCopy: { flex: 1, minWidth: 0 },
  previewPill: { alignSelf: 'flex-start', minHeight: 29, borderRadius: 15, backgroundColor: palette.orangeSoft, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 22 },
  previewDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.orange },
  previewPillText: { color: palette.orangeDark, fontFamily: type.bold, fontSize: 9, letterSpacing: 0.9 },
  heroTitle: { maxWidth: 620, color: palette.ink, fontFamily: type.displayStrong, fontSize: 58, lineHeight: 66, letterSpacing: -2.4 },
  heroTitleMobile: { fontSize: 40, lineHeight: 48, letterSpacing: -1.4 },
  heroSubtitle: { maxWidth: 560, color: palette.muted, fontFamily: type.body, fontSize: 17, lineHeight: 28, marginTop: 22 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 32 },
  actionsMobile: { alignItems: 'stretch', flexDirection: 'column' },
  primaryButton: { minHeight: 50, borderRadius: 11, backgroundColor: palette.orange, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { color: '#FFFFFF', fontFamily: type.bold, fontSize: 12 },
  ghostButton: { minHeight: 50, borderRadius: 11, paddingHorizontal: 19, alignItems: 'center', justifyContent: 'center' },
  ghostButtonText: { color: palette.ink, fontFamily: type.semibold, fontSize: 12 },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 },
  trustText: { flex: 1, color: palette.muted, fontFamily: type.medium, fontSize: 10, lineHeight: 15 },
  heroVisual: { flex: 0.9, minWidth: 320, borderRadius: 22, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, padding: 22, ...shadow },
  visualTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  visualEyebrow: { color: palette.orange, fontFamily: type.bold, fontSize: 9, letterSpacing: 1.2, marginBottom: 5 },
  visualTitle: { color: palette.ink, fontFamily: type.display, fontSize: 20, letterSpacing: -0.4 },
  liveBadge: { minHeight: 28, borderRadius: 14, backgroundColor: palette.orangeSoft, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveBadgeText: { color: palette.orangeDark, fontFamily: type.bold, fontSize: 9 },
  visualMetricRow: { flexDirection: 'row', gap: 9, marginTop: 24 },
  visualMetric: { flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: palette.canvas, padding: 12 },
  visualMetricIcon: { width: 27, height: 27, borderRadius: 8, backgroundColor: palette.orangeSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  iconGreen: { backgroundColor: palette.greenSoft },
  iconBlue: { backgroundColor: palette.blueSoft },
  visualMetricValue: { color: palette.ink, fontFamily: type.extraBold, fontSize: 19, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  visualMetricLabel: { color: palette.muted, fontFamily: type.medium, fontSize: 9, marginTop: 3 },
  visualQueue: { marginTop: 22 },
  visualQueueTitle: { color: palette.ink, fontFamily: type.bold, fontSize: 11, marginBottom: 5 },
  visualQueueRow: { minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: palette.border },
  priorityBar: { width: 3, height: 30, borderRadius: 2, backgroundColor: palette.amber },
  priorityBarUrgent: { backgroundColor: palette.red },
  visualQueueCopy: { flex: 1, minWidth: 0 },
  visualQueueName: { color: palette.ink, fontFamily: type.semibold, fontSize: 11 },
  visualQueueMeta: { color: palette.muted, fontFamily: type.body, fontSize: 9, marginTop: 4 },
  valueStrip: { width: '100%', maxWidth: 1240, alignSelf: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.border, flexDirection: 'row', paddingVertical: 24 },
  valueStripMobile: { flexDirection: 'column', gap: 22 },
  valueItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  valueIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  valueCopy: { flex: 1 },
  valueTitle: { color: palette.ink, fontFamily: type.bold, fontSize: 12 },
  valueText: { color: palette.muted, fontFamily: type.body, fontSize: 10, lineHeight: 15, marginTop: 3 },
  landingFooter: { width: '100%', maxWidth: 1240, alignSelf: 'center', minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  footerText: { color: palette.subtle, fontFamily: type.medium, fontSize: 9 },
  footerLink: { color: palette.orange, fontFamily: type.bold, fontSize: 10 },

  authScreen: { flex: 1, minHeight: '100%', flexDirection: 'row', backgroundColor: palette.canvas },
  authScreenMobile: { flexDirection: 'column' },
  authStory: { flex: 1, maxWidth: 650, backgroundColor: palette.sidebar, padding: 42, justifyContent: 'space-between', overflow: 'hidden' },
  backLink: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backLinkText: { color: '#D7D1CC', fontFamily: type.semibold, fontSize: 11 },
  authStoryCenter: { maxWidth: 480 },
  authStoryTitle: { color: '#FFFFFF', fontFamily: type.displayStrong, fontSize: 39, lineHeight: 48, letterSpacing: -1.3, marginTop: 45 },
  authStoryCopy: { color: '#BEB7B1', fontFamily: type.body, fontSize: 14, lineHeight: 23, marginTop: 18, marginBottom: 29 },
  authPromise: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 13 },
  authPromiseText: { color: '#EEEAE6', fontFamily: type.medium, fontSize: 11 },
  authStoryFooter: { color: '#716B66', fontFamily: type.bold, fontSize: 9, letterSpacing: 1.5 },
  authFormSide: { flex: 1 },
  authFormContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  authMobileTop: { width: '100%', maxWidth: 520, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 },
  authCard: { width: '100%', maxWidth: 440 },
  authIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: palette.orangeSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  authEyebrow: { color: palette.orange, fontFamily: type.bold, fontSize: 9, letterSpacing: 1.4, marginBottom: 9 },
  authTitle: { color: palette.ink, fontFamily: type.displayStrong, fontSize: 30, lineHeight: 38, letterSpacing: -0.8 },
  authCopy: { color: palette.muted, fontFamily: type.body, fontSize: 12, lineHeight: 19, marginTop: 7 },
  previewNotice: { minHeight: 42, borderRadius: 10, backgroundColor: palette.blueSoft, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 24 },
  previewNoticeText: { flex: 1, color: palette.blue, fontFamily: type.medium, fontSize: 10, lineHeight: 15 },
  fieldLabel: { color: palette.ink, fontFamily: type.semibold, fontSize: 10, marginBottom: 7, marginTop: 13 },
  fieldInput: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: palette.borderStrong, backgroundColor: '#FFFFFF', paddingHorizontal: 13, color: palette.ink, fontFamily: type.body, fontSize: 12, outlineStyle: 'none' } as any,
  passwordField: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: palette.borderStrong, backgroundColor: '#FFFFFF', paddingLeft: 13, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, minHeight: 46, color: palette.ink, fontFamily: type.body, fontSize: 12, outlineStyle: 'none' } as any,
  eyeButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  formMessageError: { borderRadius: 9, backgroundColor: palette.redSoft, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  formErrorText: { flex: 1, color: palette.red, fontFamily: type.medium, fontSize: 10, lineHeight: 15 },
  formMessageSuccess: { borderRadius: 9, backgroundColor: palette.greenSoft, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  formSuccessText: { flex: 1, color: palette.green, fontFamily: type.medium, fontSize: 10, lineHeight: 15 },
  authSubmit: { minHeight: 49, borderRadius: 10, backgroundColor: palette.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22 },
  authSubmitText: { color: '#FFFFFF', fontFamily: type.bold, fontSize: 12 },
  authSwitch: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  authSwitchText: { color: palette.orangeDark, fontFamily: type.semibold, fontSize: 11 },
  authLegal: { color: palette.subtle, fontFamily: type.body, fontSize: 9, textAlign: 'center', marginTop: 30 },
  iconButton: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconButtonDark: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#FFFFFF10', alignItems: 'center', justifyContent: 'center' },

  dashboardScreen: { flex: 1, minHeight: '100%', flexDirection: 'row', backgroundColor: palette.canvas },
  dashboardSidebar: { width: 248, backgroundColor: palette.sidebar, paddingHorizontal: 14, paddingVertical: 20 },
  dashboardSidebarCompact: { width: 82, paddingHorizontal: 10 },
  sidebarGroup: { color: '#79726C', fontFamily: type.bold, fontSize: 9, letterSpacing: 1.5, marginTop: 34, marginBottom: 10, marginLeft: 11 },
  sidebarNav: { gap: 6, marginTop: 8 },
  dashboardNavItem: { minHeight: 46, borderRadius: 10, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11, position: 'relative' },
  dashboardNavItemActive: { backgroundColor: '#302018', borderLeftWidth: 3, borderLeftColor: palette.orange },
  dashboardNavItemCompact: { justifyContent: 'center', paddingHorizontal: 0 },
  dashboardNavText: { flex: 1, color: '#CBC5BF', fontFamily: type.semibold, fontSize: 12 },
  dashboardNavTextActive: { color: '#FFFFFF' },
  navBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: palette.orange, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  navBadgeCompact: { position: 'absolute', top: 2, right: 2, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3 },
  navBadgeText: { color: '#FFFFFF', fontFamily: type.bold, fontSize: 9, fontVariant: ['tabular-nums'] },
  sidebarBottom: { marginTop: 'auto', gap: 9 },
  sidebarProfile: { minHeight: 57, borderRadius: 11, backgroundColor: palette.sidebarSoft, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  sidebarAvatar: { width: 35, height: 35, borderRadius: 18, backgroundColor: palette.orange, alignItems: 'center', justifyContent: 'center' },
  sidebarAvatarText: { color: '#FFFFFF', fontFamily: type.bold, fontSize: 10 },
  sidebarProfileName: { color: '#FFFFFF', fontFamily: type.semibold, fontSize: 10 },
  sidebarProfileRole: { color: '#9E9791', fontFamily: type.body, fontSize: 8, marginTop: 2 },
  sidebarExit: { minHeight: 42, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  sidebarExitText: { color: '#AAA39D', fontFamily: type.medium, fontSize: 10 },
  dashboardMain: { flex: 1, minWidth: 0 },
  dashboardHeader: { minHeight: 72, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border, paddingHorizontal: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  dashboardHeaderMobile: { minHeight: 118, paddingHorizontal: 14, paddingVertical: 9, flexWrap: 'wrap', alignContent: 'center', gap: 7 },
  headerLead: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerMobileTitle: { color: palette.ink, fontFamily: type.display, fontSize: 14, letterSpacing: -0.3 },
  dashboardSearch: { width: '100%', maxWidth: 540, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: '#FBFAF9', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dashboardSearchMobile: { position: 'absolute', top: 48, left: 0, maxWidth: '100%' },
  dashboardSearchInput: { flex: 1, minHeight: 40, color: palette.ink, fontFamily: type.body, fontSize: 12, outlineStyle: 'none' } as any,
  headerTools: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationDot: { position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: palette.orange, borderWidth: 1, borderColor: '#FFFFFF' },
  studioBadge: { minHeight: 32, borderRadius: 16, backgroundColor: palette.orangeSoft, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  studioBadgeText: { color: palette.orangeDark, fontFamily: type.bold, fontSize: 9 },
  headerProfile: { minHeight: 44, borderLeftWidth: 1, borderLeftColor: palette.border, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.orange, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: '#FFFFFF', fontFamily: type.bold, fontSize: 9 },
  headerProfileName: { color: palette.ink, fontFamily: type.semibold, fontSize: 10 },
  headerProfileRole: { color: palette.muted, fontFamily: type.body, fontSize: 8, marginTop: 2 },
  dashboardScroll: { flex: 1 },
  dashboardContent: { width: '100%', maxWidth: 1580, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 20, paddingBottom: 60 },
  dashboardContentMobile: { paddingHorizontal: 14, paddingTop: 14 },
  localBanner: { alignSelf: 'flex-start', minHeight: 29, borderRadius: 15, backgroundColor: '#EDEAE6', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 21 },
  localBannerText: { color: palette.muted, fontFamily: type.semibold, fontSize: 9 },
  toast: { position: 'absolute', zIndex: 25, top: 82, right: 22, maxWidth: 430, minHeight: 48, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: palette.border, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, ...shadow },
  toastText: { flex: 1, color: palette.ink, fontFamily: type.medium, fontSize: 10, lineHeight: 15 },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 23 },
  pageHeaderCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 280 },
  pageEyebrow: { color: palette.orange, fontFamily: type.bold, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 7 },
  pageTitle: { color: palette.ink, fontFamily: type.displayStrong, fontSize: 28, lineHeight: 36, letterSpacing: -0.75 },
  pageSubtitle: { color: palette.muted, fontFamily: type.body, fontSize: 12, lineHeight: 18, marginTop: 4 },
  rangeControl: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 3 },
  rangeButton: { minWidth: 44, minHeight: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rangeButtonActive: { backgroundColor: palette.sidebar },
  rangeButtonText: { color: palette.muted, fontFamily: type.semibold, fontSize: 10 },
  rangeButtonTextActive: { color: '#FFFFFF' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginBottom: 16 },
  kpiCard: { flexGrow: 1, flexBasis: 210, minWidth: 195, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 15, ...shadow },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.orangeSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  kpiRed: { backgroundColor: palette.redSoft },
  kpiBlue: { backgroundColor: palette.blueSoft },
  kpiGreen: { backgroundColor: palette.greenSoft },
  kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kpiLabel: { color: palette.muted, fontFamily: type.semibold, fontSize: 10 },
  kpiValue: { color: palette.ink, fontFamily: type.extraBold, fontSize: 28, letterSpacing: -0.7, fontVariant: ['tabular-nums'], marginTop: 7 },
  kpiChange: { color: palette.muted, fontFamily: type.body, fontSize: 9, marginTop: 2 },
  overviewMain: { flexDirection: 'row', gap: 15, marginBottom: 16 },
  focusPanel: { flex: 1.1, minWidth: 300, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 18 },
  performanceCard: { flex: 1, minWidth: 300, minHeight: 330, borderRadius: 14, backgroundColor: palette.sidebar, padding: 18, overflow: 'hidden' },
  panelTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 15 },
  panelEyebrow: { color: palette.orange, fontFamily: type.bold, fontSize: 8, letterSpacing: 1.1, marginBottom: 5 },
  panelEyebrowOrange: { color: '#FF874E', fontFamily: type.bold, fontSize: 8, letterSpacing: 1.1, marginBottom: 5 },
  panelTitle: { color: palette.ink, fontFamily: type.display, fontSize: 16, lineHeight: 22, letterSpacing: -0.3 },
  panelTitleWhite: { color: '#FFFFFF', fontFamily: type.display, fontSize: 16, lineHeight: 22, letterSpacing: -0.3 },
  panelMeta: { color: palette.muted, fontFamily: type.medium, fontSize: 9 },
  focusRow: { minHeight: 63, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: palette.border },
  focusCopy: { flex: 1, minWidth: 0 },
  focusTitle: { color: palette.ink, fontFamily: type.semibold, fontSize: 10 },
  focusMeta: { color: palette.muted, fontFamily: type.body, fontSize: 8, marginTop: 4 },
  performanceRange: { color: '#B7B0AA', fontFamily: type.semibold, fontSize: 9 },
  performanceMetrics: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7 },
  performanceValue: { color: '#FFFFFF', fontFamily: type.extraBold, fontSize: 20, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  performanceLabel: { color: '#9C958F', fontFamily: type.body, fontSize: 8, marginTop: 3 },
  bars: { flex: 1, minHeight: 175, flexDirection: 'row', alignItems: 'flex-end', gap: 7, paddingTop: 16 },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 7 },
  bar: { width: '70%', maxWidth: 40, minHeight: 20, borderRadius: 6, backgroundColor: palette.orange },
  barLabel: { color: '#8F8882', fontFamily: type.semibold, fontSize: 8 },
  activityPanel: { borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 18 },
  greenDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.green, marginTop: 3 },
  activityRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: palette.border },
  activityDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.orange },
  activityCopy: { flex: 1, minWidth: 0 },
  activityTitle: { color: palette.ink, fontFamily: type.semibold, fontSize: 10 },
  activitySubtitle: { color: palette.muted, fontFamily: type.body, fontSize: 8, marginTop: 3 },
  activityTime: { color: palette.muted, fontFamily: type.medium, fontSize: 8, fontVariant: ['tabular-nums'] },
  leaderboardGrid: { flexDirection: 'row', gap: 15, marginTop: 16 },
  leaderboardPanel: { flex: 1, minWidth: 300, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 20 },
  leaderboardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 19 },
  leaderboardTitle: { color: palette.ink, fontFamily: type.display, fontSize: 17, lineHeight: 23, letterSpacing: -0.35 },
  leaderboardSubtitle: { color: palette.muted, fontFamily: type.body, fontSize: 10, lineHeight: 15, marginTop: 4 },
  leaderboardList: { gap: 17 },
  leaderboardRow: { gap: 7 },
  leaderboardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  leaderboardNameGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  leaderboardRank: { width: 17, color: palette.subtle, fontFamily: type.bold, fontSize: 8, fontVariant: ['tabular-nums'] },
  leaderboardName: { flex: 1, color: palette.ink, fontFamily: type.semibold, fontSize: 10 },
  leaderboardValue: { color: palette.ink, fontFamily: type.bold, fontSize: 9, fontVariant: ['tabular-nums'] },
  leaderboardTrack: { height: 7, borderRadius: 4, backgroundColor: '#E8E4E1', overflow: 'hidden' },
  leaderboardFill: { height: '100%', borderRadius: 4, backgroundColor: palette.orange },
  leaderboardFillBarangay: { backgroundColor: '#F4A817' },
  priorityPill: { minHeight: 21, borderRadius: 11, backgroundColor: palette.surfaceMuted, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  priorityUrgent: { backgroundColor: palette.redSoft },
  priorityHigh: { backgroundColor: palette.amberSoft },
  priorityPillText: { color: palette.muted, fontFamily: type.bold, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.3 },
  priorityTextUrgent: { color: palette.red },
  priorityTextHigh: { color: palette.amber },
  statusPill: { minHeight: 22, borderRadius: 11, backgroundColor: palette.orangeSoft, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  statusComplete: { backgroundColor: palette.greenSoft },
  statusRejected: { backgroundColor: palette.redSoft },
  statusInvestigating: { backgroundColor: palette.blueSoft },
  statusPillText: { color: palette.orangeDark, fontFamily: type.bold, fontSize: 7 },
  statusTextComplete: { color: palette.green },
  statusTextRejected: { color: palette.red },
  statusTextInvestigating: { color: palette.blue },
  queueCount: { borderRadius: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  queueCountValue: { color: palette.ink, fontFamily: type.extraBold, fontSize: 16, fontVariant: ['tabular-nums'] },
  queueCountLabel: { color: palette.muted, fontFamily: type.medium, fontSize: 8 },
  queueLayout: { flexDirection: 'row', gap: 15, alignItems: 'flex-start' },
  queuePanel: { flex: 0.8, minWidth: 280, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, overflow: 'hidden' },
  queuePanelHeader: { minHeight: 53, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.border },
  queuePanelTitle: { color: palette.ink, fontFamily: type.bold, fontSize: 12 },
  queuePanelMeta: { color: palette.muted, fontFamily: type.medium, fontSize: 8 },
  queueItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: palette.border, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  queueItemActive: { backgroundColor: palette.orangeSoft, borderLeftColor: palette.orange },
  queueItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 },
  queueItemTitle: { color: palette.ink, fontFamily: type.bold, fontSize: 12, lineHeight: 17 },
  queueItemContext: { color: palette.muted, fontFamily: type.body, fontSize: 9, marginTop: 3 },
  queueItemBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  queueItemOwner: { flex: 1, color: palette.muted, fontFamily: type.medium, fontSize: 8 },
  queueItemTime: { color: palette.muted, fontFamily: type.medium, fontSize: 8, fontVariant: ['tabular-nums'] },
  reviewPanel: { flex: 1.2, minWidth: 0, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 19, ...shadow },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: palette.border },
  reviewHeaderCopy: { flex: 1 },
  reviewTitle: { color: palette.ink, fontFamily: type.display, fontSize: 19, lineHeight: 25, letterSpacing: -0.4 },
  reviewContext: { color: palette.muted, fontFamily: type.body, fontSize: 10, marginTop: 4 },
  reviewDescription: { color: palette.muted, fontFamily: type.body, fontSize: 11, lineHeight: 18, marginVertical: 16 },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  infoCell: { flexGrow: 1, flexBasis: 130, minHeight: 60, borderRadius: 9, backgroundColor: palette.surfaceMuted, padding: 10 },
  infoLabel: { color: palette.muted, fontFamily: type.bold, fontSize: 7, letterSpacing: 0.6 },
  infoValue: { color: palette.ink, fontFamily: type.semibold, fontSize: 10, lineHeight: 14, marginTop: 7 },
  evidenceBox: { borderRadius: 11, borderWidth: 1, borderColor: palette.border, padding: 13, marginTop: 14 },
  evidenceBoxTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  evidenceTitle: { color: palette.ink, fontFamily: type.bold, fontSize: 10 },
  evidenceText: { color: palette.muted, fontFamily: type.body, fontSize: 9, lineHeight: 15, marginTop: 9 },
  evidenceLink: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: palette.border, marginTop: 10, paddingTop: 9 },
  evidenceLinkText: { flex: 1, color: palette.orangeDark, fontFamily: type.semibold, fontSize: 9 },
  decisionBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: palette.border },
  rejectButton: { minHeight: 42, borderRadius: 9, borderWidth: 1, borderColor: '#E4B7BA', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  rejectButtonText: { color: palette.red, fontFamily: type.bold, fontSize: 10 },
  approveButton: { minHeight: 42, borderRadius: 9, backgroundColor: palette.orange, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  approveButtonText: { color: '#FFFFFF', fontFamily: type.bold, fontSize: 10 },
  emptyTitle: { color: palette.ink, fontFamily: type.display, fontSize: 15, textAlign: 'center', marginTop: 40 },
  emptyCopy: { color: palette.muted, fontFamily: type.body, fontSize: 10, textAlign: 'center', marginTop: 6 },
  userStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginBottom: 15 },
  miniStat: { flexGrow: 1, flexBasis: 170, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 14 },
  miniStatLabel: { color: palette.muted, fontFamily: type.medium, fontSize: 9 },
  miniStatValue: { color: palette.ink, fontFamily: type.extraBold, fontSize: 21, letterSpacing: -0.45, fontVariant: ['tabular-nums'], marginTop: 5 },
  usersTable: { borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, overflow: 'hidden' },
  userTableHeader: { minHeight: 44, backgroundColor: palette.surfaceMuted, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tableHeading: { flex: 1, color: palette.muted, fontFamily: type.bold, fontSize: 7, letterSpacing: 0.7 },
  userWide: { flex: 1.5 },
  userTableRow: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: palette.border },
  userTableRowMobile: { alignItems: 'flex-start', flexDirection: 'column', paddingVertical: 13 },
  userIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  userAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: palette.orangeDark, fontFamily: type.bold, fontSize: 9 },
  userName: { color: palette.ink, fontFamily: type.semibold, fontSize: 10 },
  userEmail: { color: palette.muted, fontFamily: type.body, fontSize: 8, marginTop: 3 },
  userCell: { flex: 1 },
  userCellText: { color: palette.muted, fontFamily: type.medium, fontSize: 9 },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 15 },
  serviceCard: { flexGrow: 1, flexBasis: 210, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: 15 },
  serviceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  serviceStatus: { color: palette.green, fontFamily: type.bold, fontSize: 8 },
  serviceStatusWarning: { color: palette.amber },
  serviceName: { color: palette.ink, fontFamily: type.bold, fontSize: 11 },
  serviceDetail: { color: palette.muted, fontFamily: type.body, fontSize: 9, marginTop: 5 },
  drawerBackdrop: { flex: 1, flexDirection: 'row' },
  drawerScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000080' },
  drawer: { width: 290, height: '100%', backgroundColor: palette.sidebar, padding: 16, ...shadow },
  drawerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notificationsBackdrop: { flex: 1, alignItems: 'flex-end' },
  notificationsScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000055' },
  notificationsPanel: { width: '100%', maxWidth: 400, height: '100%', backgroundColor: palette.surface, padding: 20, ...shadow },
  notificationsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  notificationRow: { minHeight: 78, borderTopWidth: 1, borderTopColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 11 },
  notificationIconRed: { width: 38, height: 38, borderRadius: 11, backgroundColor: palette.redSoft, alignItems: 'center', justifyContent: 'center' },
  notificationIconOrange: { width: 38, height: 38, borderRadius: 11, backgroundColor: palette.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  notificationCopy: { flex: 1 },
  notificationTitle: { color: palette.ink, fontFamily: type.semibold, fontSize: 10 },
  notificationText: { color: palette.muted, fontFamily: type.body, fontSize: 9, lineHeight: 14, marginTop: 4 },
});
