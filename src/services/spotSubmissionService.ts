import * as FileSystem from 'expo-file-system';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type {
  NewSpotSubmission,
  NewSpotSubmissionUpload,
  SpotSubmission,
  SpotSubmissionMediaAsset,
} from '../types';
import { activityService } from './activityService';
import { imageAnonymizationService } from './imageAnonymization';
import { localUpdateService } from './localUpdateService';

const spotImagesBucket = 'spot-images';
const uploadProgressMessage = 'Spot uploading...';

export type SpotSubmissionProgress = {
  percent: number;
  message: string;
};

export type SpotSubmissionProgressHandler = (progress: SpotSubmissionProgress) => void | Promise<void>;

type CreateSubmissionOptions = {
  onProgress?: SpotSubmissionProgressHandler;
};

async function reportProgress(
  onProgress: SpotSubmissionProgressHandler | undefined,
  percent: number,
  message: string
) {
  try {
    await onProgress?.({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      message,
    });
  } catch (error) {
    console.warn('Unable to report spot submission progress:', error);
  }
}

function looksLikeSubmissionSchemaGap(error: any) {
  return /column|schema cache|categories|is_reservable|reservation_type|payment_required/i.test(error?.message ?? '');
}

function toLegacySubmission(submission: NewSpotSubmission) {
  const {
    categories: _categories,
    is_reservable: _isReservable,
    reservation_type: _reservationType,
    payment_required: _paymentRequired,
    ...legacySubmission
  } = submission;

  return legacySubmission;
}

function toDatabaseSubmission(submission: NewSpotSubmissionUpload): NewSpotSubmission {
  const { media: _media, draftId: _draftId, ...databaseSubmission } = submission;
  return databaseSubmission;
}

function isLocalFileUri(uri: string) {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph:');
}

function getMediaExtension(asset: SpotSubmissionMediaAsset, uri: string) {
  const fileNameExtension = asset.fileName?.split('.').pop();
  const cleanUri = uri.split('?')[0] ?? '';
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  const mimeExtension = asset.mimeType?.split('/').pop();
  const fallback = asset.type === 'video' ? 'mp4' : 'jpg';
  const rawExtension = fileNameExtension || match?.[1] || mimeExtension || fallback;
  const extension = rawExtension.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (extension === 'jpeg') return 'jpg';
  if (extension === 'quicktime') return 'mov';
  return extension || fallback;
}

function getMediaContentType(asset: SpotSubmissionMediaAsset, extension: string) {
  if (asset.mimeType) return asset.mimeType;
  if (asset.type === 'image') return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'webm') return 'video/webm';
  return 'video/mp4';
}

function base64ToArrayBuffer(base64: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleanBase64 = base64.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of cleanBase64) {
    const value = chars.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes).buffer;
}

async function uploadMedia(
  asset: SpotSubmissionMediaAsset,
  submitterId: string,
  index: number,
  totalMedia: number,
  onProgress?: SpotSubmissionProgressHandler
) {
  const mediaLabel = asset.type === 'video' ? 'video' : 'photo';
  const progressAt = (fraction: number) => 5 + ((index + fraction) / totalMedia) * 75;

  if (!isLocalFileUri(asset.uri)) {
    await reportProgress(onProgress, progressAt(1), uploadProgressMessage);
    return asset.uri;
  }

  await reportProgress(onProgress, progressAt(0), uploadProgressMessage);

  const processedUri = asset.type === 'image'
    ? await imageAnonymizationService.anonymizeImage(asset.uri)
    : asset.uri;

  try {
    await reportProgress(onProgress, progressAt(0.65), uploadProgressMessage);
    const extension = getMediaExtension(asset, processedUri);
    const base64 = await FileSystem.readAsStringAsync(processedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const fileBody = base64ToArrayBuffer(base64);
    const path = `${submitterId}/${Date.now()}-${index}.${extension}`;
    const contentType = getMediaContentType(asset, extension);
    const { error } = await supabase.storage.from(spotImagesBucket).upload(path, fileBody, {
      contentType,
      upsert: false,
    });
    if (error) {
      throw new Error(`Unable to upload selected ${mediaLabel} ${index + 1}: ${error.message}`);
    }

    const { data } = supabase.storage.from(spotImagesBucket).getPublicUrl(path);
    await reportProgress(onProgress, progressAt(1), uploadProgressMessage);
    return data.publicUrl;
  } finally {
    if (processedUri !== asset.uri && processedUri.startsWith('file:')) {
      await FileSystem.deleteAsync(processedUri, { idempotent: true }).catch(() => undefined);
    }
  }
}

function submissionMedia(submission: NewSpotSubmissionUpload): SpotSubmissionMediaAsset[] {
  if (submission.media?.length) return submission.media;
  return (submission.images ?? []).map((uri, index) => ({
    id: `legacy-image-${index}`,
    uri,
    type: 'image',
  }));
}

async function uploadSubmissionMedia(
  submission: NewSpotSubmissionUpload,
  onProgress?: SpotSubmissionProgressHandler
): Promise<NewSpotSubmission> {
  const databaseSubmission = toDatabaseSubmission(submission);
  const media = submissionMedia(submission);
  if (!hasSupabaseConfig || !media.length) return databaseSubmission;

  const uploadedMedia: string[] = [];
  for (const [index, asset] of media.entries()) {
    uploadedMedia.push(
      await uploadMedia(asset, submission.submitter_id, index, media.length, onProgress)
    );
  }

  return {
    ...databaseSubmission,
    images: uploadedMedia,
  };
}

export const spotSubmissionService = {
  async createSubmission(
    submission: NewSpotSubmissionUpload,
    userName: string,
    options: CreateSubmissionOptions = {}
  ): Promise<SpotSubmission> {
    await reportProgress(options.onProgress, 2, uploadProgressMessage);

    const databaseSubmission = toDatabaseSubmission(submission);

    if (!hasSupabaseConfig) {
      await reportProgress(options.onProgress, 30, uploadProgressMessage);
      const created: SpotSubmission = {
        id: `local-submission-${Date.now()}`,
        status: 'pending',
        rejection_reason: null,
        created_at: new Date().toISOString(),
        ...databaseSubmission,
      };
      await activityService.logActivity({
        user_id: submission.submitter_id,
        user_name: userName || 'Explorer',
        action: 'submitted',
        target_id: created.id,
        target_name: submission.name,
        type: 'submission',
        spot_name: submission.name,
      });
      await reportProgress(options.onProgress, 70, uploadProgressMessage);
      await localUpdateService.createLocalUpdate({
        user_id: submission.submitter_id,
        user_name: userName || 'Explorer',
        title: submission.name,
        body: submission.description || 'Shared a new spot for the CebSpot community.',
        location_name: submission.address,
        latitude: submission.latitude,
        longitude: submission.longitude,
        image_url: submission.images?.[0] ?? null,
        media_urls: submission.images ?? [],
        source_type: 'spot_submission',
        source_id: created.id,
        spot_count: 0,
        comments_count: 0,
      });
      await reportProgress(options.onProgress, 100, 'Spot submitted for review');
      return created;
    }

    const submissionWithUploadedImages = await uploadSubmissionMedia(submission, options.onProgress);
    if (!submissionMedia(submission).length) {
      await reportProgress(options.onProgress, 80, uploadProgressMessage);
    }

    await reportProgress(options.onProgress, 84, uploadProgressMessage);
    let { data, error } = await supabase
      .from('spot_submissions')
      .insert(submissionWithUploadedImages)
      .select('*')
      .single();
    if (error && looksLikeSubmissionSchemaGap(error)) {
      const retry = await supabase
        .from('spot_submissions')
        .insert(toLegacySubmission(submissionWithUploadedImages))
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;

    await reportProgress(options.onProgress, 91, uploadProgressMessage);
    await activityService.logActivity({
      user_id: submission.submitter_id,
      user_name: userName || 'Explorer',
      action: 'submitted',
      target_id: data.id,
      target_name: submission.name,
      type: 'submission',
      spot_name: submission.name,
    });

    await reportProgress(options.onProgress, 96, uploadProgressMessage);
    try {
      await localUpdateService.createLocalUpdate({
        user_id: submissionWithUploadedImages.submitter_id,
        user_name: userName || 'Explorer',
        title: submissionWithUploadedImages.name,
        body: submissionWithUploadedImages.description || 'Shared a new spot for the CebSpot community.',
        location_name: submissionWithUploadedImages.address,
        latitude: submissionWithUploadedImages.latitude,
        longitude: submissionWithUploadedImages.longitude,
        image_url: submissionWithUploadedImages.images?.[0] ?? null,
        media_urls: submissionWithUploadedImages.images ?? [],
        source_type: 'spot_submission',
        source_id: data.id,
        spot_count: 0,
        comments_count: 0,
      });
    } catch (localUpdateError) {
      console.error('Unable to publish local update for submitted spot:', localUpdateError);
    }

    await reportProgress(options.onProgress, 100, 'Spot submitted for review');
    return data as SpotSubmission;
  },
};
