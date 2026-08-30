import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

const configuredFaceBlurApiUrl = process.env.EXPO_PUBLIC_FACE_BLUR_API_URL?.replace(/\/+$/, '') ?? '';
const healthCheckCacheMs = 30_000;
const healthWakeTimeoutMs = 90_000;
const healthRequestTimeoutMs = 15_000;
const healthRetryDelayMs = 2_000;
const jobPollIntervalMs = 1_000;
const jobTimeoutMs = 5 * 60_000;
const jobRequestTimeoutMs = 20_000;
const jobCreateAttempts = 3;
const jobRecoveryAttempts = 2;
const transientRetryDelayMs = 2_000;
const maxPrivacyUploadDimension = 1800;
const targetPrivacyUploadBytes = 4 * 1024 * 1024;
const compressionLevels = [0.78, 0.64, 0.52];
let lastHealthyCheckAt = 0;
const transientHttpStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

function assertProductionApiUrlIsSafe() {
  if (__DEV__ || !configuredFaceBlurApiUrl) return;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredFaceBlurApiUrl);
  } catch {
    throw new Error('Face anonymization service URL is invalid. The original photo was not uploaded.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error(
      'The published app requires a public HTTPS face anonymization service. The original photo was not uploaded.'
    );
  }
}

type AnonymizationJob = {
  job_id?: string;
  status?: 'queued' | 'processing' | 'complete' | 'delivering' | 'failed';
  detail?: string;
  error?: string;
  message?: string;
  faces_detected?: number;
  processing_time_ms?: number;
};

class RecoverableJobError extends Error {}
class PermanentUploadError extends Error {}

function isLocalFileUri(uri: string) {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph:');
}

function getContentType(extension: string) {
  return extension === 'png' ? 'image/png' : 'image/jpeg';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'Unknown error');
}

function privacySafeErrorMessage(error: unknown) {
  const message = getErrorMessage(error);
  if (/original photo (?:was not|wasn't) uploaded/i.test(message)) return message;
  return `${message} The original photo was not uploaded.`;
}

function getCacheRoot() {
  const cacheRoot = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheRoot) throw new Error('Unable to access temporary storage on this device.');
  return cacheRoot;
}

function cacheFileUri(prefix: string, extension: string) {
  return `${getCacheRoot()}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

async function assertFaceBlurServiceReachable() {
  if (!configuredFaceBlurApiUrl) {
    throw new Error('Face anonymization service is not configured. The original photo was not uploaded.');
  }

  assertProductionApiUrlIsSafe();
  if (Date.now() - lastHealthyCheckAt < healthCheckCacheMs) return;

  if (/YOUR_COMPUTER_LAN_IP/i.test(configuredFaceBlurApiUrl)) {
    throw new Error('Face anonymization URL still uses YOUR_COMPUTER_LAN_IP. Set it to your laptop IP in .env.local.');
  }

  const deadline = Date.now() + healthWakeTimeoutMs;
  let lastError: unknown = new Error('The service did not become ready.');

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(
        `${configuredFaceBlurApiUrl}/health`,
        { method: 'GET' },
        healthRequestTimeoutMs
      );
      if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}.`);

      const health = (await response.json()) as { status?: string; service?: string };
      if (health.status !== 'ok' || health.service !== 'cebspot-face-anonymizer') {
        throw new Error('Health check returned an unexpected service response.');
      }

      lastHealthyCheckAt = Date.now();
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() + healthRetryDelayMs >= deadline) break;
      await wait(healthRetryDelayMs);
    }
  }

  console.warn('Face anonymization health check failed', {
    url: configuredFaceBlurApiUrl,
    error: getErrorMessage(lastError),
  });
  throw new Error(
    `Unable to reach the face anonymization service at ${configuredFaceBlurApiUrl}. The original photo was not uploaded.`
  );
}

async function prepareImageForUpload(uri: string) {
  const preparedUri = cacheFileUri('cebspot-privacy-source', 'jpg');

  try {
    const compressedUri = await compressImageForPrivacyUpload(uri);
    await FileSystem.copyAsync({ from: compressedUri, to: preparedUri });
    if (compressedUri !== uri) {
      await FileSystem.deleteAsync(compressedUri, { idempotent: true }).catch(() => undefined);
    }
    return { preparedUri, extension: 'jpg' };
  } catch (compressionError) {
    console.warn('Unable to compress image for anonymization', {
      uriScheme: uri.split(':')[0],
      compressionError: getErrorMessage(compressionError),
    });
    await FileSystem.deleteAsync(preparedUri, { idempotent: true }).catch(() => undefined);
    throw new Error('Unable to compress the selected photo for privacy processing.');
  }
}

async function getFileSize(uri: string) {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  return info.exists && typeof info.size === 'number' ? info.size : null;
}

async function compressImageForPrivacyUpload(uri: string) {
  let workingUri = uri;
  let temporaryInput: string | null = null;

  try {
    const firstPass = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: compressionLevels[0], format: ImageManipulator.SaveFormat.JPEG }
    );
    workingUri = firstPass.uri;
    temporaryInput = firstPass.uri;

    const longestSide = Math.max(firstPass.width, firstPass.height);
    if (longestSide > maxPrivacyUploadDimension) {
      const resize =
        firstPass.width >= firstPass.height
          ? { width: maxPrivacyUploadDimension }
          : { height: maxPrivacyUploadDimension };
      const resized = await ImageManipulator.manipulateAsync(
        workingUri,
        [{ resize }],
        { compress: compressionLevels[0], format: ImageManipulator.SaveFormat.JPEG }
      );
      await FileSystem.deleteAsync(workingUri, { idempotent: true }).catch(() => undefined);
      workingUri = resized.uri;
      temporaryInput = resized.uri;
    }

    for (const compression of compressionLevels.slice(1)) {
      const size = await getFileSize(workingUri);
      if (size !== null && size <= targetPrivacyUploadBytes) break;

      const recompressed = await ImageManipulator.manipulateAsync(
        workingUri,
        [],
        { compress: compression, format: ImageManipulator.SaveFormat.JPEG }
      );
      await FileSystem.deleteAsync(workingUri, { idempotent: true }).catch(() => undefined);
      workingUri = recompressed.uri;
      temporaryInput = recompressed.uri;
    }

    return workingUri;
  } catch (error) {
    if (temporaryInput) {
      await FileSystem.deleteAsync(temporaryInput, { idempotent: true }).catch(() => undefined);
    }
    throw error;
  }
}

function parseJobResponse(body: string): AnonymizationJob {
  try {
    return JSON.parse(body) as AnonymizationJob;
  } catch {
    throw new Error('The face anonymizer returned an unreadable response.');
  }
}

async function responseErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as AnonymizationJob;
    const detail = body.detail || body.error || body.message;
    if (detail) return `${detail} (HTTP ${response.status})`;
  } catch {
    // Fall through to a safe generic message.
  }
  return `The face anonymizer returned HTTP ${response.status} without an explanation.`;
}

function uploadErrorMessage(body: string, status: number) {
  try {
    const parsed = parseJobResponse(body);
    return `${parsed.detail || parsed.error || parsed.message || 'The face anonymizer rejected the request.'} (HTTP ${status})`;
  } catch {
    return `The face anonymizer returned HTTP ${status} without a readable explanation.`;
  }
}

async function createAnonymizationJob(preparedUri: string, contentType: string) {
  let lastError: unknown = new Error('The face anonymizer did not accept the upload.');

  for (let attempt = 1; attempt <= jobCreateAttempts; attempt += 1) {
    try {
      const upload = await FileSystem.uploadAsync(`${configuredFaceBlurApiUrl}/api/anonymize-jobs`, preparedUri, {
        fieldName: 'image',
        httpMethod: 'POST',
        mimeType: contentType,
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      });

      if (upload.status >= 200 && upload.status < 300) {
        const job = parseJobResponse(upload.body);
        if (!job.job_id) throw new Error('The face anonymizer did not return a processing job.');
        return job.job_id;
      }

      lastError = new Error(uploadErrorMessage(upload.body, upload.status));
      console.warn('Face anonymization upload returned an error', {
        status: upload.status,
        attempt,
      });
      if (!transientHttpStatuses.has(upload.status)) throw new PermanentUploadError(getErrorMessage(lastError));
    } catch (error) {
      if (error instanceof PermanentUploadError) throw error;
      lastError = error;
      if (attempt >= jobCreateAttempts) break;
    }

    await wait(transientRetryDelayMs * attempt);
  }

  throw lastError;
}

async function waitForAnonymizationJob(jobId: string) {
  const deadline = Date.now() + jobTimeoutMs;
  let lastTemporaryError = '';

  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${configuredFaceBlurApiUrl}/api/anonymize-jobs/${jobId}`,
        { method: 'GET' },
        jobRequestTimeoutMs
      );
    } catch (error) {
      lastTemporaryError = getErrorMessage(error);
      await wait(jobPollIntervalMs);
      continue;
    }

    if (response.status === 404 || response.status === 410) {
      throw new RecoverableJobError(await responseErrorMessage(response));
    }
    if (transientHttpStatuses.has(response.status)) {
      lastTemporaryError = await responseErrorMessage(response);
      await wait(transientRetryDelayMs);
      continue;
    }
    if (!response.ok) throw new Error(await responseErrorMessage(response));

    const job = (await response.json()) as AnonymizationJob;
    if (job.status === 'complete') return job;
    if (job.status === 'failed') {
      throw new Error(job.detail || 'The face anonymizer could not process this image.');
    }

    await wait(jobPollIntervalMs);
  }

  throw new Error(
    `Privacy processing took longer than five minutes${lastTemporaryError ? `: ${lastTemporaryError}` : '.'} The original photo was not uploaded.`
  );
}

async function downloadAnonymizedImage(jobId: string, extension: string) {
  const outputUri = cacheFileUri('cebspot-anonymized', extension);
  let lastError: unknown = new Error('Unable to download the privacy-protected photo.');

  for (let attempt = 1; attempt <= jobCreateAttempts; attempt += 1) {
    try {
      const result = await FileSystem.downloadAsync(
        `${configuredFaceBlurApiUrl}/api/anonymize-jobs/${jobId}/result`,
        outputUri
      );
      if (result.status >= 200 && result.status < 300) return outputUri;
      if (result.status === 404 || result.status === 410) {
        throw new RecoverableJobError(`The anonymization job result expired (HTTP ${result.status}).`);
      }

      lastError = new Error(`Unable to download the privacy-protected photo (HTTP ${result.status}).`);
      if (!transientHttpStatuses.has(result.status)) throw lastError;
    } catch (error) {
      if (error instanceof RecoverableJobError) throw error;
      lastError = error;
      if (attempt >= jobCreateAttempts) break;
    }

    await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => undefined);
    await wait(transientRetryDelayMs * attempt);
  }

  await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => undefined);
  throw lastError;
}

async function processPreparedImage(preparedUri: string, extension: string) {
  let lastError: unknown = new Error('The face anonymizer could not process this image.');

  for (let attempt = 1; attempt <= jobRecoveryAttempts; attempt += 1) {
    try {
      const jobId = await createAnonymizationJob(preparedUri, getContentType(extension));
      const completedJob = await waitForAnonymizationJob(jobId);
      const outputUri = await downloadAnonymizedImage(jobId, extension);
      return { completedJob, outputUri };
    } catch (error) {
      lastError = error;
      if (!(error instanceof RecoverableJobError) || attempt >= jobRecoveryAttempts) throw error;
      console.warn('Face anonymization job was lost; recreating it', { attempt });
      await wait(transientRetryDelayMs * attempt);
    }
  }

  throw lastError;
}

export const imageAnonymizationService = {
  isConfigured: Boolean(configuredFaceBlurApiUrl),

  async checkAvailability() {
    await assertFaceBlurServiceReachable();
  },

  async anonymizeImage(uri: string): Promise<string> {
    if (!isLocalFileUri(uri)) return uri;
    if (!configuredFaceBlurApiUrl) {
      throw new Error('Face anonymization service is not configured. The original photo was not uploaded.');
    }

    const { preparedUri, extension: preparedExtension } = await prepareImageForUpload(uri);

    try {
      await assertFaceBlurServiceReachable();
      const { completedJob, outputUri } = await processPreparedImage(preparedUri, preparedExtension);

      console.info('Photo privacy processing complete', {
        facesDetected: Number(completedJob.faces_detected ?? 0),
        processingTimeMs: Number(completedJob.processing_time_ms ?? 0),
      });
      return outputUri;
    } catch (error) {
      console.warn('Face anonymization job failed', {
        url: configuredFaceBlurApiUrl,
        error: getErrorMessage(error),
      });
      throw new Error(privacySafeErrorMessage(error));
    } finally {
      await FileSystem.deleteAsync(preparedUri, { idempotent: true }).catch(() => undefined);
    }
  },
};
