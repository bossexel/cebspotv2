import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Award, Bell, BookOpen, Bookmark, CalendarDays, Clock, CreditCard, Database, Image, Mail, MapPin, Pencil, Search, Server, Settings, ShieldCheck, Smartphone, UserRound, Users } from 'lucide-react-native';
import type { ContentBlock, ContentCard, InformationIcon } from '../constants/informationContent';
import { isValidAboutLink } from '../constants/about';
import { openInformationLink } from '../utils/externalLinks';
import { useTheme } from '../hooks/useTheme';
import { colors } from '../constants/colors';
import { informationStyles as shared } from './InformationScreen';

const icons = { book: BookOpen, map: MapPin, search: Search, users: Users, database: Database, shield: ShieldCheck, image: Image, bell: Bell, payment: CreditCard, phone: Smartphone, server: Server, bookmark: Bookmark, award: Award, calendar: CalendarDays, account: UserRound, edit: Pencil, clock: Clock, mail: Mail, settings: Settings };

export function ContentIcon({ name, tint }: { name: InformationIcon; tint?: string }) {
  const { appColors } = useTheme();
  const Icon = icons[name];
  return <View accessible={false} style={[contentStyles.icon, { backgroundColor: tint ? `${tint}18` : appColors.surfaceLow }]}><Icon size={22} color={tint ?? colors.primary} /></View>;
}

export function ContentParagraphs({ paragraphs }: { paragraphs: string[] }) {
  const { appColors } = useTheme();
  return <>{paragraphs.map((paragraph, index) => <Text key={index} style={[shared.body, { color: appColors.onSurfaceVariant }]}>{paragraph}</Text>)}</>;
}

export function ContentBlocks({ blocks }: { blocks?: ContentBlock[] }) {
  const { appColors } = useTheme();
  return <>{blocks?.map(block => <View key={block.id} style={[contentStyles.block, block.context && [contentStyles.context, { backgroundColor: appColors.surfaceLow, borderColor: colors.primary }]]}>
    {block.heading && <Text accessibilityRole="header" style={[shared.label, { color: appColors.onSurface, fontSize: 16 }]}>{block.heading}</Text>}
    <ContentParagraphs paragraphs={block.paragraphs ?? []} />
    {block.items?.map((item, index) => <View key={index} style={contentStyles.listRow}>
      <Text style={[shared.body, { color: colors.primary }]}>{block.numbered ? `${index + 1}.` : '•'}</Text>
      <Text style={[shared.body, { flex: 1, minWidth: 0, color: appColors.onSurfaceVariant }]}>{item}</Text>
    </View>)}
    {block.links?.filter(link => link.label.trim() && isValidAboutLink(link.url)).map(link => <Pressable key={link.url} accessibilityRole="link" onPress={() => void openInformationLink(link)} style={({ pressed }) => [contentStyles.link, pressed && shared.pressed]}>
      <Text style={[shared.label, { color: colors.primary }]}>{link.label}</Text>
    </Pressable>)}
  </View>)}</>;
}

export function ContentCardView({ card, number, documentation = false, supportingBullets = false }: { card: ContentCard; number?: number; documentation?: boolean; supportingBullets?: boolean }) {
  const { appColors, isDarkMode } = useTheme();
  const tint = documentation ? ({ database: '#8C76BB', shield: '#61966C', map: '#498F91', image: '#B27396', server: '#638FC1' } as Partial<Record<InformationIcon, string>>)[card.icon] ?? colors.primary : undefined;
  const blocks = supportingBullets ? card.details?.map(block => block.context ? block : ({ ...block, paragraphs: undefined, items: [...(block.paragraphs ?? []), ...(block.items ?? [])] })) : card.details;
  return <View testID={`content-card-${card.id}`} style={[contentStyles.card, { backgroundColor: documentation && !isDarkMode ? '#F1EEE6' : appColors.surfaceRaised, borderColor: appColors.outlineVariant }]}>
    <View style={contentStyles.row}>
      {number !== undefined && <View style={[contentStyles.number, { backgroundColor: colors.primary }]}><Text style={[shared.label, { color: colors.white }]}>{number}</Text></View>}
      <ContentIcon name={card.icon} tint={tint} />
      <View style={contentStyles.heading}>
        <Text style={[contentStyles.category, { color: colors.primary }]}>{card.category}</Text>
        <Text accessibilityRole="header" style={[shared.cardTitle, { color: appColors.onSurface }]}>{card.title}</Text>
      </View>
    </View>
    <ContentParagraphs paragraphs={card.paragraphs} />
    {!!blocks?.length && <><View style={[contentStyles.divider, { backgroundColor: appColors.outlineVariant }]} /><ContentBlocks blocks={blocks} /></>}
    {!!card.chips?.length && <View testID={`content-chips-${card.id}`} style={contentStyles.chips}>{card.chips.map(chip => <View key={chip} style={[contentStyles.chip, { backgroundColor: appColors.surfaceLow, borderColor: appColors.outlineVariant }]}><Text style={[shared.label, { fontSize: 12, flexShrink: 1, color: appColors.onSurfaceVariant }]}>{chip}</Text></View>)}</View>}
  </View>;
}

export const contentStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 16, shadowColor: '#000', shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1, minWidth: 0, gap: 6 },
  category: { fontSize: 11, lineHeight: 17, letterSpacing: 1, fontFamily: 'Montserrat_700Bold' },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  number: { minWidth: 32, minHeight: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 6 },
  divider: { height: 1 },
  block: { gap: 12 },
  context: { borderLeftWidth: 3, borderRadius: 12, padding: 16 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { maxWidth: '100%', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  link: { minHeight: 48, justifyContent: 'center' },
});
