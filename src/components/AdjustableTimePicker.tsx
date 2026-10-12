import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors, type AppColors } from '../constants/colors';

export function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function shiftPickerTime(time: string, minutes: number) {
  const next = ((timeToMinutes(time) + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}

export function formatPickerTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function AdjustableTimePicker({ value, onChange, appColors, isTimeAllowed = () => true }: {
  value: string;
  onChange: (time: string) => void;
  appColors: AppColors;
  isTimeAllowed?: (time: string) => boolean;
}) {
  const total = timeToMinutes(value);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  const candidate = (amount: number) => shiftPickerTime(value, amount);
  const adjust = (amount: number) => {
    const next = candidate(amount);
    if (isTimeAllowed(next)) onChange(next);
  };
  const border = { borderColor: appColors.outlineVariant };
  const arrow = (label: string, amount: number) => {
    const disabled = !isTimeAllowed(candidate(amount));
    const Icon = amount > 0 ? ChevronUp : ChevronDown;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => adjust(amount)}
        style={({ pressed }) => [styles.arrow, pressed && { backgroundColor: appColors.surfaceLow }]}
      >
        <Icon size={20} strokeWidth={3} color={disabled ? appColors.outlineVariant : colors.primary} />
      </Pressable>
    );
  };
  const periodDisabled = !isTimeAllowed(candidate(720));

  return (
    <View style={[styles.picker, border, { backgroundColor: appColors.surfaceRaised }]}>
      {(['hour', 'minute'] as const).map((unit, index) => (
        <React.Fragment key={unit}>
          {index === 1 && (
            <View style={[styles.separatorColumn, border]}>
              <View style={[styles.separator, border]}>
                <Text style={[styles.colon, { color: appColors.onSurfaceVariant }]}>:</Text>
              </View>
            </View>
          )}
          <View style={[styles.numberColumn, border]}>
            {arrow(`Increase ${unit}`, unit === 'hour' ? 60 : 1)}
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={unit === 'hour' ? 'Hour' : 'Minute'}
              accessibilityValue={{ text: unit === 'hour' ? String(hour % 12 || 12) : String(minute) }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) => adjust((event.nativeEvent.actionName === 'increment' ? 1 : -1) * (unit === 'hour' ? 60 : 1))}
              style={[styles.valueCell, border]}
            >
              <Text style={styles.number}>{String(unit === 'hour' ? hour % 12 || 12 : minute).padStart(2, '0')}</Text>
            </View>
            {arrow(`Decrease ${unit}`, unit === 'hour' ? -60 : -1)}
          </View>
        </React.Fragment>
      ))}
      <View style={styles.periodColumn}>
        <View style={[styles.periodCell, border]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${hour >= 12 ? 'AM' : 'PM'}`}
            accessibilityState={{ disabled: periodDisabled }}
            disabled={periodDisabled}
            onPress={() => adjust(720)}
            style={({ pressed }) => [styles.periodButton, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.periodText}>{hour >= 12 ? 'PM' : 'AM'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { flexDirection: 'row', width: '100%', maxWidth: 280, borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  numberColumn: { flex: 1, borderRightWidth: 1 },
  arrow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  valueCell: { height: 48, borderTopWidth: 1, borderBottomWidth: 1, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'], color: colors.primary },
  separatorColumn: { width: 24, paddingTop: 44, borderRightWidth: 1 },
  separator: { height: 48, borderTopWidth: 1, borderBottomWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colon: { fontSize: 20 },
  periodColumn: { width: 70, paddingTop: 44 },
  periodCell: { height: 48, borderTopWidth: 1, borderBottomWidth: 1, alignItems: 'center', justifyContent: 'center' },
  periodButton: { minHeight: 44, minWidth: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: colors.primary },
  periodText: { color: colors.white, fontSize: 20, fontWeight: '600' },
});
