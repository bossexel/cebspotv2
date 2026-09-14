import * as FileSystem from 'expo-file-system';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { imageAnonymizationService } from './imageAnonymization';

const reviewMediaBucket = 'spot-images';

type ReviewMediaAsset = {
  uri: string;
  type: string;
};

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

function isLocalFileUri(uri: string) {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph:');
}

export const reviewMediaService = {
  async anonymizeAndUpload(assets: ReviewMediaAsset[], userId: string, spotId: string) {
    if (!assets.length) return [];
    if (!hasSupabaseConfig) {
      throw new Error('Supabase is not configured for review photo storage. The original photo was not uploaded.');
    }

    const uploadedPaths: string[] = [];
    const uploadedUrls: string[] = [];

    try {
      for (const [index, asset] of assets.entries()) {
        if (asset.type !== 'image' || !isLocalFileUri(asset.uri)) {
          throw new Error('Only local photos can be privacy processed before posting a review.');
        }

        const processedUri = await imageAnonymizationService.anonymizeImage(asset.uri);
        try {
          const base64 = await FileSystem.readAsStringAsync(processedUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const path = `${userId}/reviews/${spotId}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          const { error } = await supabase.storage.from(reviewMediaBucket).upload(path, base64ToArrayBuffer(base64), {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          });

          if (error) throw new Error(`Unable to upload review photo ${index + 1}: ${error.message}`);

          uploadedPaths.push(path);
          const { data } = supabase.storage.from(reviewMediaBucket).getPublicUrl(path);
          uploadedUrls.push(data.publicUrl);
        } finally {
          if (processedUri !== asset.uri && processedUri.startsWith('file:')) {
            await FileSystem.deleteAsync(processedUri, { idempotent: true }).catch(() => undefined);
          }
        }
      }

      return uploadedUrls;
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from(reviewMediaBucket).remove(uploadedPaths).catch(() => undefined);
      }
      throw error;
    }
  },
};
