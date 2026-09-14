import { Platform } from 'react-native';
import type { Reservation } from '../types';
import { activityService } from './activityService';

type NotifyKitModule = typeof import('react-native-notify-kit');

const channelId = 'reservation-reminders';
const notificationIdPrefix = 'reservation-reminder:';
const reminderLeadTimeMs = 60 * 60 * 1000;
const dueWindowMs = 2 * 60 * 60 * 1000;
let notifyKitModule: NotifyKitModule | null | undefined;

function isNotifyKitUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /NotifeeApiModule|TurboModuleRegistry|getEnforcing|native binary|native module/i.test(message);
}

function disableNotifyKit(error: unknown) {
  notifyKitModule = null;
  if (!isNotifyKitUnavailable(error)) {
    console.warn('Reservation reminders are unavailable in this build:', error);
  }
}

async function loadNotifyKit() {
  if (Platform.OS !== 'android') return null;
  if (notifyKitModule !== undefined) return notifyKitModule;

  try {
    notifyKitModule = require('react-native-notify-kit') as NotifyKitModule;
  } catch (error) {
    disableNotifyKit(error);
  }

  return notifyKitModule;
}

async function prepareNotifyKit() {
  const module = await loadNotifyKit();
  if (!module) return null;

  try {
    let settings = await module.default.getNotificationSettings();
    if (settings.authorizationStatus <= module.AuthorizationStatus.NOT_DETERMINED) {
      settings = await module.default.requestPermission();
    }
    if (settings.authorizationStatus <= module.AuthorizationStatus.DENIED) return null;

    await module.default.createChannel({
      id: channelId,
      name: 'Reservation reminders',
      description: 'Reminders before your CebSpot reservations',
      importance: module.AndroidImportance.HIGH,
    });
  } catch (error) {
    disableNotifyKit(error);
    return null;
  }

  return module;
}

function getReservationDate(reservation: Pick<Reservation, 'reservation_date' | 'reservation_time' | 'reservation_time_start'>) {
  const rawTime = reservation.reservation_time_start || reservation.reservation_time;
  const match = String(rawTime ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const date = new Date(
    `${reservation.reservation_date}T${String(Number(match[1])).padStart(2, '0')}:${match[2]}:00`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function getReminderDate(reservation: Pick<Reservation, 'reservation_date' | 'reservation_time' | 'reservation_time_start'>) {
  const reservationDate = getReservationDate(reservation);
  if (!reservationDate) return null;
  return new Date(reservationDate.getTime() - reminderLeadTimeMs);
}

function isEligibleReservation(reservation: Reservation) {
  if (['cancelled', 'checked_in', 'completed', 'no_show'].includes(reservation.status)) return false;
  if (reservation.payment_required && reservation.payment_status !== 'paid') return false;
  return reservation.status === 'confirmed' || reservation.payment_status === 'paid';
}

function getNotificationId(reservationId: string) {
  return `${notificationIdPrefix}${reservationId}`;
}

function getNotificationBody(reservation: Reservation) {
  const time = reservation.reservation_time_start || reservation.reservation_time;
  return `Your reservation at ${reservation.spot_name} is in 1 hour at ${time}.`;
}

async function scheduleReservationReminder(reservation: Reservation) {
  if (!isEligibleReservation(reservation)) return;

  const reminderDate = getReminderDate(reservation);
  const reservationDate = getReservationDate(reservation);
  if (!reminderDate || !reservationDate || reservationDate.getTime() <= Date.now()) return;

  const module = await prepareNotifyKit();
  if (!module) return;

  const timestamp = Math.max(reminderDate.getTime(), Date.now() + 1000);
  await module.default.createTriggerNotification(
    {
      id: getNotificationId(reservation.id),
      title: 'Reservation reminder',
      body: getNotificationBody(reservation),
      data: {
        routeType: 'reservation',
        reservationId: reservation.id,
        activityType: 'reservation_reminder',
      },
      android: {
        channelId,
        color: '#F26B21',
        pressAction: {
          id: 'default',
          launchActivity: 'default',
        },
      },
    },
    {
      type: module.TriggerType.TIMESTAMP,
      timestamp,
      alarmManager: { type: module.AlarmType.SET_AND_ALLOW_WHILE_IDLE },
    },
  );
}

export const reservationReminderService = {
  async schedule(reservation: Reservation) {
    try {
      await scheduleReservationReminder(reservation);
    } catch (error) {
      console.warn('Unable to schedule reservation reminder:', error);
    }
  },

  async sync(reservations: Reservation[]) {
    if (Platform.OS !== 'android') return;

    const module = await prepareNotifyKit();
    if (!module) return;

    const eligibleReservations = reservations.filter(isEligibleReservation);
    await Promise.all(eligibleReservations.map((reservation) => scheduleReservationReminder(reservation)));

    const activeIds = new Set(eligibleReservations.map((reservation) => getNotificationId(reservation.id)));
    const scheduledIds = await module.default.getTriggerNotificationIds();
    const staleIds = scheduledIds.filter(
      (id) => id.startsWith(notificationIdPrefix) && !activeIds.has(id),
    );
    if (staleIds.length) await module.default.cancelTriggerNotifications(staleIds);
  },

  async processDueActivities(userId: string, reservations: Reservation[]) {
    const now = Date.now();
    const recentActivities = await activityService.getRecentActivities(100, userId);

    for (const reservation of reservations) {
      if (!isEligibleReservation(reservation)) continue;
      const reservationDate = getReservationDate(reservation);
      const reminderDate = getReminderDate(reservation);
      if (!reservationDate || !reminderDate) continue;
      if (reminderDate.getTime() > now || reminderDate.getTime() < now - dueWindowMs) continue;
      if (reservationDate.getTime() <= now) continue;

      const alreadyRecorded = recentActivities.some(
        (activity) => activity.type === 'reservation_reminder' && activity.target_id === reservation.id,
      );
      if (!alreadyRecorded) {
        const created = await activityService.logReservationReminder(reservation);
        if (created) recentActivities.unshift(created);
      }
    }
  },
};
