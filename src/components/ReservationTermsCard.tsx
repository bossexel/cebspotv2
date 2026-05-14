import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, type AppColors } from '../constants/colors';
import { fontSize, radius, shadow, spacing } from '../constants/design';

interface ReservationTermsCardProps {
  appColors: AppColors;
  onContinue: () => void;
}

function TermsSection({ title, body, appColors }: { title: string; body: string; appColors: AppColors }) {
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.accent} />
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>{title}</Text>
      </View>
      <Text style={[styles.body, { color: appColors.onSurfaceVariant }]}>{body}</Text>
    </View>
  );
}

export function ReservationTermsCard({ appColors, onContinue }: ReservationTermsCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: appColors.surfaceLow }]}>
      <View style={styles.patternOne} />
      <View style={styles.patternTwo} />
      <Text style={[styles.title, { color: appColors.onSurface }]}>Terms and Conditions</Text>

      <TermsSection
        appColors={appColors}
        title="Arrival"
        body="Please arrive on or before your reservation time. Guests arriving more than 30 minutes late may be transferred to the waitlist."
      />

      <TermsSection
        appColors={appColors}
        title="Cancellation & Reschedule"
        body="To reschedule or cancel your reservation, open your reservation in your reservations where you will find cancellation and reschedule button. This will take you to your booking page where you can make changes to your reservation."
      />

      <Pressable style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>Got it</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  patternOne: {
    position: 'absolute',
    top: -18,
    right: 18,
    width: 70,
    height: 70,
    borderRadius: 18,
    borderWidth: 10,
    borderColor: colors.outlineVariant + '22',
    transform: [{ rotate: '45deg' }],
  },
  patternTwo: {
    position: 'absolute',
    top: 30,
    right: -24,
    width: 82,
    height: 82,
    borderRadius: 22,
    borderWidth: 10,
    borderColor: colors.outlineVariant + '18',
    transform: [{ rotate: '45deg' }],
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '900',
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  accent: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  body: {
    paddingLeft: spacing.md + 3,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700',
  },
  button: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    ...shadow.card,
  },
  buttonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
