import { isLocalFileUri, isBrowserBlobUri, readMediaBody } from '../utils/mediaFile';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseConfig } from '../lib/supabase';
import type { Spot } from '../types';
import { imageAnonymizationService } from './imageAnonymization';

const spotImagesBucket = 'spot-images';

export type OwnerGalleryUpload = {
  uri: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
};

const maximumUploadBytes = 12 * 1024 * 1024;

async function readUploadBody(uri: string) {
  if (!isLocalFileUri(uri) && !isBrowserBlobUri(uri)) {
    throw new Error('This photo source cannot be privacy processed, so it was not uploaded.');
  }
  return readMediaBody(uri, 'Unable to read one of the selected photos.');
}

function cleanImages(images: string[] | null | undefined) {
  return [...new Set((images ?? []).map((url) => url.trim()).filter(Boolean))];
}

export const ownerGalleryService = {
  async publishPhotos({
    assets,
    userId,
    spot,
    client,
  }: {
    assets: OwnerGalleryUpload[];
    userId: string;
    spot: Spot;
    client: SupabaseClient;
  }): Promise<Spot> {
    if (!assets.length) throw new Error('Choose at least one photo to post.');
    if (assets.length > 8) throw new Error('Post up to 8 photos at a time.');

    const oversizedPhoto = assets.find((asset) => Number(asset.fileSize ?? 0) > maximumUploadBytes);
    if (oversizedPhoto) throw new Error('Each photo must be 12 MB or smaller.');

    if (!hasSupabaseConfig) {
      const localUrls = assets.map((asset) => asset.uri);
      const existingImages = cleanImages(spot.images);
      return {
        ...spot,
        images: existingImages.length
          ? [existingImages[0], ...localUrls, ...existingImages.slice(1)]
          : localUrls,
        updated_at: new Date().toISOString(),
      };
    }

    const uploadedPaths: string[] = [];
    const uploadedUrls: string[] = [];

    try {
      for (const [index, asset] of assets.entries()) {
        if (!asset.uri) throw new Error(`Photo ${index + 1} could not be read.`);

        const processedUri = await imageAnonymizationService.anonymizeImage(asset.uri);
        try {
          const objectPath = `${userId}/owner-gallery/${spot.id}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          const { error: uploadError } = await client.storage
            .from(spotImagesBucket)
            .upload(objectPath, await readUploadBody(processedUri), {
              contentType: 'image/jpeg',
              cacheControl: '31536000',
              upsert: false,
            });
          if (uploadError) throw new Error(`Unable to upload photo ${index + 1}: ${uploadError.message}`);

          uploadedPaths.push(objectPath);
          uploadedUrls.push(client.storage.from(spotImagesBucket).getPublicUrl(objectPath).data.publicUrl);
        } finally {
          await imageAnonymizationService.cleanupProcessedImage(processedUri, asset.uri);
        }
      }

      const { data: currentSpot, error: readError } = await client
        .from('spots')
        .select('*')
        .eq('id', spot.id)
        .single();
      if (readError) throw readError;

      const existingImages = cleanImages(currentSpot.images);
      const nextImages = existingImages.length
        ? [existingImages[0], ...uploadedUrls, ...existingImages.slice(1)]
        : uploadedUrls;
      const { data: updatedSpot, error: updateError } = await client
        .from('spots')
        .update({ images: nextImages, updated_at: new Date().toISOString() })
        .eq('id', spot.id)
        .select('*')
        .single();
      if (updateError) throw updateError;

      return updatedSpot as Spot;
    } catch (error) {
      if (uploadedPaths.length) {
        try {
          const { error: cleanupError } = await client.storage.from(spotImagesBucket).remove(uploadedPaths);
          if (cleanupError) console.error('Unable to clean up uncommitted gallery photos:', cleanupError);
        } catch (cleanupError) {
          console.error('Gallery photo cleanup request failed:', cleanupError);
        }
      }
      throw error;
    }
  },
};
