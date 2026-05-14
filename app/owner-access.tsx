import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Grid3X3,
  MessageSquareText,
  Star,
  Store,
  Table2,
} from 'lucide-react-native';
import { AppButton } from '../src/components/AppButton';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { ownerAccessService } from '../src/services/ownerAccessService';

const accessCategories = ['Restaurant', 'Cafe', 'Bar', 'Club', 'Lounge', 'Food Park'];
const accessNeeds = ['Reservations', 'Down Payments', 'Guest Reviews', 'Tables & Pricing'];

const portalCards = [
  { label: "Tonight's Bookings", value: '8', tone: colors.primary },
  { label: 'Down Payments', value: 'PHP 3,500', tone: colors.onSurface },
  { label: 'Average Rating', value: '4.7', tone: colors.onSurface },
];

export default function OwnerAccessScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const wide = width >= 880;

  const [contactName, setContactName] = useState(profile?.display_name ?? '');
  const [contactEmail, setContactEmail] = useState(profile?.email ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [spotName, setSpotName] = useState('');
  const [spotAddress, setSpotAddress] = useState('');
  const [category, setCategory] = useState(accessCategories[0]);
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>(['Reservations', 'Down Payments']);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (profile?.display_name && !contactName) setContactName(profile.display_name);
    if (profile?.email && !contactEmail) setContactEmail(profile.email);
  }, [contactEmail, contactName, profile?.display_name, profile?.email]);

  const completionCopy = useMemo(() => {
    if (!submitted) return 'CebSpot verifies each venue before opening the owner portal.';
    return 'Request received. Our team will contact the spot owner after verification.';
  }, [submitted]);

  function toggleNeed(need: string) {
    setSelectedNeeds((current) =>
      current.includes(need) ? current.filter((item) => item !== need) : [...current, need],
    );
  }

  async function submitRequest() {
    if (!profile?.id) {
      Alert.alert('Sign in required', 'Please sign in again before requesting owner access.');
      return;
    }
    if (!contactName.trim() || !contactEmail.trim() || !spotName.trim() || !spotAddress.trim()) {
      Alert.alert('Missing details', 'Please complete your contact and spot details.');
      return;
    }
    if (!selectedNeeds.length) {
      Alert.alert('Select access needs', 'Choose at least one owner portal area.');
      return;
    }

    try {
      setSubmitting(true);
      await ownerAccessService.createRequest(
        {
          requester_id: profile.id,
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim(),
          contact_phone: contactPhone.trim() || null,
          spot_name: spotName.trim(),
          spot_address: spotAddress.trim(),
          category,
          access_needs: selectedNeeds,
          message: message.trim() || null,
        },
        profile.display_name || contactName.trim() || 'Spot Owner',
      );
      setSubmitted(true);
      Alert.alert('Request sent', 'CebSpot will contact the spot owner to verify access.');
    } catch (error: any) {
      console.error('Owner access request failed:', error);
      Alert.alert('Request failed', error.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.keyboard, { backgroundColor: appColors.surface }]}
    >
      <ScrollView contentContainerStyle={[styles.page, wide && styles.pageWide]} showsVerticalScrollIndicator={false}>
        <View style={styles.topbar}>
          <Pressable style={[styles.backButton, { backgroundColor: appColors.surfaceLow }]} onPress={() => router.back()}>
            <ArrowLeft size={20} color={appColors.onSurface} />
          </Pressable>
          <View style={styles.topbarCopy}>
            <Text style={[styles.kicker, { color: colors.primary }]}>Spot Owner Access</Text>
            <Text style={[styles.pageTitle, { color: appColors.onSurface }]}>Contact CebSpot</Text>
          </View>
        </View>

        <View style={[styles.content, wide && styles.contentWide]}>
          <PortalPreview appColors={appColors} wide={wide} />

          <View style={[styles.formPanel, { backgroundColor: appColors.surfaceLow }]}>
            <View style={styles.formHeader}>
              <View style={styles.formIcon}>
                <Store size={22} color={colors.white} />
              </View>
              <View style={styles.formHeaderCopy}>
                <Text style={[styles.formTitle, { color: appColors.onSurface }]}>Request Reservation Access</Text>
                <Text style={[styles.formSubtitle, { color: appColors.onSurfaceVariant }]}>{completionCopy}</Text>
              </View>
              {submitted && <CheckCircle2 size={24} color={colors.success} />}
            </View>

            <View style={[styles.fieldGrid, wide && styles.fieldGridWide]}>
              <FormField
                label="Contact Name"
                value={contactName}
                onChangeText={setContactName}
                placeholder="Marco Reyes"
                appColors={appColors}
              />
              <FormField
                label="Business Email"
                value={contactEmail}
                onChangeText={setContactEmail}
                placeholder="owner@livsuperclub.ph"
                keyboardType="email-address"
                appColors={appColors}
              />
            </View>

            <FormField
              label="Contact Number"
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="+63 917 000 0000"
              keyboardType="phone-pad"
              appColors={appColors}
            />

            <View style={[styles.fieldGrid, wide && styles.fieldGridWide]}>
              <FormField
                label="Spot Name"
                value={spotName}
                onChangeText={setSpotName}
                placeholder="Liv Superclub"
                appColors={appColors}
              />
              <View style={styles.field}>
                <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Category</Text>
                <View style={styles.categoryGrid}>
                  {accessCategories.map((item) => {
                    const selected = item === category;
                    return (
                      <Pressable
                        key={item}
                        style={[
                          styles.choiceChip,
                          {
                            backgroundColor: selected ? colors.primary : appColors.white,
                          },
                        ]}
                        onPress={() => setCategory(item)}
                      >
                        <Text style={[styles.choiceText, { color: selected ? colors.white : appColors.onSurfaceVariant }]}>
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <FormField
              label="Spot Address"
              value={spotAddress}
              onChangeText={setSpotAddress}
              placeholder="IT Park, Lahug, Cebu City"
              appColors={appColors}
            />

            <View style={styles.field}>
              <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Access Needed</Text>
              <View style={styles.needGrid}>
                {accessNeeds.map((need) => {
                  const selected = selectedNeeds.includes(need);
                  return (
                    <Pressable
                      key={need}
                      style={[
                        styles.needChip,
                        {
                          backgroundColor: selected ? colors.primary + '16' : appColors.white,
                        },
                      ]}
                      onPress={() => toggleNeed(need)}
                    >
                      <CheckCircle2 size={15} color={selected ? colors.primary : appColors.onSurfaceVariant} />
                      <Text style={[styles.needText, { color: selected ? colors.primary : appColors.onSurfaceVariant }]}>
                        {need}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Message</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Tell us how your team handles bookings today."
                placeholderTextColor={appColors.onSurfaceVariant + '88'}
                multiline
                style={[
                  styles.textArea,
                  {
                    backgroundColor: appColors.white,
                    color: appColors.onSurface,
                  },
                ]}
              />
            </View>

            <AppButton
              label={submitted ? 'Request Sent' : 'Send Request'}
              loading={submitting}
              disabled={submitted}
              onPress={submitRequest}
              icon={!submitted ? <MessageSquareText size={18} color={colors.white} /> : undefined}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  appColors,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  appColors: typeof colors;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={appColors.onSurfaceVariant + '88'}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={[
          styles.input,
          {
            backgroundColor: appColors.white,
            color: appColors.onSurface,
          },
        ]}
      />
    </View>
  );
}

function PortalPreview({ appColors, wide }: { appColors: typeof colors; wide: boolean }) {
  return (
    <View style={[styles.preview, wide && styles.previewWide]}>
      <View style={styles.previewSidebar}>
        <Text style={styles.previewBrand}>CebSpot</Text>
        <View style={styles.previewSpot}>
          <View style={styles.previewLogo}>
            <Grid3X3 size={19} color={colors.white} />
          </View>
          <View>
            <Text style={styles.previewSpotName}>Liv Superclub</Text>
            <Text style={styles.previewSpotMeta}>Club - IT Park</Text>
          </View>
        </View>
        <PreviewNav icon={CalendarDays} label="Reservations" active />
        <PreviewNav icon={CreditCard} label="Payments" />
        <PreviewNav icon={Star} label="Reviews" />
        <PreviewNav icon={Table2} label="Tables" />
      </View>

      <View style={[styles.previewCanvas, { backgroundColor: appColors.surface }]}>
        <View style={styles.previewHeader}>
          <View>
            <Text style={[styles.previewHello, { color: appColors.onSurface }]}>Good evening, boss!</Text>
            <Text style={[styles.previewDate, { color: appColors.onSurfaceVariant }]}>Reservation console</Text>
          </View>
          <View style={styles.previewPill}>
            <CalendarDays size={13} color={colors.primary} />
            <Text style={styles.previewPillText}>8 tonight</Text>
          </View>
        </View>

        <View style={styles.previewMetrics}>
          {portalCards.map((card) => (
            <View key={card.label} style={[styles.previewCard, { backgroundColor: appColors.white }]}>
              <Text style={[styles.previewCardLabel, { color: appColors.onSurfaceVariant }]}>{card.label}</Text>
              <Text style={[styles.previewCardValue, { color: card.tone }]}>{card.value}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.previewTable, { backgroundColor: appColors.white }]}>
          <View style={styles.previewTableHeader}>
            <Text style={[styles.previewTableTitle, { color: appColors.onSurface }]}>Tonight's Reservations</Text>
            <Text style={styles.previewTableAction}>View Floor Plan</Text>
          </View>
          {[
            ['JS', 'Kawhi Leonard', 'Table T-04 - 9:30 PM', 'Confirmed'],
            ['AL', 'mistah lefty', 'VIP Table V-01 - 10:00 PM', 'Pending'],
            ['RT', 'Wembanyama', 'Table T-12 - 8:45 PM', 'Rescheduled'],
          ].map((item) => (
            <View key={item[1]} style={styles.previewRow}>
              <View style={styles.previewAvatar}>
                <Text style={styles.previewAvatarText}>{item[0]}</Text>
              </View>
              <View style={styles.previewRowCopy}>
                <Text style={[styles.previewRowName, { color: appColors.onSurface }]}>{item[1]}</Text>
                <Text style={[styles.previewRowMeta, { color: appColors.onSurfaceVariant }]}>{item[2]}</Text>
              </View>
              <Text style={[styles.previewStatus, item[3] === 'Pending' && styles.previewStatusPending]}>
                {item[3]}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.previewFinance}>
          <Banknote size={17} color={colors.success} />
          <Text style={[styles.previewFinanceText, { color: appColors.onSurfaceVariant }]}>
            Down payments and on-site balances stay visible to approved owners.
          </Text>
        </View>
      </View>
    </View>
  );
}

function PreviewNav({ icon: Icon, label, active }: { icon: any; label: string; active?: boolean }) {
  return (
    <View style={[styles.previewNav, active && styles.previewNavActive]}>
      <Icon size={15} color={active ? colors.white : '#A5A5A5'} />
      <Text style={[styles.previewNavText, active && styles.previewNavTextActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  page: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  pageWide: {
    paddingHorizontal: 42,
    paddingVertical: 32,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topbarCopy: {
    flex: 1,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  content: {
    gap: spacing.xl,
  },
  contentWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  preview: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    minHeight: 560,
    backgroundColor: colors.secondary,
    ...shadow.lifted,
  },
  previewWide: {
    flex: 1.05,
    minWidth: 0,
  },
  previewSidebar: {
    backgroundColor: '#0A0A0A',
    padding: spacing.lg,
    gap: spacing.md,
  },
  previewBrand: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  previewSpot: {
    borderRadius: radius.xl,
    backgroundColor: '#151515',
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  previewLogo: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSpotName: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  previewSpotMeta: {
    color: '#A5A5A5',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  previewNav: {
    minHeight: 38,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewNavActive: {
    backgroundColor: colors.primary,
  },
  previewNavText: {
    color: '#A5A5A5',
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  previewNavTextActive: {
    color: colors.white,
    fontWeight: '900',
  },
  previewCanvas: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'center',
  },
  previewHello: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    lineHeight: 28,
  },
  previewDate: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  previewPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.primary + '16',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  previewPillText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  previewMetrics: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  previewCard: {
    flex: 1,
    minHeight: 106,
    borderRadius: radius.xl,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  previewCardLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  previewCardValue: {
    fontSize: 23,
    fontWeight: '900',
  },
  previewTable: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  previewTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  previewTableTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  previewTableAction: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  previewRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewAvatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAvatarText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  previewRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  previewRowName: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  previewRowMeta: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  previewStatus: {
    borderRadius: radius.pill,
    backgroundColor: colors.successContainer,
    color: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  previewStatusPending: {
    backgroundColor: colors.primary + '12',
    color: colors.primary,
  },
  previewFinance: {
    borderRadius: radius.xl,
    backgroundColor: colors.successContainer,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewFinanceText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
  },
  formPanel: {
    flex: 1,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  formIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formHeaderCopy: {
    flex: 1,
  },
  formTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  formSubtitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
  },
  fieldGrid: {
    gap: spacing.lg,
  },
  fieldGridWide: {
    flexDirection: 'row',
  },
  field: {
    flex: 1,
    gap: spacing.sm,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  textArea: {
    minHeight: 116,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlignVertical: 'top',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choiceChip: {
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  needGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  needChip: {
    minHeight: 42,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  needText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
});
