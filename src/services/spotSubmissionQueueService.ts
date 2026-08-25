import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewSpotSubmission } from '../types';
import { spotSubmissionNotificationService } from './spotSubmissionNotificationService';
import { spotSubmissionService } from './spotSubmissionService';

let submissionQueue: Promise<void> = Promise.resolve();
const storageKey = 'cebspot:spot-submission-jobs:v1';
const maxStoredJobs = 8;

export type SpotSubmissionJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type SpotSubmissionJob = {
  id: string;
  spotName: string;
  status: SpotSubmissionJobStatus;
  percent: number;
  message: string;
  createdAt: string;
  updatedAt: string;
};

type JobListener = (jobs: SpotSubmissionJob[]) => void;

let jobs: SpotSubmissionJob[] = [];
let initialization: Promise<void> | null = null;
const listeners = new Set<JobListener>();

function notifyListeners() {
  const snapshot = jobs.map((job) => ({ ...job }));
  listeners.forEach((listener) => listener(snapshot));
}

async function persistJobs() {
  await AsyncStorage.setItem(storageKey, JSON.stringify(jobs.slice(0, maxStoredJobs)));
}

async function initializeJobs() {
  if (initialization) return initialization;

  initialization = (async () => {
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      const parsed = stored ? (JSON.parse(stored) as SpotSubmissionJob[]) : [];
      const now = new Date().toISOString();
      jobs = parsed.slice(0, maxStoredJobs).map((job) =>
        job.status === 'queued' || job.status === 'processing'
          ? {
              ...job,
              status: 'failed',
              message: 'Submission was interrupted before it finished. Please submit the spot again.',
              updatedAt: now,
            }
          : job
      );
      await persistJobs();
    } catch (error) {
      console.warn('Unable to restore spot submission status:', error);
      jobs = [];
    }
    notifyListeners();
  })();

  return initialization;
}

async function upsertJob(job: SpotSubmissionJob) {
  jobs = [job, ...jobs.filter((current) => current.id !== job.id)].slice(0, maxStoredJobs);
  notifyListeners();
  await persistJobs().catch((error) => console.warn('Unable to save spot submission status:', error));
}

async function updateJob(jobId: string, updates: Partial<Omit<SpotSubmissionJob, 'id' | 'createdAt'>>) {
  const current = jobs.find((job) => job.id === jobId);
  if (!current) return;
  await upsertJob({
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

function createJobId() {
  return `spot-submission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function submissionFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/anonym|privacy|face/i.test(message)) {
    return "Privacy processing failed. The original photo wasn't uploaded.";
  }
  return message || 'Please open CebSpot and try again.';
}

async function processSubmission(jobId: string, submission: NewSpotSubmission, userName: string) {
  await updateJob(jobId, {
    status: 'processing',
    percent: 1,
    message: 'Starting privacy protection',
  });
  await spotSubmissionNotificationService.begin(jobId, submission.name);

  try {
    await spotSubmissionService.createSubmission(submission, userName, {
      onProgress: async (progress) => {
        await updateJob(jobId, {
          status: 'processing',
          percent: progress.percent,
          message: progress.message,
        });
        await spotSubmissionNotificationService.update(jobId, submission.name, progress);
      },
    });
    await updateJob(jobId, {
      status: 'completed',
      percent: 100,
      message: 'Spot submitted for admin review',
    });
    await spotSubmissionNotificationService.complete(jobId, submission.name);
  } catch (error) {
    console.error('Queued spot submission failed:', error);
    const failureMessage = submissionFailureMessage(error);
    await updateJob(jobId, {
      status: 'failed',
      percent: 0,
      message: failureMessage,
    });
    await spotSubmissionNotificationService.fail(
      jobId,
      submission.name,
      failureMessage
    );
  }
}

export const spotSubmissionQueueService = {
  async enqueue(submission: NewSpotSubmission, userName: string) {
    await initializeJobs();
    const jobId = createJobId();
    const now = new Date().toISOString();
    const queuedSubmission = {
      ...submission,
      images: [...(submission.images ?? [])],
      categories: [...(submission.categories ?? [])],
    };

    await upsertJob({
      id: jobId,
      spotName: submission.name,
      status: 'queued',
      percent: 0,
      message: 'Waiting to start',
      createdAt: now,
      updatedAt: now,
    });

    submissionQueue = submissionQueue
      .catch(() => undefined)
      .then(() => processSubmission(jobId, queuedSubmission, userName));

    return jobId;
  },

  subscribe(listener: JobListener) {
    listeners.add(listener);
    void initializeJobs().then(() => listener(jobs.map((job) => ({ ...job }))));
    return () => {
      listeners.delete(listener);
    };
  },

  async dismiss(jobId: string) {
    await initializeJobs();
    jobs = jobs.filter((job) => job.id !== jobId);
    notifyListeners();
    await persistJobs().catch((error) => console.warn('Unable to dismiss spot submission status:', error));
  },
};
