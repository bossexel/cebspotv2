import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from './ScreenContainer';
import { useTheme } from '../hooks/useTheme';
import { fontSize, radius, spacing } from '../constants/design';

export function InformationScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const { appColors } = useTheme();
  return (
    <ScreenContainer appColors={appColors} padded={false}>
      <View style={informationStyles.frame}>
        <View style={informationStyles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to About CebSpot"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/about')}
            style={({ pressed }) => [informationStyles.back, { backgroundColor: appColors.surfaceLow }, pressed && informationStyles.pressed]}>
            <ArrowLeft size={22} color={appColors.onSurface} />
          </Pressable>
          <Text accessibilityRole="header" style={[informationStyles.title, { color: appColors.onSurface }]}>{title}</Text>
        </View>
        {children}
      </View>
    </ScreenContainer>
  );
}

export const informationStyles = StyleSheet.create({
  frame: { flex: 1, width: '100%', maxWidth: 1180, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  back: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  title: { flex: 1, minWidth: 0, flexShrink: 1, fontSize: fontSize.xxl, fontFamily: 'Montserrat_800ExtraBold' },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: { padding: spacing.lg, borderRadius: radius.xl, gap: spacing.md },
  cardTitle: { fontSize: fontSize.xl, fontFamily: 'Montserrat_800ExtraBold' },
  label: { fontSize: fontSize.md, fontFamily: 'Montserrat_700Bold' },
  body: { fontSize: 16, lineHeight: 27, fontFamily: 'Montserrat_400Regular' },
  pressed: { opacity: 0.75 },
});
