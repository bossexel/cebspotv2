import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDays, format } from 'date-fns';
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
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  XCircle,
  UsersRound,
} from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors } from '../../src/constants/colors';
import type { AppColors } from '../../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../../src/constants/design';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { reservationService } from '../../src/services/reservationService';
import { spotService } from '../../src/services/spotService';
import type { ReservationStatus, Spot } from '../../src/types';
import {
  calculateReservationFee,
  checkReservationAvailability,
  getSpotReservationType,
  isPaymentRequired,
} from '../../src/utils/reservations';

const slots = [
  {
    id: 'sunset',
    name: 'Sunset',
    time: '17:00 - 19:30',
    startTime: '17:00',
    endTime: '19:30',
    icon: 'sun',
  },
  {
    id: 'prime',
    name: 'Prime',
    time: '20:00 - 22:30',
    startTime: '20:00',
    endTime: '22:30',
    icon: 'moon',
  },
  {
    id: 'late',
    name: 'Late',
    time: '23:00 - 02:00',
    startTime: '23:00',
    endTime: '02:00',
    icon: 'sparkles',
  },
] as const;

const groupSizes = [
  { id: 'solo', label: 'Solo', subtitle: '(1 person)', guests: 1 },
  { id: 'table-for-2', label: 'Table for 2', subtitle: '(2 persons)', guests: 2 },
  { id: 'small-group', label: 'Small Group', subtitle: '(3-5 party)', guests: 4 },
  { id: 'big-group', label: 'Big Group', subtitle: '(6+ party)', guests: 6 },
] as const;

type Slot = (typeof slots)[number];
type GroupSize = (typeof groupSizes)[number];
type SlotId = Slot['id'];
type GroupSizeId = GroupSize['id'];
type BookingSectionKey = 'date' | 'time' | 'group';

type TableOption = {
  tableId: string;
  capacity: number;
  isReserved: boolean;
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

const tableInventory: TableInventory = {
  sunset: [
    { tableId: 's1', capacity: 2, isReserved: false },
    { tableId: 's2', capacity: 2, isReserved: false },
    { tableId: 's3', capacity: 4, isReserved: false },
    { tableId: 's4', capacity: 6, isReserved: false },
  ],
  prime: [
    { tableId: 'p1', capacity: 2, isReserved: true },
    { tableId: 'p2', capacity: 2, isReserved: false },
    { tableId: 'p3', capacity: 4, isReserved: true },
  ],
  late: [
    { tableId: 'l1', capacity: 2, isReserved: false },
    { tableId: 'l2', capacity: 6, isReserved: false },
  ],
};

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

function getTableInventoryForDate(date: string): TableInventory {
  const inventory = cloneInventory(tableInventory);
  const dayNumber = Number(format(toLocalDate(date), 'd'));

  if (dayNumber % 5 === 0) {
    reserveTables(inventory, 'sunset', ['s1', 's2', 's3', 's4']);
  } else if (dayNumber % 2 === 1) {
    reserveTables(inventory, 'sunset', ['s1', 's2', 's3']);
  }

  if (dayNumber % 4 === 0) {
    reserveTables(inventory, 'prime', ['p2']);
  } else if (dayNumber % 3 === 0) {
    inventory.prime = inventory.prime.map((table) =>
      table.tableId === 'p3' ? { ...table, isReserved: false } : table
    );
  }

  if (dayNumber % 6 === 0) {
    reserveTables(inventory, 'late', ['l2']);
  }

  return inventory;
}

function getAvailableTablesForSlot(slotId: SlotId, groupSizeId: GroupSizeId, date: string) {
  const requiredCapacity = getRequiredCapacity(groupSizeId);
  const inventory = getTableInventoryForDate(date);

  return inventory[slotId].filter((table) => !table.isReserved && table.capacity >= requiredCapacity);
}

function isSlotAvailable(slotId: SlotId, groupSizeId: GroupSizeId, date: string) {
  return getAvailableTablesForSlot(slotId, groupSizeId, date).length > 0;
}

function getAvailabilityLabel(slotId: SlotId, groupSizeId: GroupSizeId, date: string) {
  const inventory = getTableInventoryForDate(date);
  const availableTables = getAvailableTablesForSlot(slotId, groupSizeId, date);
  const openTables = inventory[slotId].filter((table) => !table.isReserved);
  const count = availableTables.length;

  if (count === 0 && openTables.length === 0) return 'Fully booked';
  if (count === 0) return `Not available for ${getGroupSizeLabel(groupSizeId)}`;
  if (count === 1) return 'Last table';
  if (count <= 2) return 'Limited spots';
  return `${count} tables available`;
}

function getSlotAvailability(slotId: SlotId, groupSizeId: GroupSizeId, date: string): SlotAvailability {
  const availableTables = getAvailableTablesForSlot(slotId, groupSizeId, date);
  return {
    availableTables,
    isAvailable: isSlotAvailable(slotId, groupSizeId, date),
    label: getAvailabilityLabel(slotId, groupSizeId, date),
  };
}

function SlotIcon({ icon, color }: { icon: Slot['icon']; color: string }) {
  if (icon === 'moon') return <Moon size={22} color={color} fill={color} />;
  if (icon === 'sparkles') return <Sparkles size={22} color={color} />;
  return <Sun size={22} color={color} fill={color} />;
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
              style={[styles.calendarNavButton, { backgroundColor: appColors.white }]}
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
              style={[styles.calendarNavButton, { backgroundColor: appColors.white }]}
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

function ExperienceSlotCard({
  slot,
  selected,
  availability,
  onPress,
  appColors,
}: {
  slot: Slot;
  selected: boolean;
  availability: SlotAvailability;
  onPress: () => void;
  appColors: AppColors;
}) {
  const disabled = !availability.isAvailable;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.slotCard,
        {
          backgroundColor: selected ? colors.primary + '08' : appColors.surfaceLow,
          borderColor: selected ? colors.primary : appColors.surfaceLow,
        },
        disabled && styles.slotCardDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.slotCopy}>
        <Text style={[styles.slotName, { color: disabled ? appColors.onSurfaceVariant : appColors.onSurface }]}>
          {slot.name}
        </Text>
        <Text style={[styles.slotTime, { color: appColors.onSurfaceVariant }]}>{slot.time}</Text>
        <Text style={[styles.availability, disabled && styles.availabilityUnavailable]}>
          {disabled ? availability.label : `+ ${availability.label}`}
        </Text>
      </View>
      <View style={[styles.slotIcon, selected && styles.slotIconSelected]}>
        <SlotIcon icon={slot.icon} color={selected ? colors.primary : appColors.onSurfaceVariant} />
      </View>
    </Pressable>
  );
}

function ExperienceSlotSelector({
  selectedSlotId,
  slotAvailability,
  notice,
  onSelectSlot,
  appColors,
}: {
  selectedSlotId: SlotId | null;
  slotAvailability: Record<SlotId, SlotAvailability>;
  notice: string;
  onSelectSlot: (slotId: SlotId) => void;
  appColors: AppColors;
}) {
  return (
    <View style={styles.sectionBlock}>
      <SectionTitle
        title="Experience Slot"
        appColors={appColors}
        icon={
          <View style={styles.filledSectionIcon}>
            <Clock3 size={10} color={colors.white} />
          </View>
        }
      />
      <View style={styles.slotList}>
        {slots.map((slot) => (
          <ExperienceSlotCard
            key={slot.id}
            slot={slot}
            selected={slot.id === selectedSlotId}
            availability={slotAvailability[slot.id]}
            onPress={() => onSelectSlot(slot.id)}
            appColors={appColors}
          />
        ))}
      </View>
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
    <View style={[styles.adjustmentCard, { backgroundColor: appColors.white }]}>
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
          label="Reschedule Allowed"
          description="You can reschedule this reservation from your My Reservations page if the new date and time are still available."
          appColors={appColors}
        />
        <AdjustmentItem
          icon={<XCircle size={16} color={colors.primary} />}
          label="Cancellation Allowed"
          description="You can cancel this reservation before the scheduled time. Cancellation rules may depend on the spot's policy."
          appColors={appColors}
        />
        {paymentRequired ? (
          <AdjustmentItem
            icon={<ShieldCheck size={16} color={colors.primary} />}
            label="Paid Reservation Notice"
            description="If you already paid the reservation fee and cancel later, your payment may require refund review by the spot owner."
            appColors={appColors}
          />
        ) : (
          <AdjustmentItem
            icon={<CheckCircle2 size={16} color={colors.primary} />}
            label="Free Reservation Notice"
            description="No payment is required for this booking. You may cancel or reschedule based on availability."
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
          I understand the reschedule, cancellation, and payment review conditions.
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
      disabled={loading}
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
  const [selectedSlotId, setSelectedSlotId] = useState<SlotId | null>('sunset');
  const [selectedGroupId, setSelectedGroupId] = useState<GroupSizeId>('table-for-2');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [bookingStatus] = useState<ReservationStatus>('pending');
  const [availabilityNotice, setAvailabilityNotice] = useState('');
  const [adjustmentAcknowledged, setAdjustmentAcknowledged] = useState(false);
  const [sectionOffsets, setSectionOffsets] = useState<Partial<Record<BookingSectionKey, number>>>({});
  const [bookingFormOffset, setBookingFormOffset] = useState(0);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(new Date(), index)), []);
  const slotAvailability = useMemo(
    () =>
      slots.reduce(
        (availability, slot) => ({
          ...availability,
          [slot.id]: getSlotAvailability(slot.id, selectedGroupId, selectedDate),
        }),
        {} as Record<SlotId, SlotAvailability>
      ),
    [selectedDate, selectedGroupId]
  );
  const selectedSlot = selectedSlotId ? slots.find((slot) => slot.id === selectedSlotId) ?? null : null;
  const selectedGroup = groupSizes.find((group) => group.id === selectedGroupId) ?? groupSizes[1];
  const selectedSlotAvailability = selectedSlotId ? slotAvailability[selectedSlotId] : null;
  const selectedTable = selectedSlotAvailability?.availableTables[0] ?? null;
  const canConfirm =
    Boolean(
      selectedDate &&
        selectedSlot &&
        selectedGroup &&
        selectedSlotAvailability?.isAvailable &&
        selectedTable &&
        adjustmentAcknowledged
    ) &&
    !submitting;
  const selectedSummary =
    selectedSlot && selectedSlotAvailability
      ? `${selectedSlot.name} - ${selectedGroup.label} - ${selectedSlotAvailability.label}`
      : `${selectedGroup.label} - Choose an available time`;

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        setSpot(await spotService.getSpotById(id));
      } catch (error) {
        console.error('Unable to load reservation spot:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  useEffect(() => {
    const selectedIsAvailable = selectedSlotId ? slotAvailability[selectedSlotId].isAvailable : false;
    if (selectedSlotId && selectedIsAvailable) {
      setAvailabilityNotice('');
      return;
    }

    const firstAvailableSlot = slots.find((slot) => slotAvailability[slot.id].isAvailable)?.id ?? null;
    if (firstAvailableSlot !== selectedSlotId) {
      if (selectedSlotId) {
        setAvailabilityNotice('Selected time is not available for this group size.');
      }
      setSelectedSlotId(firstAvailableSlot);
    }
  }, [selectedDate, selectedGroupId, selectedSlotId, slotAvailability]);

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
        'Unavailable',
        'That time slot is not available for your selected group size. Please choose another time.'
      );
      return;
    }

    const available = await checkReservationAvailability();
    if (!available) {
      Alert.alert('Unavailable', 'This slot is no longer available. Please choose another schedule.');
      return;
    }

    if (!paymentRequired) {
      if (!profile) {
        Alert.alert('Authentication required', 'Please sign in again to complete this reservation.');
        return;
      }

      try {
        setSubmitting(true);
        const qrCode = `CEBSPOT-${spot.id}-${Date.now()}`;
        const acknowledgedAt = new Date().toISOString();
        const reservation = await reservationService.createReservation({
          user_id: profile.id,
          spot_id: spot.id,
          spot_name: spot.name,
          reservation_date: selectedDate,
          reservation_time: selectedSlot.startTime,
          reservation_time_start: selectedSlot.startTime,
          reservation_time_end: selectedSlot.endTime,
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
          qr_code: qrCode,
        });
        router.replace({ pathname: '/confirmed/[id]', params: { id: reservation.id } });
      } catch (error: any) {
        console.error('Reservation error:', error);
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
        timeEnd: selectedSlot.endTime,
        adjustmentAcknowledged: 'true',
        adjustmentAcknowledgedAt: new Date().toISOString(),
        note: additionalInfo,
        fee: String(reservationFee),
        reservationType,
        paymentRequired: String(paymentRequired),
      },
    });
  }

  return (
    <ScreenContainer appColors={appColors} scroll scrollRef={scrollRef}>
      <View style={styles.header}>
        <Pressable style={[styles.backButton, { backgroundColor: appColors.white }]} onPress={() => router.back()}>
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
            selectedSlotId={selectedSlotId}
            slotAvailability={slotAvailability}
            notice={availabilityNotice}
            onSelectSlot={setSelectedSlotId}
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
    fontStyle: 'italic',
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
  summaryArea: {
    marginTop: spacing.xxl,
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

