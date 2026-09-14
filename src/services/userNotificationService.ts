import { Platform } from 'react-native';
import { colors } from '../constants/colors';
import type { Activity } from '../types';

type NotifyKitModule = typeof import('react-native-notify-kit');
export type UserNotificationRoute =
  | { routeType: 'activity_post'; submissionId: string }
  | { routeType: 'map_spot'; spotId: string }
  | { routeType: 'spot'; spotId: string }
  | { routeType: 'reservation'; reservationId: string };

const channelId = 'spot-interactions';
let notifyKitModule: NotifyKitModule | null | undefined;
let activePressHandler: ((route: UserNotificationRoute) => void) | null = null;
let pendingPressRoute: UserNotificationRoute | null = null;

function isNotifyKitUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /NotifeeApiModule|TurboModuleRegistry|getEnforcing|native binary|native module/i.test(message);
}

function disableNotifyKit(error: unknown, message: string) {
  notifyKitModule = null;
  if (!isNotifyKitUnavailable(error)) {
    console.warn(message, error);
  }
}

async function loadNotifyKit() {
  if (Platform.OS !== 'android') return null;

  if (notifyKitModule !== undefined) return notifyKitModule;

  try {
    notifyKitModule = require('react-native-notify-kit') as NotifyKitModule;
  } catch (error) {
    disableNotifyKit(error, 'User interaction notifications are unavailable in this build:');
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
    if (settings.authorizationStatus <= module.AuthorizationStatus.DENIED) {
      return null;
    }

    await module.default.createChannel({
      id: channelId,
      name: 'Spot activity',
      description: 'Reservation updates and activity on your submitted spots',
      importance: module.AndroidImportance.DEFAULT,
    });
  } catch (error) {
    disableNotifyKit(error, 'Unable to prepare spot interaction notifications:');
    return null;
  }

  return module;
}

function getNotificationTitle(activity: Activity) {
  if (activity.type === 'reservation_reminder') return 'Reservation reminder';
  if (activity.type === 'reservation_approved') return 'Reservation confirmed';
  if (activity.type === 'reservation_checked_in') return 'You are checked in';
  if (activity.type === 'reservation_no_show') return 'Reservation marked no show';
  if (activity.type === 'spot_comment') return 'New comment';
  if (activity.type === 'spot_liked') return 'New like';
  if (activity.type === 'submission_approved') return 'Spot is live';
  return activity.target_name ?? activity.spot_name ?? 'CebSpot';
}

function getNotificationBody(activity: Activity) {
  if (activity.content) return activity.content;
  if (activity.type === 'spot_comment') return `${activity.user_name} commented on your spot.`;
  if (activity.type === 'spot_liked') return `${activity.user_name} liked your spot.`;
  if (activity.type === 'submission_approved') return `${activity.target_name ?? activity.spot_name ?? 'Your spot'} is now live on the CebSpot map.`;
  return `${activity.user_name} ${activity.action ?? 'updated'} ${activity.target_name ?? 'your spot'}.`;
}

function getRouteForActivity(activity: Activity): UserNotificationRoute | null {
  if (
    ['reservation_reminder', 'reservation_approved', 'reservation_checked_in', 'reservation_no_show'].includes(activity.type) &&
    activity.target_id
  ) {
    return { routeType: 'reservation', reservationId: activity.target_id };
  }
  if ((activity.type === 'spot_comment' || activity.type === 'spot_liked') && activity.target_id) {
    return { routeType: 'activity_post', submissionId: activity.target_id };
  }
  if (activity.type === 'submission_approved' && activity.spot_id) {
    return { routeType: 'map_spot', spotId: activity.spot_id };
  }
  if (activity.spot_id) {
    return { routeType: 'spot', spotId: activity.spot_id };
  }
  return null;
}

function getNotificationData(activity: Activity): Record<string, string> | undefined {
  const route = getRouteForActivity(activity);
  if (!route) return undefined;
  if (route.routeType === 'activity_post') {
    return {
      routeType: route.routeType,
      submissionId: route.submissionId,
      activityType: activity.type,
    };
  }
  if (route.routeType === 'reservation') {
    return {
      routeType: route.routeType,
      reservationId: route.reservationId,
      activityType: activity.type,
    };
  }
  return {
    routeType: route.routeType,
    spotId: route.spotId,
    activityType: activity.type,
  };
}

function getRouteFromData(data?: Record<string, unknown>): UserNotificationRoute | null {
  if (!data) return null;
  const routeType = typeof data.routeType === 'string' ? data.routeType : null;
  const submissionId = typeof data.submissionId === 'string' ? data.submissionId : null;
  const spotId = typeof data.spotId === 'string' ? data.spotId : null;
  const reservationId = typeof data.reservationId === 'string' ? data.reservationId : null;

  if (routeType === 'activity_post' && submissionId) return { routeType, submissionId };
  if (routeType === 'map_spot' && spotId) return { routeType, spotId };
  if (routeType === 'spot' && spotId) return { routeType, spotId };
  if (routeType === 'reservation' && reservationId) return { routeType, reservationId };
  return null;
}

function dispatchPressRoute(route: UserNotificationRoute) {
  if (activePressHandler) {
    activePressHandler(route);
    return;
  }
  pendingPressRoute = route;
}

function handleNotificationPressData(data?: Record<string, unknown>) {
  const route = getRouteFromData(data);
  if (route) dispatchPressRoute(route);
}

export const userNotificationService = {
  getRouteForActivity,

  async displayActivityNotification(activity: Activity) {
    if (![
      'spot_comment',
      'spot_liked',
      'submission_approved',
      'reservation_approved',
      'reservation_checked_in',
      'reservation_no_show',
    ].includes(activity.type)) return;

    try {
      const module = await prepareNotifyKit();
      if (!module) return;

      await module.default.displayNotification({
        id: activity.id,
        title: getNotificationTitle(activity),
        body: getNotificationBody(activity),
        data: getNotificationData(activity),
        android: {
          channelId,
          color: colors.primary,
          onlyAlertOnce: false,
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
        },
      });
    } catch (error) {
      if (!isNotifyKitUnavailable(error)) {
        console.warn('Unable to display spot interaction notification:', error);
      }
    }
  },

  async registerNotificationPressHandler(handler: (route: UserNotificationRoute) => void) {
    activePressHandler = handler;

    if (pendingPressRoute) {
      const route = pendingPressRoute;
      pendingPressRoute = null;
      handler(route);
    }

    try {
      const module = await loadNotifyKit();
      if (!module) {
        return () => {
          if (activePressHandler === handler) activePressHandler = null;
        };
      }

      module.default.getInitialNotification()
        .then((initialNotification) => {
          handleNotificationPressData(initialNotification?.notification.data);
        })
        .catch((error) => {
          if (!isNotifyKitUnavailable(error)) {
            console.warn('Unable to read initial notification:', error);
          }
        });

      module.default.onBackgroundEvent(async ({ type, detail }) => {
        if (type === module.EventType.PRESS) {
          handleNotificationPressData(detail.notification?.data);
        }
      });

      const unsubscribe = module.default.onForegroundEvent(({ type, detail }) => {
        if (type === module.EventType.PRESS) {
          handleNotificationPressData(detail.notification?.data);
        }
      });

      return () => {
        unsubscribe();
        if (activePressHandler === handler) activePressHandler = null;
      };
    } catch (error) {
      disableNotifyKit(error, 'Unable to register notification press routing:');
      return () => {
        if (activePressHandler === handler) activePressHandler = null;
      };
    }
  },
};
