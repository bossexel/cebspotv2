import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, ChevronUp, Info, MapPin, Plus, ShieldCheck } from 'lucide-react-native';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { aboutContent, isValidAboutLink, type AboutLink } from '../src/constants/about';
import { colors } from '../src/constants/colors';
import { fontSize, radius, spacing } from '../src/constants/design';
import { useTheme } from '../src/hooks/useTheme';
import { openInformationLink } from '../src/utils/externalLinks';

function getAppVersion() {
  // Some installed binaries include ExpoApplication. Avoid requiring a native rebuild.
  const application = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
    ? requireOptionalNativeModule<{ nativeApplicationVersion?: string }>('ExpoApplication')
    : null;
  return application?.nativeApplicationVersion || Constants.expoConfig?.version || require('../app.json').expo.version || 'Development';
}

export default function AboutScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acknowledgmentsOpen, setAcknowledgmentsOpen] = useState(false);
  const bodyColor = { color: appColors.onSurfaceVariant };
  const headingColor = { color: appColors.onSurface };
  const cardColor = { backgroundColor: appColors.surfaceLow };
  const version = getAppVersion();

  function renderLinks(links: AboutLink[]) {
    return links.filter((link) => link.label.trim() && isValidAboutLink(link.url)).map((link) => (
      <Pressable key={link.label} accessibilityRole="link" onPress={() => void openInformationLink(link)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Text style={[styles.rowText, headingColor]}>{link.label}</Text>
        <ChevronRight size={20} color={appColors.onSurfaceVariant} />
      </Pressable>
    ));
  }

  return (
    <ScreenContainer appColors={appColors} scroll>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')}
            style={({ pressed }) => [styles.back, cardColor, pressed && styles.pressed]}>
            <ArrowLeft size={22} color={appColors.onSurface} />
          </Pressable>
          <Text accessibilityRole="header" style={[styles.title, headingColor]}>About CebSpot</Text>
        </View>

        <View testID="about-introduction-card" style={[styles.hero, cardColor]}>
          <Image source={require('../assets/cebspot-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="CebSpot logo" />
          <Text style={[styles.appName, headingColor]}>CebSpot</Text>
          <Text style={[styles.tagline, headingColor]}>{aboutContent.tagline}</Text>
          <Text style={[styles.body, bodyColor]}>{aboutContent.introduction}</Text>
          {[
            { title: 'Technical Documentation', subtitle: 'Explore CebSpot’s features and system architecture.', route: '/documentation' as const, Icon: BookOpen },
            { title: 'Privacy Policy', subtitle: 'Understand how your information is handled.', route: '/privacy' as const, Icon: ShieldCheck },
          ].map(({ title, subtitle, route, Icon }) => <Pressable key={route} accessibilityRole="button" accessibilityLabel={title}
            onPress={() => router.push(route)}
            style={({ pressed }) => [styles.row, styles.informationRow, { borderColor: appColors.outlineVariant }, pressed && styles.pressed]}>
            <Icon size={22} color={colors.primary} />
            <View style={styles.copy}>
              <Text style={[styles.itemTitle, headingColor]}>{title}</Text>
              <Text style={[styles.body, bodyColor]}>{subtitle}</Text>
            </View>
            <ChevronRight size={20} color={colors.primary} />
          </Pressable>)}
        </View>

        <View style={[styles.card, cardColor]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, headingColor]}>Our purpose and story</Text>
          <Text style={[styles.body, bodyColor]}>{aboutContent.purpose}</Text>
          <Text style={[styles.body, bodyColor]}>{aboutContent.attribution}</Text>
        </View>

        <View style={[styles.card, cardColor]}>
          <MapPin size={24} color={colors.primary} />
          <Text accessibilityRole="header" style={[styles.sectionTitle, headingColor]}>Rooted in Cebu City</Text>
          <Text style={[styles.body, bodyColor]}>{aboutContent.coverage}</Text>
          <Text style={[styles.body, bodyColor]}>{aboutContent.reservations}</Text>
        </View>

        <View style={[styles.card, cardColor]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, headingColor]}>How CebSpot works</Text>
          {aboutContent.features.map((feature, index) => (
            <View key={feature.title} style={styles.feature}>
              <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.copy}>
                <Text style={[styles.itemTitle, headingColor]}>{feature.title}</Text>
                <Text style={[styles.body, bodyColor]}>{feature.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.card, cardColor]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, headingColor]}>Meet the team</Text>
          <Text style={[styles.body, bodyColor]}>{aboutContent.attribution}</Text>
          {aboutContent.team.map((person) => (
            <View key={person.name} style={styles.person}>
              <Text style={[styles.itemTitle, headingColor]}>{person.name}</Text>
              <Text style={[styles.body, bodyColor]}>{person.role}</Text>
            </View>
          ))}
          {Boolean(aboutContent.acknowledgments) && <>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: acknowledgmentsOpen }} aria-expanded={acknowledgmentsOpen}
              accessibilityLabel="Acknowledgments" accessibilityHint="Show or hide acknowledgments"
              onPress={() => setAcknowledgmentsOpen((open) => !open)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={[styles.rowText, headingColor]}>Acknowledgments</Text>
              {acknowledgmentsOpen ? <ChevronUp size={20} color={colors.primary} /> : <ChevronDown size={20} color={colors.primary} />}
            </Pressable>
            {acknowledgmentsOpen && <Text style={[styles.body, bodyColor]}>{aboutContent.acknowledgments}</Text>}
          </>}
        </View>

        <View style={[styles.card, cardColor]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, headingColor]}>Help and contributions</Text>
          <Text style={[styles.body, bodyColor]}>Use the guide above and the questions below for help getting started.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/submit-spot')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Plus size={20} color={colors.primary} />
            <Text style={[styles.rowText, headingColor]}>Suggest or Add a Spot</Text>
            <ChevronRight size={20} color={appColors.onSurfaceVariant} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Report Incorrect Spot Information"
            accessibilityHint="Opens Explore. Choose a spot and use Suggest an edit."
            onPress={() => router.push('/')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Info size={20} color={colors.primary} />
            <View style={styles.copy}>
              <Text style={[styles.itemTitle, headingColor]}>Report Incorrect Spot Information</Text>
              <Text style={[styles.body, bodyColor]}>Find the spot in Explore, open its details, and choose Suggest an edit.</Text>
            </View>
            <ChevronRight size={20} color={appColors.onSurfaceVariant} />
          </Pressable>
          {renderLinks(aboutContent.supportLinks)}
        </View>

        <View style={[styles.card, cardColor]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, headingColor]}>Frequently asked questions</Text>
          {aboutContent.faqs.map((faq) => {
            const isExpanded = expanded === faq.id;
            return (
              <View key={faq.id} style={[styles.faq, { borderColor: appColors.outlineVariant }]}>
                <Pressable accessibilityRole="button" accessibilityLabel={faq.question}
                  accessibilityState={{ expanded: isExpanded }} aria-expanded={isExpanded} accessibilityHint="Show or hide answer"
                  onPress={() => setExpanded(isExpanded ? null : faq.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <Text style={[styles.rowText, headingColor]}>{faq.question}</Text>
                  {isExpanded ? <ChevronUp size={20} color={colors.primary} /> : <ChevronDown size={20} color={colors.primary} />}
                </Pressable>
                {isExpanded && <Text style={[styles.body, styles.answer, bodyColor]}>{faq.answer}</Text>}
              </View>
            );
          })}
        </View>

        <View style={[styles.card, cardColor]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, headingColor]}>App information</Text>
          {renderLinks(aboutContent.policyLinks)}
          <Text style={[styles.body, bodyColor]}>CebSpot · Version {version}</Text>
          {aboutContent.releaseNotes.length > 0 && <>
            <Text style={[styles.itemTitle, headingColor]}>Release notes</Text>
            {aboutContent.releaseNotes.map((note) => <Text key={note} style={[styles.body, bodyColor]}>{note}</Text>)}
          </>}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  back: { minWidth: 48, minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: 'Montserrat_800ExtraBold', fontSize: fontSize.xxl },
  hero: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  logo: { width: 96, height: 112, alignSelf: 'center' },
  appName: { fontSize: fontSize.display, fontFamily: 'Montserrat_900Black', textAlign: 'center' },
  tagline: { fontSize: fontSize.lg, fontFamily: 'Montserrat_700Bold', textAlign: 'center' },
  card: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.xl, fontFamily: 'Montserrat_800ExtraBold' },
  body: { fontSize: fontSize.md, lineHeight: 23 },
  itemTitle: { fontSize: fontSize.md, fontFamily: 'Montserrat_700Bold' },
  feature: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  number: { color: colors.primary, fontSize: fontSize.lg, fontFamily: 'Montserrat_800ExtraBold' },
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  person: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingVertical: spacing.md },
  rowText: { flex: 1, fontSize: fontSize.md, fontFamily: 'Montserrat_700Bold' },
  informationRow: { borderTopWidth: StyleSheet.hairlineWidth },
  faq: { borderTopWidth: StyleSheet.hairlineWidth },
  answer: { paddingBottom: spacing.md },
  pressed: { opacity: 0.75 },
});
