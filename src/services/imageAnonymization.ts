import * as FileSystem from 'expo-file-system';

const configuredFaceBlurApiUrl = process.env.EXPO_PUBLIC_FACE_BLUR_API_URL?.replace(/\/+$/, '') ?? '';
const healthCheckCacheMs = 30_000;
const jobPollIntervalMs = 1_000;
const jobTimeoutMs = 5 * 60_000;
const maxConsecutivePollFailures = 5;
let lastHealthyCheckAt = 0;

const supportedExtensions = new Set(['jpg', 'jpeg', 'png']);

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
  faces_detected?: number;
  processing_time_ms?: number;
};

function isLocalFileUri(uri: string) {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph:');
}

function getImageExtension(uri: string) {
  const cleanUri = uri.split('?')[0] ?? '';
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  const extension = (match?.[1] || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  if (!supportedExtensions.has(extension)) {
    throw new Error('Only JPG, JPEG, and PNG photos can be anonymized.');
  }
  return extension === 'jpeg' ? 'jpg' : extension;
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

  try {
    const response = await fetchWithTimeout(`${configuredFaceBlurApiUrl}/health`, { method: 'GET' }, 8_000);
    if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}.`);
    lastHealthyCheckAt = Date.now();
  } catch (error) {
    console.warn('Face anonymization health check failed', {
      url: configuredFaceBlurApiUrl,
      error: getErrorMessage(error),
    });
    throw new Error(
      `Unable to reach the face anonymization service at ${configuredFaceBlurApiUrl}. The original photo was not uploaded.`
    );
  }
}

async function prepareImageForUpload(uri: string, extension: string) {
  const preparedUri = cacheFileUri('cebspot-privacy-source', extension);

  try {
    await FileSystem.copyAsync({ from: uri, to: preparedUri });
    return preparedUri;
  } catch (copyError) {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(preparedUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return preparedUri;
    } catch (readError) {
      console.warn('Unable to prepare image for anonymization', {
        uriScheme: uri.split(':')[0],
        copyError: getErrorMessage(copyError),
        readError: getErrorMessage(readError),
      });
      await FileSystem.deleteAsync(preparedUri, { idempotent: true }).catch(() => undefined);
      throw new Error('Unable to prepare the selected photo for privacy processing.');
    }
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
    if (body.detail) return body.detail;
  } catch {
    // Fall through to a safe generic message.
  }
  return 'The face anonymizer rejected this image.';
}

function uploadErrorMessage(body: string) {
  const parsed = parseJobResponse(body);
  return parsed.detail || 'The face anonymizer rejected this image.';
}

async function createAnonymizationJob(preparedUri: string, contentType: string) {
  const upload = await FileSystem.uploadAsync(`${configuredFaceBlurApiUrl}/api/anonymize-jobs`, preparedUri, {
    fieldName: 'image',
    httpMethod: 'POST',
    mimeType: contentType,
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
  });

  if (upload.status < 200 || upload.status >= 300) {
    throw new Error(uploadErrorMessage(upload.body));
  }

  const job = parseJobResponse(upload.body);
  if (!job.job_id) throw new Error('The face anonymizer did not return a processing job.');
  return job.job_id;
}

async function waitForAnonymizationJob(jobId: string) {
  const deadline = Date.now() + jobTimeoutMs;
  let consecutiveFailures = 0;

  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetchWithTimeout(`${configuredFaceBlurApiUrl}/api/anonymize-jobs/${jobId}`);
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= maxConsecutivePollFailures) {
        throw new Error(`Lost connection to the privacy service: ${getErrorMessage(error)}`);
      }
      await wait(jobPollIntervalMs);
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

  throw new Error('Privacy processing took longer than five minutes. The original photo was not uploaded.');
}

async function downloadAnonymizedImage(jobId: string, extension: string) {
  const outputUri = cacheFileUri('cebspot-anonymized', extension);

  try {
    const result = await FileSystem.downloadAsync(
      `${configuredFaceBlurApiUrl}/api/anonymize-jobs/${jobId}/result`,
      outputUri
    );
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Unable to download the privacy-protected photo (HTTP ${result.status}).`);
    }
    return outputUri;
  } catch (error) {
    await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
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

    const extension = getImageExtension(uri);
    const preparedUri = await prepareImageForUpload(uri, extension);

    try {
      await assertFaceBlurServiceReachable();
      const jobId = await createAnonymizationJob(preparedUri, getContentType(extension));
      const completedJob = await waitForAnonymizationJob(jobId);
      const outputUri = await downloadAnonymizedImage(jobId, extension);

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
