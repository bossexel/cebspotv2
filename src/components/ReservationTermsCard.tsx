import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, type AppColors } from '../constants/colors';
import { fontSize, radius, shadow, spacing } from '../constants/design';

interface ReservationTermsCardProps {
  appColors: AppColors;
  paymentRequired: boolean;
  onContinue: () => void;
}

function TermsSection({ title, body, appColors }: { title?: string; body: string; appColors: AppColors }) {
  return (
    <View style={styles.section}>
      {title && <View style={styles.headingRow}>
        <View style={styles.accent} />
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>{title}</Text>
      </View>}
      <Text style={[styles.body, { color: appColors.onSurfaceVariant }]}>{body}</Text>
    </View>
  );
}

export function ReservationTermsCard({ appColors, paymentRequired, onContinue }: ReservationTermsCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: appColors.surfaceLow }]}>
      <View style={styles.patternOne} />
      <View style={styles.patternTwo} />
      <Text style={[styles.title, { color: appColors.onSurface }]}>IMPORTANT: Terms and Conditions</Text>

      <TermsSection
        appColors={appColors}
        title={paymentRequired ? 'Paid Reservation' : 'Free Reservation'}
        body={paymentRequired ? `- Once your reservation is booked and paid, cancellation is not allowed, in accordance with the spot's policies.
• All processing fees are NON-REFUNDABLE.
• Deposits are retainers and will be applied to your total bill on the night of the event, unless the table is a no show in which case the deposit is forfeited. The deposit will become a cancellation fee for no-show tables.
• Deposits are NON-REFUNDABLE.
• All events are 21+. Proper identification (government issued driver’s licenses, passports, liquor IDs, military IDs) required for entry.
• No alcohol permitted out of the premises.
• Entry is at the discretion of our door security staff and management. Due to legal liability we will not admit anyone who has engaged in prior drinking.
• All table reservations must arrive before 12 midnight, unless prior arrangements are made with the VIP hosts.
• Any tables that do not arrive by 12 midnight will be resold to any waiting parties and the deposit on the table is forfeited and applied as a cancellation fee.
• Patrons must abide by our dress code policy and may be refused entry.` : `• No reservation fee or deposit is required for this booking.
• You may cancel your free reservation before the scheduled visit, subject to the spot's cancellation policy.
• You may request adjustments to your reservation. Changes are subject to availability and the spot's policies.
• Please cancel or request adjustments as early as possible so the spot can update its availability.
• Please follow the spot's arrival and entry requirements. Contact the spot if you expect to arrive late.`}
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
