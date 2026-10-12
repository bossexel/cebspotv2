import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { InformationScreen, informationStyles as styles } from '../src/components/InformationScreen';
import { ContentCardView, ContentIcon, ContentParagraphs, contentStyles } from '../src/components/InformationContent';
import { documentationContent as content } from '../src/constants/documentation';
import { useTheme } from '../src/hooks/useTheme';
import { colors } from '../src/constants/colors';

type Tab = typeof content.tabs[number];

export default function DocumentationScreen() {
  const [selected, setSelected] = useState<Tab>('Overview');
  const { appColors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const router = useRouter();
  const columns = width >= 900 && fontScale <= 1.3;
  const tabs = <View accessibilityRole="tablist" style={[local.tabs, { backgroundColor: appColors.surfaceLow, borderColor: appColors.outlineVariant }]}>
      {content.tabs.map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab}
        accessibilityState={{ selected: selected === tab }} aria-selected={selected === tab}
        onPress={() => setSelected(tab)} style={({ pressed }) => [local.tab, fontScale > 1.3 && local.largeTab, { backgroundColor: selected === tab ? appColors.surfaceRaised : 'transparent', borderColor: selected === tab ? colors.primary + '55' : 'transparent' }, selected === tab && local.selected, pressed && styles.pressed]}>
        <Text style={[styles.label, local.tabLabel, { color: selected === tab ? colors.primary : appColors.onSurfaceVariant, fontFamily: selected === tab ? 'Montserrat_800ExtraBold' : 'Montserrat_700Bold' }]}>{tab.toUpperCase()}</Text>
      </Pressable>)}
    </View>;
  return <InformationScreen title={content.title}>
    {/* Mounted independently to preserve each tab's reading position. */}
    {content.tabs.map(tab => <ScrollView key={tab} testID={`documentation-${tab.toLowerCase()}`} accessibilityLabel={`${tab} documentation`}
      accessibilityElementsHidden={selected !== tab} importantForAccessibility={selected === tab ? 'auto' : 'no-hide-descendants'}
      style={[styles.scroll, selected !== tab && local.hidden]} contentContainerStyle={styles.content} scrollEnabled={selected === tab} stickyHeaderIndices={[1]}>
        <View style={local.hero}>
          <View style={contentStyles.row}><ContentIcon name="book" /><Text style={[contentStyles.category, { color: colors.primary, flex: 1 }]}>{content.label}</Text></View>
          <Image source={require('../assets/cebspot-logo.png')} style={local.logo} resizeMode="contain" accessibilityLabel="CebSpot logo" />
          <Text accessibilityRole="header" style={[local.mainHeading, { color: appColors.onSurface }]}>{content.heading}</Text>
          <ContentParagraphs paragraphs={[content.subtitle]} />
        </View>
        {tabs}
      {tab === 'Overview' && <>
        <ContentCardView card={content.summary} documentation />
        <Text accessibilityRole="header" style={[styles.cardTitle, { color: appColors.onSurface }]}>{content.technologyHeading}</Text>
        <ContentParagraphs paragraphs={[content.technologySubtitle]} />
        <View testID="technology-grid" style={local.grid}>{content.technologies.map(card => <View key={card.id} style={columns ? local.column : local.fullColumn}><ContentCardView card={card} documentation /></View>)}</View>
      </>}
      {tab === 'Features' && <>
        <Text accessibilityRole="header" style={[styles.cardTitle, { color: appColors.onSurface }]}>{content.featureHeading}</Text>
        {content.features.map(card => <ContentCardView key={card.id} card={card} documentation supportingBullets />)}
      </>}
      {tab === 'Architecture' && <>
        <Text accessibilityRole="header" style={[styles.cardTitle, { color: appColors.onSurface }]}>{content.architectureHeading}</Text>
        <ContentParagraphs paragraphs={[content.architectureIntroduction]} />
        {content.layers.map((card, index) => <View key={card.id} style={{ gap: 16 }}>
          <ContentCardView card={card} number={index + 1} documentation />
          {index < content.layers.length - 1 && <View style={[local.connector, { backgroundColor: appColors.outlineVariant }]} />}
        </View>)}
        <ContentCardView documentation card={{ id: 'integration-specifications', icon: 'server', category: content.integrationLabel, title: content.integrationHeading,
          paragraphs: [content.integrationIntroduction], details: content.flows.map(flow => ({ id: flow.id, heading: flow.title, paragraphs: flow.paragraphs })) }} />
      </>}
      <Pressable accessibilityRole="button" accessibilityLabel={content.backLabel} onPress={() => router.canGoBack() ? router.back() : router.replace('/about')}
        style={({ pressed }) => [local.back, { borderColor: appColors.outlineVariant }, pressed && styles.pressed]}>
        <ArrowLeft size={18} color={colors.primary} /><Text style={[styles.label, { color: colors.primary, flexShrink: 1 }]}>{content.backLabel}</Text>
      </Pressable>
    </ScrollView>)}
  </InformationScreen>;
}

const local = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 6, borderRadius: 20, borderWidth: 1 },
  tab: { flexGrow: 1, flexBasis: 110, minHeight: 48, justifyContent: 'center', padding: 12, borderRadius: 14, borderWidth: 1 },
  largeTab: { flexBasis: '100%' },
  selected: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tabLabel: { textAlign: 'center', flexShrink: 1 },
  hidden: { display: 'none' },
  hero: { gap: 16, paddingVertical: 8 },
  mainHeading: { fontSize: 36, fontFamily: 'Montserrat_800ExtraBold' },
  logo: { width: 56, height: 56 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  column: { width: '48.5%' }, fullColumn: { width: '100%' },
  connector: { height: 20, width: 2, marginLeft: 35 },
  back: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 16 },
});
