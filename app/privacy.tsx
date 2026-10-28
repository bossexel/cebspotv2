import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, MapPin, Search, TriangleAlert, X } from 'lucide-react-native';
import { InformationScreen, informationStyles as shared } from '../src/components/InformationScreen';
import { ContentIcon, contentStyles } from '../src/components/InformationContent';
import { CebspotContent as content, referencePolicySearchText, type ReferencePolicyBlock } from '../src/constants/Cebspot';
import { openInformationLink } from '../src/utils/externalLinks';
import { useTheme } from '../src/hooks/useTheme';
import { colors } from '../src/constants/colors';

export default function PrivacyScreen() {
  const { appColors, isDarkMode } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const scroll = useRef<ScrollView>(null);
  const term = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => content.sections.filter(section => !term || referencePolicySearchText(section).includes(term)), [term]);
  const bodyColor = { color: appColors.onSurfaceVariant };
  const beige = isDarkMode ? appColors.surfaceRaised : '#F1EEE6';
  const inset = isDarkMode ? appColors.surfaceLow : '#E8E4D8';
  const twoColumns = width >= 320 && fontScale <= 1.3;
  const changeSearch = (text: string) => {
    setQuery(text);
    if (text.trim()) setCollapsed(new Set());
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const toggle = (id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const renderBlock = (block: ReferencePolicyBlock, index: number) => {
    const statement = block.variant === 'statement';
    const warning = block.variant === 'warning';
    const location = block.variant === 'location';
    const panelColor = statement ? (isDarkMode ? '#15371E' : '#E1EEDC') : warning ? (isDarkMode ? '#3B2C14' : '#FFF0D5') : inset;
    return <View key={block.id} testID={block.variant ? `privacy-panel-${block.variant}` : undefined}
      style={[local.block, index > 0 && local.separated, { borderColor: appColors.outlineVariant }, (statement || warning || location) && [local.panel, { backgroundColor: panelColor }]]}>
      {statement && <CheckCircle2 size={20} color={isDarkMode ? '#8FCA91' : '#37613A'} />}
      {warning && <TriangleAlert size={20} color={isDarkMode ? '#FFCD80' : '#895E16'} />}
      {block.heading && <View style={local.row}>{location && <MapPin size={18} color={colors.primary} />}<Text accessibilityRole="header" style={[local.subheading, { color: appColors.onSurface }]}>{block.heading}</Text></View>}
      {block.paragraphs?.map((paragraph, paragraphIndex) => <Text key={paragraphIndex} style={[shared.body, bodyColor, statement && { color: isDarkMode ? '#A8D6AA' : '#37613A', fontFamily: 'Montserrat_700Bold' }]}>{paragraph}</Text>)}
      {block.variant === 'services' ? <View testID="privacy-services-grid" style={local.grid}>
        {block.items?.map(item => <View key={item} style={[local.service, { width: twoColumns ? '46%' : '100%', backgroundColor: inset, borderColor: appColors.outlineVariant }]}><Text style={[shared.body, { color: appColors.onSurface }]}>{item}</Text></View>)}
      </View> : block.items?.map(item => <View key={item} style={local.bullet}><Text style={[shared.body, bodyColor]}>•</Text><Text style={[shared.body, bodyColor, local.flexText]}>{item}</Text></View>)}
      {block.email && <Pressable accessibilityRole="link" accessibilityLabel={block.email.label}
        onPress={() => void openInformationLink(block.email!)} style={({ pressed }) => [local.email, pressed && shared.pressed]}>
        <Text style={[shared.body, { color: colors.primary, textDecorationLine: 'underline' }]}>{block.email.label}</Text>
      </Pressable>}
    </View>;
  };
  return <InformationScreen title={content.title}>
    <View style={local.date}><CalendarDays size={18} color={appColors.onSurfaceVariant} /><Text style={[shared.body, bodyColor, local.flexText]}>{content.effectiveDate}</Text></View>
    <View style={[local.search, { backgroundColor: beige, borderColor: appColors.outlineVariant }]}>
      <Search size={20} color={appColors.onSurfaceVariant} />
      <TextInput accessibilityLabel={content.searchLabel} placeholder={content.searchPlaceholder} placeholderTextColor={appColors.onSurfaceVariant}
        value={query} onChangeText={changeSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={[shared.body, local.input, { color: appColors.onSurface }]} />
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel={content.clearLabel} onPress={() => changeSearch('')} style={({ pressed }) => [local.clear, pressed && shared.pressed]}><X size={20} color={appColors.onSurface} /></Pressable>}
    </View>
    <ScrollView ref={scroll} testID="privacy-scroll" style={shared.scroll} contentContainerStyle={[shared.content, local.content]} keyboardShouldPersistTaps="handled">
      {matches.length === 0 && <View style={[contentStyles.card, { backgroundColor: beige, borderColor: appColors.outlineVariant }]}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[shared.cardTitle, { color: appColors.onSurface }]}>{content.emptyTitle}</Text><Text style={[shared.body, bodyColor]}>{content.emptyBody}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={content.clearLabel} onPress={() => changeSearch('')} style={local.clear}><Text style={[shared.label, { color: colors.primary }]}>{content.clearLabel}</Text></Pressable>
      </View>}
      {matches.map(section => {
        const open = !collapsed.has(section.id);
        return <View key={section.id} testID={`privacy-card-${section.id}`} style={[contentStyles.card, { backgroundColor: beige, borderColor: appColors.outlineVariant }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={section.title} accessibilityHint={content.toggleHint}
            accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => toggle(section.id)} style={({ pressed }) => [local.row, local.sectionToggle, pressed && shared.pressed]}>
            <ContentIcon name={section.icon} /><Text accessibilityRole="header" style={[shared.cardTitle, local.flexText, { color: appColors.onSurface }]}>{section.title}</Text>
            {open ? <ChevronUp size={18} color={appColors.onSurfaceVariant} /> : <ChevronDown size={18} color={appColors.onSurfaceVariant} />}
          </Pressable>
          {open && <View testID={`privacy-section-${section.id}`} style={local.blocks}>{section.blocks.map(renderBlock)}</View>}
        </View>;
      })}
    </ScrollView>
  </InformationScreen>;
}

const local = StyleSheet.create({
  content: { gap: 20, paddingBottom: 40 },
  date: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingBottom: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 14, minHeight: 56 },
  input: { flex: 1, minWidth: 0, paddingVertical: 14 },
  clear: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  flexText: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionToggle: { minHeight: 48 },
  blocks: { gap: 20 }, block: { gap: 14 },
  separated: { borderTopWidth: 1, paddingTop: 20 },
  subheading: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, letterSpacing: 0.8, fontFamily: 'Montserrat_700Bold' },
  panel: { padding: 16, borderRadius: 14, borderWidth: 1 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  service: { flexGrow: 1, minWidth: 0, padding: 12, borderRadius: 12, borderWidth: 1 },
  email: { minHeight: 48, justifyContent: 'center' },
});
