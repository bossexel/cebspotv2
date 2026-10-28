import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDays, format } from 'date-fns';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Info,
  RefreshCw,
  ShieldCheck,
  XCircle,
  UsersRound,
} from 'lucide-react-native';
import { AdjustableTimePicker, formatPickerTime } from '../../src/components/AdjustableTimePicker';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors } from '../../src/constants/colors';
import {
  clubFloorTables,
  clubTableColors,
  clubTableDisplayName,
  normalizeClubTableInventory,
} from '../../src/constants/clubFloorPlan';
import type { AppColors } from '../../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../../src/constants/design';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { reservationService } from '../../src/services/reservationService';
import { getReservationTableAvailability } from '../../src/services/reservationTableService';
import { spotService } from '../../src/services/spotService';
import type { ReservationStatus, Spot } from '../../src/types';
import {
  calculateReservationFee,
  checkReservationAvailability,
  getSpotReservationType,
  isPaymentRequired,
} from '../../src/utils/reservations';
import { createEmptyTableInventory, normalizeStoredTableInventory, type TableBookingPolicy } from '../../src/utils/tableInventory';
import { venueTableService, type VenueTableAvailability } from '../../src/services/venueTableService';
import { GuestTableChoices } from '../../src/components/GuestTableChoices';
import { getReservationTimeSlot } from '../../src/utils/reservationTimeSlot';
import { getReservationContact } from '../../src/utils/reservationContact';

const testCebspotSpotId = '66666666-6666-4666-8666-666666666666';
const tableHoldDurationSeconds = 5 * 60;

const groupSizes = [
  { id: 'solo', label: 'Solo', subtitle: '(1 person)', guests: 1 },
  { id: 'table-for-2', label: 'Table for 2', subtitle: '(2 persons)', guests: 2 },
  { id: 'small-group', label: 'Small Group', subtitle: '(3-5 party)', guests: 4 },
  { id: 'big-group', label: 'Big Group', subtitle: '(6+ party)', guests: 6 },
] as const;

type Slot = { id: SlotId; name: string; time: string; startTime: string };
type GroupSize = (typeof groupSizes)[number];
type SlotId = 'sunset' | 'prime' | 'late';
type GroupSizeId = GroupSize['id'];
type BookingSectionKey = 'date' | 'time' | 'group';

type TableOption = {
  tableId: string;
  capacity: number;
  isReserved: boolean;
  bookingPolicy?: TableBookingPolicy;
};

type TableInventory = Record<SlotId, TableOption[]>;

type SlotAvailability = {
  availableTables: TableOption[];
  isAvailable: boolean;
  label: string;
};

function getReservationTypeReviewLabel(paymentRequired: boolean) {
  return paymentRequired ? 'Reservation Fee' : 'Free Reservation';
}

function getPaymentStatusPreview(paymentRequired: boolean) {
  return paymentRequired ? 'Pending' : 'Not Required';
}

function toDateValue(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function toLocalDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getCalendarDates(monthDate: Date) {
  const firstDay = getMonthStart(monthDate);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const leadingEmptyDays = (firstDay.getDay() + 6) % 7;
  const dates: (Date | null)[] = Array.from({ length: leadingEmptyDays }, () => null);

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    dates.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (dates.length % 7 !== 0) {
    dates.push(null);
  }

  return dates;
}

const tableInventory = createEmptyTableInventory() as TableInventory;

function getGroupSizeLabel(groupSizeId: GroupSizeId) {
  return groupSizes.find((group) => group.id === groupSizeId)?.label ?? 'selected group size';
}

function getRequiredCapacity(groupSizeId: GroupSizeId) {
  switch (groupSizeId) {
    case 'solo':
      return 1;
    case 'table-for-2':
      return 2;
    case 'small-group':
      return 5;
    case 'big-group':
      return 6;
    default:
      return 1;
  }
}

function cloneInventory(inventory: TableInventory): TableInventory {
  return {
    sunset: inventory.sunset.map((table) => ({ ...table })),
    prime: inventory.prime.map((table) => ({ ...table })),
    late: inventory.late.map((table) => ({ ...table })),
  };
}

function reserveTables(inventory: TableInventory, slotId: SlotId, tableIds: string[]) {
  inventory[slotId] = inventory[slotId].map((table) =>
    tableIds.includes(table.tableId) ? { ...table, isReserved: true } : table
  );
}

function getTableInventoryForDate(_date: string, baseInventory = tableInventory, _simulateDemoAvailability = false): TableInventory {
  return cloneInventory(baseInventory);
}

function getAvailableTablesForSlot(
  slotId: SlotId,
  groupSizeId: GroupSizeId,
  date: string,
  baseInventory = tableInventory,
  simulateDemoAvailability = true,
) {
  const requiredCapacity = getRequiredCapacity(groupSizeId);
  const inventory = getTableInventoryForDate(date, baseInventory, simulateDemoAvailability);

  return inventory[slotId].filter((table) => !table.isReserved && table.bookingPolicy !== 'walk_in_only' && table.capacity >= requiredCapacity);
}

function formatHoldTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function isSlotAvailable(
  slotId: SlotId,
  groupSizeId: GroupSizeId,
  date: string,
  baseInventory = tableInventory,
  simulateDemoAvailability = true,
) {
  return getAvailableTablesForSlot(slotId, groupSizeId, date, baseInventory, simulateDemoAvailability).length > 0;
}

function getAvailabilityLabel(
  slotId: SlotId,
  groupSizeId: GroupSizeId,
  date: string,
  baseInventory = tableInventory,
  simulateDemoAvailability = true,
) {
  const inventory = getTableInventoryForDate(date, baseInventory, simulateDemoAvailability);
  const availableTables = getAvailableTablesForSlot(slotId, groupSizeId, date, baseInventory, simulateDemoAvailability);
  const openTables = inventory[slotId].filter((table) => !table.isReserved && table.bookingPolicy !== 'walk_in_only');
  const count = availableTables.length;

  if (inventory[slotId].length === 0) return 'No tables configured';
  if (count === 0 && openTables.length === 0) return 'Fully booked';
  if (count === 0) return `Not available for ${getGroupSizeLabel(groupSizeId)}`;
  if (count === 1) return 'Last table';
  if (count <= 2) return 'Limited spots';
  return `${count} tables available`;
}

function getSlotAvailability(
  slotId: SlotId,
  groupSizeId: GroupSizeId,
  date: string,
  baseInventory = tableInventory,
  simulateDemoAvailability = true,
): SlotAvailability {
  const availableTables = getAvailableTablesForSlot(slotId, groupSizeId, date, baseInventory, simulateDemoAvailability);
  return {
    availableTables,
    isAvailable: isSlotAvailable(slotId, groupSizeId, date, baseInventory, simulateDemoAvailability),
    label: getAvailabilityLabel(slotId, groupSizeId, date, baseInventory, simulateDemoAvailability),
  };
}

function SectionTitle({
  title,
  icon,
  side,
  appColors,
}: {
  title: string;
  icon: React.ReactNode;
  side?: React.ReactNode;
  appColors: AppColors;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleLeft}>
        {icon}
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>{title}</Text>
      </View>
      {side}
    </View>
  );
}

function DateSelector({
  dates,
  selectedDate,
  onSelectDate,
  appColors,
}: {
  dates: Date[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  appColors: AppColors;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(getMonthStart(toLocalDate(selectedDate)));
  const calendarDates = useMemo(() => getCalendarDates(visibleMonth), [visibleMonth]);
  const selectedDateObject = toLocalDate(selectedDate);

  useEffect(() => {
    setVisibleMonth(getMonthStart(toLocalDate(selectedDate)));
  }, [selectedDate]);

  function moveMonth(direction: -1 | 1) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  return (
    <>
      <SectionTitle
        title="Select Date"
        appColors={appColors}
        icon={<CalendarDays size={16} color={colors.primary} />}
        side={
          <Pressable style={styles.calendarToggle} onPress={() => setExpanded((current) => !current)}>
            <Text style={styles.monthLabel}>{format(selectedDateObject, 'MMMM yyyy').toUpperCase()}</Text>
            {expanded ? <ChevronUp size={14} color={colors.primary} /> : <ChevronDown size={14} color={colors.primary} />}
          </Pressable>
        }
      />
      <View style={[styles.dateTray, { backgroundColor: appColors.surfaceLow }]}>
        {dates.map((day) => {
          const value = toDateValue(day);
          const selected = value === selectedDate;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelectDate(value)}
              style={[styles.dateChip, selected && styles.dateChipSelected]}
            >
              <Text style={[styles.dateDow, { color: selected ? colors.white : appColors.onSurfaceVariant }]}>
                {format(day, 'EEEEE')}
              </Text>
              <Text style={[styles.dateDay, { color: selected ? colors.white : appColors.onSurface }]}>
                {format(day, 'd')}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {expanded && (
        <View style={[styles.calendarPanel, { backgroundColor: appColors.surfaceLow }]}>
          <View style={styles.calendarHeader}>
            <Pressable
              accessibilityRole="button"
              style={[styles.calendarNavButton, { backgroundColor: appColors.surfaceRaised }]}
              onPress={() => moveMonth(-1)}
            >
              <ChevronLeft size={18} color={appColors.onSurface} />
            </Pressable>
            <View style={styles.calendarHeaderCopy}>
              <Text style={[styles.calendarMonth, { color: appColors.onSurface }]}>
                {format(visibleMonth, 'MMMM yyyy')}
              </Text>
              <Text style={[styles.calendarSelected, { color: appColors.onSurfaceVariant }]}>
                {format(selectedDateObject, 'EEE, MMM d')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              style={[styles.calendarNavButton, { backgroundColor: appColors.surfaceRaised }]}
              onPress={() => moveMonth(1)}
            >
              <ChevronRight size={18} color={appColors.onSurface} />
            </Pressable>
          </View>

          <View style={styles.weekHeader}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <Text key={`${day}-${index}`} style={[styles.weekDay, { color: appColors.onSurfaceVariant }]}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDates.map((day, index) => {
              if (!day) {
                return <View key={`empty-${index}`} style={styles.calendarDayCell} />;
              }

              const value = toDateValue(day);
              const selected = value === selectedDate;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.calendarDayCell, selected && styles.calendarDaySelected]}
                  onPress={() => onSelectDate(value)}
                >
                  <Text style={[styles.calendarDayText, { color: selected ? colors.white : appColors.onSurface }]}>
                    {format(day, 'd')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </>
  );
}

function ExperienceSlotSelector({
  time, onChangeTime, notice, appColors,
}: {
  time: string;
  onChangeTime: (time: string) => void;
  notice: string;
  appColors: AppColors;
}) {
  return (
    <View style={styles.sectionBlock}>
      <SectionTitle title="Experience Slot" appColors={appColors} icon={<Clock3 size={16} color={colors.primary} />} />
      <Text style={[styles.timePickerHelp, { color: appColors.onSurfaceVariant }]}>
        Adjust the hours and minutes with the arrows. Tap AM or PM to switch.
      </Text>
      <View style={[styles.timePickerPanel, { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant }]}>
        <Text style={[styles.timePickerLabel, { color: appColors.onSurface }]}>Reservation time</Text>
        <AdjustableTimePicker value={time} onChange={onChangeTime} appColors={appColors} />
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.timePickerHelp, { color: appColors.onSurfaceVariant }]}>
        Arrival time: {formatPickerTime(time)}
      </Text>
      {!!notice && <Text style={styles.availabilityNotice}>{notice}</Text>}
    </View>
  );
}

function GroupSizeOptionCard({
  group,
  selected,
  onPress,
  appColors,
}: {
  group: GroupSize;
  selected: boolean;
  onPress: () => void;
  appColors: AppColors;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.groupCard,
        {
          backgroundColor: selected ? colors.primary + '06' : appColors.surfaceLow,
          borderColor: selected ? colors.primary : appColors.surfaceLow,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.groupLabel, { color: appColors.onSurface }]}>{group.label}</Text>
      <Text style={[styles.groupSub, { color: appColors.onSurfaceVariant }]}>{group.subtitle}</Text>
    </Pressable>
  );
}

function GroupSizeSelector({
  selectedGroupId,
  onSelectGroup,
  appColors,
}: {
  selectedGroupId: GroupSizeId;
  onSelectGroup: (groupId: GroupSizeId) => void;
  appColors: AppColors;
}) {
  return (
    <View style={styles.sectionBlock}>
      <SectionTitle
        title="Group Size"
        appColors={appColors}
        icon={<UsersRound size={16} color={colors.primary} />}
      />
      <View style={styles.groupGrid}>
        {groupSizes.map((group) => (
          <GroupSizeOptionCard
            key={group.id}
            group={group}
            selected={group.id === selectedGroupId}
            onPress={() => onSelectGroup(group.id)}
            appColors={appColors}
          />
        ))}
      </View>
    </View>
  );
}

function ClubFloorPlanSelector({
  inventory,
  selectedSlotId,
  selectedTableId,
  selectedGroupId,
  loadingAvailability,
  onSelectTable,
  onRefresh,
  appColors,
}: {
  inventory: TableInventory;
  selectedSlotId: SlotId | null;
  selectedTableId: string | null;
  selectedGroupId: GroupSizeId;
  loadingAvailability: boolean;
  onSelectTable: (tableId: string) => void;
  onRefresh: () => void;
  appColors: AppColors;
}) {
  const requiredCapacity = getRequiredCapacity(selectedGroupId);
  const tableById = new Map((selectedSlotId ? inventory[selectedSlotId] : []).map((table) => [table.tableId, table]));
  const selectedLabel = selectedTableId ? clubTableDisplayName(selectedTableId) : null;

  return (
    <View style={styles.sectionBlock}>
      <SectionTitle
        title="Choose Your Table"
        appColors={appColors}
        icon={<UsersRound size={16} color={colors.primary} />}
        side={
          <Pressable accessibilityRole="button" style={styles.floorRefreshButton} onPress={onRefresh}>
            {loadingAvailability ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <RefreshCw size={14} color={colors.primary} />
            )}
            <Text style={styles.floorRefreshText}>Availability</Text>
          </Pressable>
        }
      />
      <Text style={[styles.floorPlanHelp, { color: appColors.onSurfaceVariant }]}>
        Swipe across the floor plan and tap an available table. Reserved tables are dimmed and marked with an X.
      </Text>
      <View style={[styles.floorPlanLegend, { backgroundColor: appColors.surfaceLow }]}>
        {[
          ['Cocktail · 4 pax', clubTableColors.cocktail],
          ['Main-floor VIP · 10 pax', clubTableColors['vip-main']],
          ['VVIP · 10 pax', clubTableColors['vvip-main']],
          ['Mezzanine VIP · 10 pax', clubTableColors['vip-mezzanine']],
        ].map(([label, color]) => (
          <View key={label} style={styles.floorLegendItem}>
            <View style={[styles.floorLegendDot, { backgroundColor: color }]} />
            <Text style={[styles.floorLegendText, { color: appColors.onSurfaceVariant }]}>{label}</Text>
          </View>
        ))}
        <View style={styles.floorLegendItem}>
          <View style={[styles.floorLegendDot, styles.floorReservedLegendDot]}>
            <Text style={styles.floorReservedLegendX}>×</Text>
          </View>
          <Text style={[styles.floorLegendText, { color: appColors.onSurfaceVariant }]}>Reserved</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.floorPlanScrollContent}
      >
        <View style={styles.floorPlanCanvas}>
          <Svg width={720} height={700} viewBox="0 0 720 700">
            <Rect x="8" y="8" width="704" height="684" rx="18" fill="#090A0C" />
            <Rect x="40" y="24" width="640" height="304" rx="8" fill="none" stroke="#F4F4F5" strokeWidth="3" />
            <Rect x="40" y="354" width="640" height="312" rx="8" fill="#16270E" stroke="#86C51F" strokeWidth="3" />
            <SvgText x="24" y="188" fill="#F4F4F5" fontSize="24" fontWeight="800" rotation="-90" origin="24,188">MAIN FLOOR</SvgText>
            <SvgText x="24" y="570" fill="#86C51F" fontSize="24" fontWeight="800" rotation="-90" origin="24,570">MEZZANINE</SvgText>
            <Rect x="306" y="46" width="104" height="58" rx="5" fill="#F4F4F5" />
            <SvgText x="358" y="80" fill="#111827" fontSize="14" fontWeight="900" textAnchor="middle">DJ BOOTH</SvgText>
            <Rect x="574" y="178" width="82" height="90" rx="6" fill="none" stroke="#F4F4F5" strokeWidth="3" />
            <SvgText x="615" y="218" fill="#F4F4F5" fontSize="15" fontWeight="900" textAnchor="middle">MAIN</SvgText>
            <SvgText x="615" y="238" fill="#F4F4F5" fontSize="15" fontWeight="900" textAnchor="middle">BAR</SvgText>
            <Rect x="42" y="270" width="62" height="54" fill="#159C96" />
            <SvgText x="73" y="300" fill="#FFFFFF" fontSize="10" fontWeight="800" textAnchor="middle">ENTRY</SvgText>
            <Line x1="205" y1="336" x2="650" y2="336" stroke="#F4F4F5" strokeWidth="2" />
            <SvgText x="615" y="384" fill="#A7F3D0" fontSize="10" fontWeight="700" textAnchor="middle">KTV LOUNGE</SvgText>
            <SvgText x="615" y="397" fill="#A7F3D0" fontSize="10" fontWeight="700" textAnchor="middle">GOLF SIMULATOR</SvgText>

            {clubFloorTables.map((table) => {
              const savedTable = tableById.get(table.tableId);
              const reserved = Boolean(savedTable?.isReserved);
              const walkInOnly = savedTable?.bookingPolicy === 'walk_in_only';
              const unavailable = !table.bookable || !savedTable || reserved || walkInOnly || savedTable.capacity < requiredCapacity;
              const selected = table.tableId === selectedTableId;
              const unavailableForGroup = Boolean(savedTable && !reserved && savedTable.capacity < requiredCapacity);
              const fill = reserved
                ? clubTableColors[table.kind]
                : unavailable
                  ? '#555B66'
                  : clubTableColors[table.kind];
              const darkText = !unavailable && (table.kind === 'vvip-main' || table.kind === 'vip-mezzanine');

              return (
                <G
                  key={table.tableId}
                  onPress={unavailable ? undefined : () => onSelectTable(table.tableId)}
                  accessibilityLabel={`${clubTableDisplayName(table.tableId)}${walkInOnly ? ', Walk-ins only' : unavailable ? ', Unavailable' : ', Available online'}`}
                >
                  <Rect
                    x={table.x - 5}
                    y={table.y - 5}
                    width={table.width + 10}
                    height={table.height + 10}
                    rx={9}
                    fill="transparent"
                  />
                  <Rect
                    x={table.x}
                    y={table.y}
                    width={table.width}
                    height={table.height}
                    rx={7}
                    fill={fill}
                    fillOpacity={reserved ? 0.42 : unavailableForGroup ? 0.55 : 1}
                    stroke={selected ? colors.white : 'rgba(255,255,255,0.2)'}
                    strokeWidth={selected ? 4 : 1}
                  />
                  <SvgText
                    x={table.x + table.width / 2}
                    y={table.y + table.height / 2 + 4}
                    fill={darkText ? '#111827' : '#FFFFFF'}
                    fontSize={table.kind === 'cocktail' ? 11 : 9}
                    fontWeight="900"
                    textAnchor="middle"
                    opacity={reserved ? 0.42 : unavailableForGroup ? 0.55 : 1}
                  >
                    {table.label}
                  </SvgText>
                  {reserved ? (
                    <>
                      <Line
                        x1={table.x + 6}
                        y1={table.y + 5}
                        x2={table.x + table.width - 6}
                        y2={table.y + table.height - 5}
                        stroke="#FFFFFF"
                        strokeWidth={3}
                        strokeLinecap="round"
                      />
                      <Line
                        x1={table.x + table.width - 6}
                        y1={table.y + 5}
                        x2={table.x + 6}
                        y2={table.y + table.height - 5}
                        stroke="#FFFFFF"
                        strokeWidth={3}
                        strokeLinecap="round"
                      />
                    </>
                  ) : null}
                </G>
              );
            })}
          </Svg>
        </View>
      </ScrollView>
      <View
        style={[
          styles.floorSelectionBar,
          { backgroundColor: selectedLabel ? colors.primary + '12' : appColors.surfaceLow },
        ]}
      >
        <View style={styles.floorSelectionCopy}>
          <Text style={[styles.floorSelectionLabel, { color: appColors.onSurfaceVariant }]}>Selected table</Text>
          <Text style={[styles.floorSelectionValue, { color: appColors.onSurface }]}>
            {selectedLabel ?? 'Tap an available table on the plan'}
          </Text>
        </View>
        {selectedTableId ? <CheckCircle2 size={22} color={colors.primary} /> : null}
      </View>
    </View>
  );
}

function AdditionalInfoInput({
  value,
  onChangeText,
  appColors,
}: {
  value: string;
  onChangeText: (text: string) => void;
  appColors: AppColors;
}) {
  return (
    <View style={styles.sectionBlock}>
      <SectionTitle
        title="Additional Information"
        appColors={appColors}
        icon={<Info size={16} color={colors.primary} />}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline
        placeholder="e.g. Birthday, dietary needs, or preferred table..."
        placeholderTextColor={appColors.onSurfaceVariant + '88'}
        style={[
          styles.noteInput,
          {
            backgroundColor: appColors.surfaceLow,
            color: appColors.onSurface,
          },
        ]}
      />
    </View>
  );
}

function AdjustmentItem({
  icon,
  label,
  description,
  appColors,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  appColors: AppColors;
}) {
  return (
    <View style={styles.adjustmentItem}>
      <View style={styles.adjustmentItemIcon}>{icon}</View>
      <View style={styles.adjustmentItemCopy}>
        <Text style={[styles.adjustmentItemLabel, { color: appColors.onSurface }]}>{label}</Text>
        <Text style={[styles.adjustmentItemDescription, { color: appColors.onSurfaceVariant }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

function ReservationAdjustmentsCard({
  appColors,
  spotName,
  selectedDate,
  selectedSlot,
  selectedGroup,
  paymentRequired,
  reservationFee,
  acknowledged,
  onToggleAcknowledged,
}: {
  appColors: AppColors;
  spotName: string;
  selectedDate: string;
  selectedSlot: Slot | null;
  selectedGroup: GroupSize;
  paymentRequired: boolean;
  reservationFee: number;
  acknowledged: boolean;
  onToggleAcknowledged: () => void;
}) {
  const summaryRows = [
    { label: 'Spot', value: spotName },
    { label: 'Selected Date', value: format(toLocalDate(selectedDate), 'EEE, MMM d, yyyy') },
    { label: 'Selected Time', value: selectedSlot ? `${selectedSlot.name} (${selectedSlot.time})` : 'Choose a time' },
    { label: 'Group Size', value: selectedGroup.label },
    { label: 'Guest Count', value: `${selectedGroup.guests}` },
    { label: 'Reservation Type', value: getReservationTypeReviewLabel(paymentRequired) },
    ...(paymentRequired ? [{ label: 'Fee', value: `PHP ${reservationFee}` }] : []),
    { label: 'Payment Status', value: getPaymentStatusPreview(paymentRequired) },
  ];

  return (
    <View style={[styles.adjustmentCard, { backgroundColor: appColors.surfaceRaised }]}>
      <View style={styles.adjustmentHeader}>
        <View style={styles.adjustmentHeaderIcon}>
          <ShieldCheck size={18} color={colors.primary} />
        </View>
        <View style={styles.adjustmentHeaderCopy}>
          <Text style={[styles.adjustmentTitle, { color: appColors.onSurface }]}>Reservation Adjustments</Text>
          <Text style={[styles.adjustmentSubtitle, { color: appColors.onSurfaceVariant }]}>
            Plans can change. You can review your booking details before confirming.
          </Text>
        </View>
      </View>

      <View style={styles.adjustmentList}>
        <AdjustmentItem
          icon={<RefreshCw size={16} color={colors.primary} />}
          label={paymentRequired ? 'Adjustment Requests' : 'Reschedule Allowed'}
          description={paymentRequired
            ? "Contact the spot about adjustment requests. Any changes are subject to availability and the spot's policies."
            : "You may reschedule your free reservation from My Reservations, subject to availability and the spot's policies."}
          appColors={appColors}
        />
        <AdjustmentItem
          icon={<XCircle size={16} color={colors.primary} />}
          label={paymentRequired ? 'No Cancellation After Payment' : 'Cancellation Allowed'}
          description={paymentRequired
            ? "Once your reservation is booked and paid, cancellation is not allowed, in accordance with the spot's policies."
            : "You may cancel your free reservation before the scheduled visit, subject to the spot's cancellation policy."}
          appColors={appColors}
        />
        {paymentRequired ? (
          <AdjustmentItem
            icon={<ShieldCheck size={16} color={colors.primary} />}
            label="Paid Reservation Notice"
            description="Reservation deposits and processing fees are non-refundable. Please review your booking details before completing payment."
            appColors={appColors}
          />
        ) : (
          <AdjustmentItem
            icon={<CheckCircle2 size={16} color={colors.primary} />}
            label="Free Reservation Notice"
            description="No reservation fee or deposit is required. Cancellation and adjustments follow the spot's policies; changes are subject to availability."
            appColors={appColors}
          />
        )}
      </View>

      <View style={[styles.reviewBox, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.reviewHeader}>
          <Text style={[styles.reviewTitle, { color: appColors.onSurface }]}>Booking Summary</Text>
        </View>

        <View style={styles.reviewRows}>
          {summaryRows.map((row) => (
            <View key={row.label} style={styles.reviewRow}>
              <Text style={[styles.reviewLabel, { color: appColors.onSurfaceVariant }]}>{row.label}</Text>
              <Text style={[styles.reviewValue, { color: appColors.onSurface }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acknowledged }}
        style={styles.acknowledgementRow}
        onPress={onToggleAcknowledged}
      >
        <CheckCircle2
          size={22}
          color={acknowledged ? colors.success : appColors.outline}
          fill={acknowledged ? colors.successContainer : 'transparent'}
        />
        <Text style={[styles.acknowledgementText, { color: appColors.onSurfaceVariant }]}>
          {paymentRequired
            ? 'I understand the no-cancellation policy after payment, non-refundable fees, and adjustment conditions.'
            : 'I understand the cancellation and adjustment conditions for this free reservation.'}
        </Text>
      </Pressable>
    </View>
  );
}

function ReservationSummaryBar({
  paymentRequired,
  reservationFee,
  bookingStatus,
  selectedSummary,
}: {
  paymentRequired: boolean;
  reservationFee: number;
  bookingStatus: ReservationStatus;
  selectedSummary?: string;
}) {
  return (
    <View style={styles.summaryArea}>
      <View style={styles.summaryBar}>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>{paymentRequired ? 'RESERVATION FEE' : 'FREE RESERVATION'}</Text>
          <Text style={[styles.summaryValue, { color: paymentRequired ? colors.primary : colors.success }]}>
            {paymentRequired ? `PHP ${reservationFee}` : 'Free of Charge'}
          </Text>
        </View>
        <View style={[styles.summaryBlock, styles.statusBlock]}>
          <Text style={styles.summaryLabel}>STATUS</Text>
          <Text style={styles.statusPill}>{bookingStatus.replace('_', ' ').toUpperCase()}</Text>
        </View>
      </View>
      {!!selectedSummary && <Text style={styles.selectedSummary}>{selectedSummary}</Text>}
    </View>
  );
}

function TableHoldTimer({
  secondsRemaining,
  expired,
  hasTable,
  onRefreshHold,
}: {
  secondsRemaining: number;
  expired: boolean;
  hasTable: boolean;
  onRefreshHold: () => void;
}) {
  const { appColors } = useTheme();
  if (!hasTable) return null;

  return (
    <View
      style={[
        styles.holdTimerCard,
        {
          backgroundColor: expired ? appColors.dangerContainer : appColors.surfaceRaised,
          borderColor: expired ? appColors.danger + '66' : colors.primary + '24',
        },
      ]}
    >
      <View style={styles.holdTimerIcon}>
        <Clock3 size={19} color={expired ? colors.danger : colors.primary} />
      </View>
      <View style={styles.holdTimerCopy}>
        <Text style={[styles.holdTimerLabel, { color: appColors.onSurfaceVariant }]}>SELECTION TIMER</Text>
        <Text style={[styles.holdTimerValue, expired && styles.holdTimerExpiredText]}>
          {expired ? 'Expired' : formatHoldTime(secondsRemaining)}
        </Text>
        <Text style={[styles.holdTimerNote, { color: appColors.onSurfaceVariant }]}>
          {expired
            ? 'Refresh the timer before continuing. This does not reserve the table.'
            : 'This timer tracks your selection only; availability is checked again before booking.'}
        </Text>
      </View>
      {expired && (
        <Pressable accessibilityRole="button" style={styles.holdRefreshButton} onPress={onRefreshHold}>
          <RefreshCw size={14} color={colors.white} />
          <Text style={styles.holdRefreshText}>Refresh</Text>
        </Pressable>
      )}
    </View>
  );
}

function ConfirmBookingButton({
  loading,
  unavailable,
  onPress,
}: {
  loading: boolean;
  unavailable: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: loading || unavailable }}
      style={({ pressed }) => [
        styles.confirmButton,
        unavailable && styles.confirmButtonUnavailable,
        pressed && !loading && styles.confirmPressed,
      ]}
      onPress={onPress}
      disabled={loading || unavailable}
    >
      {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.confirmText}>Confirm Booking</Text>}
    </Pressable>
  );
}

export default function ReservationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('20:00');
  const availabilityRequest = useRef(0);
  const [selectedGroupId, setSelectedGroupId] = useState<GroupSizeId>('table-for-2');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [loadingTableAvailability, setLoadingTableAvailability] = useState(true);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const freeContact = getReservationContact(profile,guestPhone);
  useEffect(() => { setGuestPhone(''); },[profile?.id]);
  const [bookingStatus] = useState<ReservationStatus>('pending');
  const [availabilityNotice, setAvailabilityNotice] = useState('');
  const [availabilityError, setAvailabilityError] = useState(false);
  const [liveTablesBySlot, setLiveTablesBySlot] = useState<Partial<Record<SlotId, VenueTableAvailability[]>>>({});
  const [adjustmentAcknowledged, setAdjustmentAcknowledged] = useState(false);
  const [holdSecondsRemaining, setHoldSecondsRemaining] = useState(tableHoldDurationSeconds);
  const [holdExpired, setHoldExpired] = useState(false);
  const [sectionOffsets, setSectionOffsets] = useState<Partial<Record<BookingSectionKey, number>>>({});
  const [bookingFormOffset, setBookingFormOffset] = useState(0);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(new Date(), index)), []);
  const isClubBooking = spot?.id === testCebspotSpotId;
  const selectedSlotId = getReservationTimeSlot(startTime, isClubBooking);
  const liveTableInventory = useMemo(
    () => normalizeStoredTableInventory(spot?.table_inventory) as TableInventory,
    [isClubBooking, spot?.table_inventory],
  );
  const availabilityInventory = useMemo(() => {
    const withReservations = (key: SlotId) => liveTableInventory[key].map((table) => {
      const live = liveTablesBySlot[key]?.find(item => item.tableId === table.tableId);
      return {
        ...table,
        capacity: live?.capacity ?? table.capacity,
        bookingPolicy: live?.bookingPolicy ?? table.bookingPolicy,
        isReserved: table.isReserved || !live?.onlineAvailable,
      };
    });
    return { sunset: withReservations('sunset'), prime: withReservations('prime'), late: withReservations('late') };
  }, [liveTableInventory, liveTablesBySlot]);
  const selectedGroup = groupSizes.find((group) => group.id === selectedGroupId) ?? groupSizes[1];
  const selectedSlotAvailability = useMemo(
    () => getSlotAvailability(selectedSlotId, selectedGroupId, selectedDate, availabilityInventory, false),
    [selectedSlotId, selectedGroupId, selectedDate, availabilityInventory],
  );
  const selectedTable = selectedTableId || isClubBooking
    ? selectedSlotAvailability.availableTables.find((table) => table.tableId === selectedTableId) ?? null
    : selectedSlotAvailability.availableTables[0] ?? null;
  const selectedSlot: Slot = {
    id: selectedSlotId,
    name: 'Custom time',
    startTime,
    time: formatPickerTime(startTime),
  };
  const refreshAvailability = useCallback(async () => {
    const requestId = ++availabilityRequest.current;
    if (!spot) {
      setLoadingTableAvailability(false);
      return;
    }
    setLoadingTableAvailability(true);
    setAvailabilityError(false);
    try {
      const liveTables = await getReservationTableAvailability(spot, selectedDate, selectedSlotId);
      if (requestId !== availabilityRequest.current) return;
      setLiveTablesBySlot((current) => ({ ...current, [selectedSlotId]: liveTables }));
      setAvailabilityNotice('');
    } catch (error) {
      if (requestId !== availabilityRequest.current) return;
      console.warn('Unable to refresh table availability:', error);
      setAvailabilityError(true);
      setAvailabilityNotice('Live availability could not be verified. Retry before booking.');
    } finally {
      if (requestId === availabilityRequest.current) setLoadingTableAvailability(false);
    }
  }, [selectedDate, spot, selectedSlotId, startTime]);
  const updateStartTime = (time: string) => {
    availabilityRequest.current += 1;
    setLoadingTableAvailability(true);
    setStartTime(time);
    setAdjustmentAcknowledged(false);
  };
  const resetTableHold = useCallback(() => {
    setHoldSecondsRemaining(tableHoldDurationSeconds);
    setHoldExpired(false);
  }, []);
  const canConfirm =
    Boolean(
      spot?.is_reservable && selectedDate &&
        selectedSlot &&
        selectedGroup &&
        selectedSlotAvailability?.isAvailable &&
        selectedTable &&
        !loadingTableAvailability &&
        !availabilityError &&
        adjustmentAcknowledged &&
        (isPaymentRequired(spot) || Boolean(freeContact)) &&
        !holdExpired &&
        holdSecondsRemaining > 0
    ) &&
    !submitting;
  const selectedSummary =
    selectedSlot && selectedSlotAvailability
      ? `${selectedSlot.time} - ${selectedGroup.label} - ${
          selectedTable ? clubTableDisplayName(selectedTable.tableId) : selectedSlotAvailability.label
        }`
      : `${selectedGroup.label} - Choose an available time`;

  useEffect(() => {
    let active = true;
    const unsubscribe = id
      ? spotService.subscribeToSpotById(id, (nextSpot) => {
          if (active && nextSpot) setSpot(nextSpot);
        })
      : undefined;

    async function load() {
      if (!id) return;
      try {
        const nextSpot = await spotService.getSpotById(id);
        if (active) setSpot(nextSpot);
      } catch (error) {
        console.error('Unable to load reservation spot:', error);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [id]);

  useEffect(() => {
    setLoadingTableAvailability(true);
    const timer = setTimeout(() => void refreshAvailability(), 250);
    return () => {
      clearTimeout(timer);
      availabilityRequest.current += 1;
    };
  }, [refreshAvailability]);

  useEffect(() => {
    if (!spot?.id) return;
    const unsubscribe = venueTableService.subscribe(spot.id, () => void refreshAvailability());
    const timer = setInterval(() => void refreshAvailability(), 30000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [spot?.id, refreshAvailability]);


  useEffect(() => {
    if (!selectedTableId || !selectedSlotAvailability) return;
    const remainsAvailable = selectedSlotAvailability.availableTables.some((table) => table.tableId === selectedTableId);
    if (!remainsAvailable) {
      setSelectedTableId(null);
      setAdjustmentAcknowledged(false);
      setAvailabilityNotice('Your selected table is no longer available online. Review the updated tables before continuing.');
    }
  }, [selectedSlotAvailability, selectedTableId]);

  useEffect(() => {
    if (!selectedTable) return;
    resetTableHold();
  }, [resetTableHold, selectedDate, selectedGroupId, startTime, selectedSlotId, selectedTable?.tableId]);

  useEffect(() => {
    if (!selectedTable || submitting || holdExpired) return;

    const interval = setInterval(() => {
      setHoldSecondsRemaining((current) => {
        if (current <= 1) {
          setHoldExpired(true);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpired, selectedTable, submitting]);

  if (loading || !spot) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={colors.primary} size="large" />
          ) : (
            <Text style={[styles.title, { color: appColors.onSurface }]}>Spot not found</Text>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const reservationType = getSpotReservationType(spot);
  const reservationFee = calculateReservationFee(spot);
  const paymentRequired = isPaymentRequired(spot);

  function trackSection(section: BookingSectionKey) {
    return (event: LayoutChangeEvent) => {
      const { y } = event.nativeEvent.layout;
      setSectionOffsets((current) => ({
        ...current,
        [section]: y,
      }));
    };
  }

  function trackBookingForm(event: LayoutChangeEvent) {
    const { y } = event.nativeEvent.layout;
    setBookingFormOffset(y);
  }

  function scrollToSection(section: BookingSectionKey) {
    const y = Math.max(0, bookingFormOffset + (sectionOffsets[section] ?? 0) - spacing.md);
    scrollRef.current?.scrollTo({ y, animated: true });
  }

  async function confirmBooking() {
    if (submitting || loadingTableAvailability) return;
    if (availabilityError) {
      Alert.alert('Availability unavailable', 'Refresh table availability before booking.');
      return;
    }
    if (!spot || !selectedDate || !selectedSlot || !selectedGroup) {
      Alert.alert('Missing details', 'Please complete the booking details first.');
      return;
    }

    if (!spot.is_reservable) {
      Alert.alert('Unavailable', 'This spot is not accepting CebSpot reservations right now.');
      return;
    }

    if (!adjustmentAcknowledged) {
      Alert.alert(
        'Acknowledgement needed',
        'Please acknowledge the reservation adjustment conditions before confirming.'
      );
      return;
    }

    if (!selectedSlotAvailability?.isAvailable || !selectedTable) {
      Alert.alert(
        isClubBooking ? 'Choose a table' : 'Unavailable',
        isClubBooking
          ? 'Select an available table from the floor plan before confirming.'
          : 'That time slot is not available for your selected group size. Please choose another time.'
      );
      return;
    }

    if (holdExpired || holdSecondsRemaining <= 0) {
      Alert.alert('Selection timer expired', 'Your selection timer expired. Availability will be checked again before booking.', [
        { text: 'Continue', onPress: resetTableHold },
      ]);
      return;
    }

    let available: boolean;
    try {
      setSubmitting(true);
      available = await checkReservationAvailability({
        spotId: spot.id,
        reservationDate: selectedDate,
        slotId: selectedSlot.id,
        tableId: selectedTable.tableId,
      });
    } catch (error: any) {
      Alert.alert('Availability unavailable', error.message ?? 'Please try again.');
      return;
    } finally {
      setSubmitting(false);
    }
    if (!available) {
      setSelectedTableId(null);
      setAdjustmentAcknowledged(false);
      void refreshAvailability();
      Alert.alert(
        'Table unavailable',
        isClubBooking
          ? 'This table is no longer available online. It may be Walk-ins only, held, occupied, or cleaning. Choose another available table.'
          : 'This table is no longer available online. Review the refreshed tables and choose another table.',
      );
      return;
    }

    if (!paymentRequired) {
      if (!profile) {
        Alert.alert('Authentication required', 'Please sign in again to complete this reservation.');
        return;
      }
      if (!freeContact) {
        Alert.alert('Contact details required','Enter a valid Philippine mobile number and check your profile name and email before booking.');
        return;
      }

      try {
        setSubmitting(true);
        const reservationCode = `CEBSPOT-${Date.now()}`;
        const acknowledgedAt = new Date().toISOString();
        const reservation = await reservationService.createReservation({
          user_id: profile.id,
          spot_id: spot.id,
          spot_name: spot.name,
          ...freeContact,
          reservation_date: selectedDate,
          reservation_time: selectedSlot.startTime,
          reservation_time_start: selectedSlot.startTime,
          reservation_time_end: null,
          guest_count: selectedGroup.guests,
          guests: selectedGroup.guests,
          table_id: selectedTable.tableId,
          slot_id: selectedSlot.id,
          group_size_type: selectedGroup.id,
          note: additionalInfo.trim() || null,
          fee: 0,
          reservation_type: 'free',
          reservation_fee: 0,
          payment_required: false,
          status: 'confirmed',
          payment_status: 'not_required',
          payment_method: null,
          payment_reference: null,
          payment_proof_url: null,
          refund_status: 'not_applicable',
          adjustment_acknowledged: true,
          adjustment_acknowledged_at: acknowledgedAt,
          qr_code: reservationCode,
        });
        router.replace({ pathname: '/confirmed/[id]', params: { id: reservation.id } });
      } catch (error: any) {
        console.error('Reservation error:', error);
        setSelectedTableId(null);
        setAdjustmentAcknowledged(false);
        void refreshAvailability();
        Alert.alert('Reservation failed', error.message ?? 'Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    router.push({
      pathname: '/checkout/[id]',
      params: {
        id: spot.id,
        spotName: spot.name,
        date: selectedDate,
        time: selectedSlot.startTime,
        guests: String(selectedGroup.guests),
        tableId: selectedTable.tableId,
        slotId: selectedSlot.id,
        groupSizeType: selectedGroup.id,
        adjustmentAcknowledged: 'true',
        adjustmentAcknowledgedAt: new Date().toISOString(),
        note: additionalInfo,
        fee: String(reservationFee),
        reservationType,
        paymentRequired: String(paymentRequired),
        holdExpiresAt: String(Date.now() + holdSecondsRemaining * 1000),
      },
    });
  }

  return (
    <ScreenContainer appColors={appColors} scroll scrollRef={scrollRef}>
      <View style={styles.header}>
        <Pressable style={[styles.backButton, { backgroundColor: appColors.surfaceRaised }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: appColors.onSurface }]}>Booking</Text>
          <Text style={[styles.headerSub, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
            {spot.name}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {!spot.is_reservable && <Text accessibilityRole="alert" style={{ color: appColors.onSurfaceVariant, padding: 16 }}>
        Reservations are unavailable. This venue is discovery-only until its actual active table inventory is confirmed.
      </Text>}
      <View style={styles.bookingForm} onLayout={trackBookingForm}>
        <View onLayout={trackSection('date')}>
          <DateSelector
            dates={dates}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            appColors={appColors}
          />
        </View>
        <View onLayout={trackSection('time')}>
          <ExperienceSlotSelector
            time={startTime}
            onChangeTime={updateStartTime}
            notice={availabilityNotice}
            appColors={appColors}
          />
        </View>
        <View onLayout={trackSection('group')}>
          <GroupSizeSelector
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
            appColors={appColors}
          />
        </View>
        {isClubBooking ? (
          <ClubFloorPlanSelector
            inventory={availabilityInventory}
            selectedSlotId={selectedSlotId}
            selectedTableId={selectedTableId}
            selectedGroupId={selectedGroupId}
            loadingAvailability={loadingTableAvailability}
            onSelectTable={setSelectedTableId}
            onRefresh={() => void refreshAvailability()}
            appColors={appColors}
          />
        ) : null}
        <GuestTableChoices tables={liveTablesBySlot[selectedSlotId] || []} partySize={getRequiredCapacity(selectedGroupId)}
          selectedId={selectedTable?.tableId || null} loading={loadingTableAvailability || availabilityError}
          onSelect={setSelectedTableId} />
        {!paymentRequired && <View style={{gap:spacing.sm,marginVertical:spacing.lg}}>
          <Text style={{fontSize:fontSize.lg,fontWeight:'800',color:appColors.onSurface}}>Contact details</Text>
          <Text style={{color:appColors.onSurfaceVariant}}>Name: {[profile?.first_name,profile?.last_name].filter(Boolean).join(' ').trim() || profile?.display_name || 'Update your name in Account Details'}</Text>
          <Text style={{color:appColors.onSurfaceVariant}}>Email: {profile?.email || 'Update your email in Account Details'}</Text>
          <TextInput accessibilityLabel="Reservation phone number" value={guestPhone} onChangeText={setGuestPhone}
            keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={24}
            placeholder="09XXXXXXXXX" placeholderTextColor={appColors.onSurfaceVariant}
            style={{minHeight:52,borderWidth:1,borderColor:guestPhone&&!freeContact?colors.danger:appColors.outlineVariant,borderRadius:radius.md,padding:spacing.md,color:appColors.onSurface,backgroundColor:appColors.surfaceRaised}} />
          <Text style={{color:appColors.onSurfaceVariant}}>The venue uses these details to contact you about your booking.</Text>
        </View>}
        <AdditionalInfoInput value={additionalInfo} onChangeText={setAdditionalInfo} appColors={appColors} />
        <ReservationAdjustmentsCard
          appColors={appColors}
          spotName={spot.name}
          selectedDate={selectedDate}
          selectedSlot={selectedSlot}
          selectedGroup={selectedGroup}
          paymentRequired={paymentRequired}
          reservationFee={reservationFee}
          acknowledged={adjustmentAcknowledged}
          onToggleAcknowledged={() => setAdjustmentAcknowledged((current) => !current)}
        />
      </View>

      <TableHoldTimer
        secondsRemaining={holdSecondsRemaining}
        expired={holdExpired}
        hasTable={Boolean(selectedTable)}
        onRefreshHold={resetTableHold}
      />
      <ReservationSummaryBar
        paymentRequired={paymentRequired}
        reservationFee={reservationFee}
        bookingStatus={bookingStatus}
        selectedSummary={selectedSummary}
      />
      <ConfirmBookingButton loading={submitting} unavailable={!canConfirm} onPress={confirmBooking} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  headerSub: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: 2,
  },
  headerSpacer: {
    width: 42,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  bookingForm: {
    gap: spacing.xl,
  },
  sectionBlock: {
    gap: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  monthLabel: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  calendarToggle: {
    minHeight: 32,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  dateTray: {
    minHeight: 78,
    borderRadius: radius.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  dateChip: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
  },
  dateChipSelected: {
    backgroundColor: colors.primaryContainer,
    ...shadow.card,
  },
  dateDow: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dateDay: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  calendarPanel: {
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
    marginTop: -spacing.md,
  },
  calendarHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  calendarNavButton: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  calendarHeaderCopy: {
    flex: 1,
    alignItems: 'center',
  },
  calendarMonth: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  calendarSelected: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: 2,
  },
  weekHeader: {
    flexDirection: 'row',
  },
  weekDay: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  calendarDaySelected: {
    backgroundColor: colors.primaryContainer,
    ...shadow.card,
  },
  calendarDayText: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  filledSectionIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  timePickerPanel: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, gap: spacing.sm, alignItems: 'center' },
  timePickerLabel: { alignSelf: 'flex-start', fontSize: fontSize.sm, fontWeight: '800' },
  timePickerHelp: { fontSize: fontSize.xs, lineHeight: 18 },
  slotList: {
    gap: spacing.sm,
  },
  slotCard: {
    minHeight: 82,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadow.card,
  },
  slotCardDisabled: {
    opacity: 0.52,
  },
  slotCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  slotName: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  slotTime: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: 2,
  },
  availability: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 5,
  },
  availabilityUnavailable: {
    color: colors.danger,
  },
  availabilityNotice: {
    color: colors.danger,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: -spacing.xs,
  },
  slotIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotIconSelected: {
    backgroundColor: colors.primary + '10',
  },
  groupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  groupCard: {
    width: '48.5%',
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  groupLabel: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    textAlign: 'center',
  },
  groupSub: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
    textAlign: 'center',
  },
  floorRefreshButton: {
    minHeight: 34,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary + '10',
  },
  floorRefreshText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  floorPlanHelp: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: -spacing.sm,
  },
  floorPlanLegend: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  floorLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  floorLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  floorReservedLegendDot: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floorReservedLegendX: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 14,
    fontWeight: '900',
  },
  floorLegendText: {
    fontSize: 9,
    fontWeight: '800',
  },
  floorPlanScrollContent: {
    paddingRight: spacing.md,
  },
  floorPlanCanvas: {
    width: 720,
    height: 700,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  floorSelectionBar: {
    minHeight: 64,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  floorSelectionCopy: {
    flex: 1,
  },
  floorSelectionLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  floorSelectionValue: {
    fontSize: fontSize.md,
    fontWeight: '900',
    marginTop: 3,
  },
  noteInput: {
    minHeight: 140,
    borderRadius: radius.xl,
    padding: spacing.lg,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlignVertical: 'top',
  },
  adjustmentCard: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  adjustmentHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  adjustmentHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  adjustmentHeaderCopy: {
    flex: 1,
  },
  adjustmentTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  adjustmentSubtitle: {
    marginTop: 3,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
  },
  adjustmentList: {
    gap: spacing.md,
  },
  adjustmentItem: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  adjustmentItemIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '10',
  },
  adjustmentItemCopy: {
    flex: 1,
  },
  adjustmentItemLabel: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  adjustmentItemDescription: {
    marginTop: 2,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
  },
  reviewBox: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  reviewHeader: {
    gap: spacing.sm,
  },
  reviewTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  reviewRows: {
    gap: spacing.md,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  reviewLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 18,
    fontWeight: '900',
  },
  reviewValue: {
    flex: 1,
    fontSize: fontSize.md,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'right',
  },
  acknowledgementRow: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary + '08',
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  acknowledgementText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
  },
  holdTimerCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xxl,
    ...shadow.card,
  },
  holdTimerExpired: {
  },
  holdTimerIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  holdTimerCopy: {
    flex: 1,
  },
  holdTimerLabel: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  holdTimerValue: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginTop: 2,
  },
  holdTimerExpiredText: {
    color: colors.danger,
  },
  holdTimerNote: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 2,
  },
  holdRefreshButton: {
    minHeight: 38,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.danger,
  },
  holdRefreshText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryArea: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  summaryBlock: {
    flex: 1,
  },
  statusBlock: {
    alignItems: 'flex-end',
  },
  summaryLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  summaryValue: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    marginTop: 3,
  },
  statusPill: {
    marginTop: 4,
    backgroundColor: colors.success,
    color: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
  },
  selectedSummary: {
    color: colors.onSurfaceVariant,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  confirmButton: {
    minHeight: 60,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginBottom: spacing.xl,
    ...shadow.lifted,
  },
  confirmButtonUnavailable: {
    opacity: 0.58,
  },
  confirmPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: '#C94400',
  },
  confirmText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});
