import { isLocalFileUri, isBrowserBlobUri, readMediaBody } from '../utils/mediaFile';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { imageAnonymizationService } from './imageAnonymization';

const reviewMediaBucket = 'spot-images';

type ReviewMediaAsset = {
  uri: string;
  type: string;
};

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
        if (asset.type !== 'image' || (!isLocalFileUri(asset.uri) && !isBrowserBlobUri(asset.uri))) {
          throw new Error('This review photo source cannot be privacy processed, so it was not uploaded.');
        }

        const processedUri = await imageAnonymizationService.anonymizeImage(asset.uri);
        try {
          const path = `${userId}/reviews/${spotId}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          const { error } = await supabase.storage.from(reviewMediaBucket).upload(path, await readMediaBody(processedUri, 'Unable to read the privacy-processed review photo.'), {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          });

          if (error) throw new Error(`Unable to upload review photo ${index + 1}: ${error.message}`);

          uploadedPaths.push(path);
          const { data } = supabase.storage.from(reviewMediaBucket).getPublicUrl(path);
          uploadedUrls.push(data.publicUrl);
        } finally {
          await imageAnonymizationService.cleanupProcessedImage(processedUri, asset.uri);
        }
      }

      return uploadedUrls;
    } catch (error) {
      if (uploadedPaths.length) {
        try {
          const { error: cleanupError } = await supabase.storage.from(reviewMediaBucket).remove(uploadedPaths);
          if (cleanupError) console.error('Unable to clean up uncommitted review photos:', cleanupError);
        } catch (cleanupError) {
          console.error('Review photo cleanup request failed:', cleanupError);
        }
      }
      throw error;
    }
  },
};
