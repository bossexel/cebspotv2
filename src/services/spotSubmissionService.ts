import * as FileSystem from 'expo-file-system';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewSpotSubmission, SpotSubmission } from '../types';
import { activityService } from './activityService';
import { imageAnonymizationService } from './imageAnonymization';
import { localUpdateService } from './localUpdateService';

const spotImagesBucket = 'spot-images';

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

function isLocalFileUri(uri: string) {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph:');
}

function getImageExtension(uri: string) {
  const cleanUri = uri.split('?')[0] ?? '';
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  return (match?.[1] || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
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

async function uploadImage(
  uri: string,
  submitterId: string,
  index: number,
  totalImages: number,
  onProgress?: SpotSubmissionProgressHandler
) {
  const imageNumber = index + 1;
  const progressAt = (fraction: number) => 5 + ((index + fraction) / totalImages) * 75;

  if (!isLocalFileUri(uri)) {
    await reportProgress(onProgress, progressAt(1), `Photo ${imageNumber} of ${totalImages} is ready`);
    return uri;
  }

  await reportProgress(onProgress, progressAt(0), `Protecting privacy in photo ${imageNumber} of ${totalImages}`);

  const anonymizedUri = await imageAnonymizationService.anonymizeImage(uri);

  try {
    await reportProgress(onProgress, progressAt(0.65), `Uploading photo ${imageNumber} of ${totalImages}`);
    const extension = getImageExtension(anonymizedUri);
    const base64 = await FileSystem.readAsStringAsync(anonymizedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const fileBody = base64ToArrayBuffer(base64);
    const path = `${submitterId}/${Date.now()}-${index}.${extension}`;
    const contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    const { error } = await supabase.storage.from(spotImagesBucket).upload(path, fileBody, {
      contentType,
      upsert: false,
    });
    if (error) {
      throw new Error(`Unable to upload selected image ${index + 1}: ${error.message}`);
    }

    const { data } = supabase.storage.from(spotImagesBucket).getPublicUrl(path);
    await reportProgress(onProgress, progressAt(1), `Uploaded photo ${imageNumber} of ${totalImages}`);
    return data.publicUrl;
  } finally {
    if (anonymizedUri !== uri && anonymizedUri.startsWith('file:')) {
      await FileSystem.deleteAsync(anonymizedUri, { idempotent: true }).catch(() => undefined);
    }
  }
}

async function uploadSubmissionImages(
  submission: NewSpotSubmission,
  onProgress?: SpotSubmissionProgressHandler
): Promise<NewSpotSubmission> {
  if (!hasSupabaseConfig || !submission.images?.length) return submission;

  const uploadedImages: string[] = [];
  for (const [index, imageUri] of submission.images.entries()) {
    uploadedImages.push(
      await uploadImage(imageUri, submission.submitter_id, index, submission.images.length, onProgress)
    );
  }

  return {
    ...submission,
    images: uploadedImages,
  };
}

export const spotSubmissionService = {
  async createSubmission(
    submission: NewSpotSubmission,
    userName: string,
    options: CreateSubmissionOptions = {}
  ): Promise<SpotSubmission> {
    await reportProgress(options.onProgress, 2, 'Preparing your spot submission');

    if (!hasSupabaseConfig) {
      await reportProgress(options.onProgress, 30, 'Saving the spot submission');
      const created: SpotSubmission = {
        id: `local-submission-${Date.now()}`,
        status: 'pending',
        rejection_reason: null,
        created_at: new Date().toISOString(),
        ...submission,
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
      await reportProgress(options.onProgress, 70, 'Publishing the community update');
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

    const submissionWithUploadedImages = await uploadSubmissionImages(submission, options.onProgress);
    if (!submission.images?.length) {
      await reportProgress(options.onProgress, 80, 'Photo processing complete');
    }

    await reportProgress(options.onProgress, 84, 'Saving the spot submission');
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

    await reportProgress(options.onProgress, 91, 'Recording your submission');
    await activityService.logActivity({
      user_id: submission.submitter_id,
      user_name: userName || 'Explorer',
      action: 'submitted',
      target_id: data.id,
      target_name: submission.name,
      type: 'submission',
      spot_name: submission.name,
    });

    await reportProgress(options.onProgress, 96, 'Publishing the community update');
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
