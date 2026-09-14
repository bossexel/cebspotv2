import * as FileSystem from 'expo-file-system';
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

function isDeviceFile(uri: string) {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph:');
}

async function readUploadBody(uri: string) {
  if (isDeviceFile(uri)) {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return base64ToArrayBuffer(base64);
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error('Unable to read one of the selected photos.');
  return response.arrayBuffer();
}

function cleanImages(images: string[] | null | undefined) {
  return [...new Set((images ?? []).map((url) => url.trim()).filter(Boolean))];
}

function uploadExtension(asset: OwnerGalleryUpload, wasProcessed: boolean) {
  if (wasProcessed) return 'jpg';
  const mimeSubtype = asset.mimeType?.split('/')[1]?.toLowerCase();
  if (mimeSubtype === 'png' || mimeSubtype === 'webp') return mimeSubtype;
  return 'jpg';
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
          const wasProcessed = processedUri !== asset.uri;
          const extension = uploadExtension(asset, wasProcessed);
          const objectPath = `${userId}/owner-gallery/${spot.id}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
          const { error: uploadError } = await client.storage
            .from(spotImagesBucket)
            .upload(objectPath, await readUploadBody(processedUri), {
              contentType: wasProcessed ? 'image/jpeg' : asset.mimeType || 'image/jpeg',
              cacheControl: '31536000',
              upsert: false,
            });
          if (uploadError) throw new Error(`Unable to upload photo ${index + 1}: ${uploadError.message}`);

          uploadedPaths.push(objectPath);
          uploadedUrls.push(client.storage.from(spotImagesBucket).getPublicUrl(objectPath).data.publicUrl);
        } finally {
          if (processedUri !== asset.uri && processedUri.startsWith('file:')) {
            await FileSystem.deleteAsync(processedUri, { idempotent: true }).catch(() => undefined);
          }
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
        await client.storage.from(spotImagesBucket).remove(uploadedPaths).catch(() => undefined);
      }
      throw error;
    }
  },
};
