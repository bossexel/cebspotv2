import { Platform } from 'react-native';
import { colors } from '../constants/colors';
import type { SpotSubmissionProgress } from './spotSubmissionService';

type NotifyKitModule = typeof import('react-native-notify-kit');

const channelId = 'spot-submissions';
let notifyKitModule: NotifyKitModule | null | undefined;
let foregroundRunnerRegistered = false;

export type SpotSubmissionNotificationStatus = {
  supported: boolean;
  authorized: boolean;
  detail?: string;
};

async function loadNotifyKit() {
  if (Platform.OS !== 'android') return null;

  if (notifyKitModule !== undefined) return notifyKitModule;

  try {
    notifyKitModule = require('react-native-notify-kit') as NotifyKitModule;
  } catch (error) {
    console.warn('Native spot submission notifications are unavailable in this build:', error);
    notifyKitModule = null;
  }

  return notifyKitModule;
}

function registerForegroundRunner(module: NotifyKitModule) {
  if (foregroundRunnerRegistered) return;

  module.default.registerForegroundService(() => new Promise<void>(() => undefined));
  foregroundRunnerRegistered = true;
}

async function prepareNotifyKit() {
  const module = await loadNotifyKit();
  if (!module) return null;

  registerForegroundRunner(module);
  let settings = await module.default.getNotificationSettings();
  if (settings.authorizationStatus <= module.AuthorizationStatus.NOT_DETERMINED) {
    settings = await module.default.requestPermission();
  }
  if (settings.authorizationStatus <= module.AuthorizationStatus.DENIED) {
    throw new Error('Notifications are disabled for CebSpot in Android settings.');
  }
  await module.default.createChannel({
    id: channelId,
    name: 'Spot submissions',
    description: 'Progress and results for submitted CebSpot locations',
    importance: module.AndroidImportance.LOW,
  });

  return module;
}

function clampProgress(percent: number) {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function progressNotification(
  jobId: string,
  spotName: string,
  progress: SpotSubmissionProgress,
  asForegroundService: boolean
) {
  const percent = clampProgress(progress.percent);

  return {
    id: jobId,
    title: `Submitting ${spotName}`,
    body: `${progress.message} - ${percent}%`,
    android: {
      channelId,
      asForegroundService,
      color: colors.primary,
      ongoing: true,
      onlyAlertOnce: true,
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
      progress: {
        max: 100,
        current: percent,
      },
    },
  } as const;
}

async function safelyNotify(action: (module: NotifyKitModule) => Promise<void>) {
  try {
    const module = await prepareNotifyKit();
    if (module) await action(module);
  } catch (error) {
    console.warn('Unable to update the spot submission notification:', error);
  }
}

async function displayProgressNotification(jobId: string, spotName: string, progress: SpotSubmissionProgress) {
  await safelyNotify(async (module) => {
    try {
      await module.default.displayNotification(progressNotification(jobId, spotName, progress, true));
    } catch (foregroundError) {
      console.warn('Foreground progress notification failed; using a regular notification:', foregroundError);
      await module.default.stopForegroundService().catch(() => undefined);
      await module.default.displayNotification(progressNotification(jobId, spotName, progress, false));
    }
  });
}

export function initializeSpotSubmissionNotifications() {
  void loadNotifyKit()
    .then((module) => {
      if (module) registerForegroundRunner(module);
    })
    .catch((error) => {
      console.warn('Unable to initialize spot submission notifications:', error);
    });
}

export const spotSubmissionNotificationService = {
  async prepare(): Promise<SpotSubmissionNotificationStatus> {
    if (Platform.OS !== 'android') {
      return { supported: false, authorized: false, detail: 'Progress notifications are currently Android-only.' };
    }

    try {
      const module = await prepareNotifyKit();
      if (!module) {
        return {
          supported: false,
          authorized: false,
          detail: 'This app build does not include the notification module.',
        };
      }
      return { supported: true, authorized: true };
    } catch (error) {
      return {
        supported: true,
        authorized: false,
        detail: error instanceof Error ? error.message : 'Notifications are unavailable.',
      };
    }
  },

  async openSettings() {
    const module = await loadNotifyKit();
    await module?.default.openNotificationSettings();
  },

  async begin(jobId: string, spotName: string) {
    await displayProgressNotification(
      jobId,
      spotName,
      { percent: 1, message: 'Starting privacy protection' }
    );
  },

  async update(jobId: string, spotName: string, progress: SpotSubmissionProgress) {
    await displayProgressNotification(jobId, spotName, progress);
  },

  async complete(jobId: string, spotName: string) {
    await safelyNotify(async (module) => {
      await module.default.stopForegroundService().catch(() => undefined);
      await module.default.displayNotification({
        id: jobId,
        title: 'Spot submitted',
        body: `${spotName} was sent to CebSpot admins for review.`,
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
    });
  },

  async fail(jobId: string, spotName: string, reason: string) {
    await safelyNotify(async (module) => {
      await module.default.stopForegroundService().catch(() => undefined);
      await module.default.displayNotification({
        id: jobId,
        title: 'Spot submission failed',
        body: `${spotName}: ${reason}`,
        android: {
          channelId,
          color: colors.danger,
          onlyAlertOnce: false,
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
        },
      });
    });
  },
};
