import { isLocalFileUri } from '../utils/mediaFile';
import * as FileSystem from 'expo-file-system';
import { compressPhoto, mediaLimits, cleanupMedia } from './mediaCompression';
import { withMediaSession } from './mediaSession';
import { userErrorMessage, UserFacingError } from '../utils/userError';
import { Platform } from 'react-native';

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
let lastHealthyCheckAt = 0;
const transientHttpStatuses = new Set([408, 425, 500, 502, 503, 504]);


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
class PermanentUploadError extends UserFacingError {}

function getContentType(extension: string) {
  return extension === 'png' ? 'image/png' : 'image/jpeg';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'Unknown error');
}

function privacySafeErrorMessage(error: unknown) {
  return userErrorMessage(error, 'We could not prepare your photo safely. Please try again shortly. Your original photo was not uploaded.');
}

function getCacheRoot() {
  const cacheRoot = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheRoot) throw new Error('Unable to access temporary storage on this device.');
  return cacheRoot;
}

function cacheFileUri(prefix: string, extension: string) {
  return `${getCacheRoot()}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
}

async function cleanupTemporaryFile(uri: string) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    console.error('Unable to remove temporary image file:', error);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const send = async (headers?: { Authorization: string }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...init, headers: headers ? { ...init.headers, ...headers } : init.headers, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
  };
  return url.startsWith(configuredFaceBlurApiUrl + '/api/') ? withMediaSession(send) : send();
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

async function assertFaceBlurServiceReachable() {
  if (!configuredFaceBlurApiUrl) {
    throw new UserFacingError('Photo uploads are temporarily unavailable. Please try again shortly.');
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
    const compressedUri = await compressPhoto(uri, mediaLimits.privacyInput);
    await FileSystem.copyAsync({ from: compressedUri, to: preparedUri });
    if (compressedUri !== uri) {
      await cleanupTemporaryFile(compressedUri);
    }
    return { preparedUri, extension: 'jpg' };
  } catch (compressionError) {
    console.warn('Unable to compress image for anonymization', {
      uriScheme: uri.split(':')[0],
      compressionError: getErrorMessage(compressionError),
    });
    await cleanupTemporaryFile(preparedUri);
    throw new Error('Unable to compress the selected photo for privacy processing.');
  }
}

function parseJobResponse(body: string): AnonymizationJob {
  try {
    return JSON.parse(body) as AnonymizationJob;
  } catch {
    throw new Error('The face anonymizer returned an unreadable response.');
  }
}

function mediaHttpMessage(status: number) {
  if (status === 401) return 'Please sign in again, then try uploading again.';
  if (status === 403) return 'Your account is not ready to upload. Please reopen CebSpot and try again.';
  if (status === 413 || status === 415) return 'This photo could not be opened. Please choose another photo.';
  if (status === 429) return 'Photo limit reached. Please wait a moment, then try again.';
  return 'Photo processing is temporarily unavailable. Please try again shortly. Your original photo was not uploaded.';
}

async function responseErrorMessage(response: Response) { return mediaHttpMessage(response.status); }
function uploadErrorMessage(_body: string, status: number) { return mediaHttpMessage(status); }

async function createAnonymizationJob(preparedUri: string, contentType: string) {
  let lastError: unknown = new Error('The face anonymizer did not accept the upload.');

  for (let attempt = 1; attempt <= jobCreateAttempts; attempt += 1) {
    try {
      const upload = await withMediaSession((headers) => FileSystem.uploadAsync(`${configuredFaceBlurApiUrl}/api/anonymize-jobs`, preparedUri, {
        fieldName: 'image',
        httpMethod: 'POST',
        mimeType: contentType,
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        headers,
      }));

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
      if (error instanceof PermanentUploadError || error instanceof UserFacingError) throw error;
      lastError = error;
      if (attempt >= jobCreateAttempts) break;
    }

    await wait(transientRetryDelayMs * attempt);
  }

  throw lastError;
}

async function createBrowserAnonymizationJob(uri: string) {
  const imageResponse = await fetch(uri);
  if (!imageResponse.ok) throw new Error('Unable to read the selected photo.');
  const image = await imageResponse.blob();
  const form = new FormData();
  form.append('image', image, 'photo');

  const response = await fetchWithTimeout(`${configuredFaceBlurApiUrl}/api/anonymize-jobs`, {
    method: 'POST',
    body: form,
  }, jobRequestTimeoutMs);
  const responseBody = await response.text();
  if (!response.ok) throw new Error(uploadErrorMessage(responseBody, response.status));
  const job = parseJobResponse(responseBody);
  if (!job.job_id) throw new Error('The face anonymizer did not return a processing job.');
  return job.job_id;
}

async function processBrowserImage(uri: string) {
  await assertFaceBlurServiceReachable();
  const jobId = await createBrowserAnonymizationJob(uri);
  const completedJob = await waitForAnonymizationJob(jobId);
  const response = await fetchWithTimeout(
    `${configuredFaceBlurApiUrl}/api/anonymize-jobs/${jobId}/result`,
    { method: 'GET' },
    jobRequestTimeoutMs,
  );
  if (!response.ok) throw new UserFacingError(await responseErrorMessage(response));
  const output = await response.blob();
  const outputUri = URL.createObjectURL(output);
  console.info('Photo privacy processing complete', {
    facesDetected: Number(completedJob.faces_detected ?? 0),
    processingTimeMs: Number(completedJob.processing_time_ms ?? 0),
  });
  return outputUri;
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
      if (error instanceof UserFacingError) throw error;
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
      const result = await withMediaSession((headers) => FileSystem.downloadAsync(
        `${configuredFaceBlurApiUrl}/api/anonymize-jobs/${jobId}/result`,
        outputUri,
        { headers }
      ));
      if (result.status >= 200 && result.status < 300) return outputUri;
      await cleanupTemporaryFile(outputUri);
      if (result.status === 404 || result.status === 410) {
        throw new RecoverableJobError(`The anonymization job result expired (HTTP ${result.status}).`);
      }

      lastError = new Error(`Unable to download the privacy-protected photo (HTTP ${result.status}).`);
      if (!transientHttpStatuses.has(result.status)) throw new PermanentUploadError(getErrorMessage(lastError));
    } catch (error) {
      if (error instanceof RecoverableJobError || error instanceof UserFacingError) { await cleanupTemporaryFile(outputUri); throw error; }
      lastError = error;
      if (attempt >= jobCreateAttempts) break;
    }

    await cleanupTemporaryFile(outputUri);
    await wait(transientRetryDelayMs * attempt);
  }

  await cleanupTemporaryFile(outputUri);
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

  async cleanupProcessedImage(processedUri: string, originalUri: string) {
    if (processedUri === originalUri) return;
    if (processedUri.startsWith('blob:')) {
      URL.revokeObjectURL(processedUri);
      return;
    }
    if (processedUri.startsWith('file:')) {
      await cleanupTemporaryFile(processedUri);
    }
  },

  async checkAvailability() {
    try { await assertFaceBlurServiceReachable(); }
    catch (error) { throw new UserFacingError(privacySafeErrorMessage(error)); }
  },

  async anonymizeImage(uri: string): Promise<string> {
    if (!configuredFaceBlurApiUrl) {
      throw new Error('Face anonymization service is not configured. The original photo was not uploaded.');
    }

    if (Platform.OS === 'web' && /^(blob|data):/i.test(uri)) {
      try {
        const prepared = await compressPhoto(uri, mediaLimits.privacyInput);
        let processed = prepared;
        try {
          processed = await processBrowserImage(prepared);
          return await compressPhoto(processed);
        } finally {
          await cleanupMedia(prepared, uri);
          await cleanupMedia(processed, uri);
        }
      } catch (error) {
        console.warn('Browser face anonymization failed', {
          url: configuredFaceBlurApiUrl,
          error: getErrorMessage(error),
        });
        throw new UserFacingError(privacySafeErrorMessage(error));
      }
    }
    if (!isLocalFileUri(uri)) {
      throw new Error('This photo source cannot be privacy processed. The original photo was not uploaded.');
    }

    const { preparedUri, extension: preparedExtension } = await prepareImageForUpload(uri);

    try {
      await assertFaceBlurServiceReachable();
      const { completedJob, outputUri } = await processPreparedImage(preparedUri, preparedExtension);

      console.info('Photo privacy processing complete', {
        facesDetected: Number(completedJob.faces_detected ?? 0),
        processingTimeMs: Number(completedJob.processing_time_ms ?? 0),
      });
      try { return await compressPhoto(outputUri); }
      finally { await cleanupTemporaryFile(outputUri); }
    } catch (error) {
      console.warn('Face anonymization job failed', {
        url: configuredFaceBlurApiUrl,
        error: getErrorMessage(error),
      });
      throw new UserFacingError(privacySafeErrorMessage(error));
    } finally {
      await cleanupTemporaryFile(preparedUri);
    }
  },
};
