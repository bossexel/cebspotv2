import { readMediaBody } from '../utils/mediaFile';
import { compressPhoto, cleanupMedia, mediaLimits } from './mediaCompression';
import { supabase } from '../lib/supabase';

const profilePhotosBucket = 'profile-photos';
const maximumSourceBytes = 10 * 1024 * 1024;

type ProfilePhotoInput = {
  uri: string;
  width?: number | null;
  fileSize?: number | null;
};

export const profilePhotoService = {
  async upload(userId: string, input: ProfilePhotoInput) {
    if (input.fileSize && input.fileSize > maximumSourceBytes) {
      throw new Error('Choose an image smaller than 10 MB.');
    }

    const processed = await compressPhoto(input.uri, mediaLimits.avatar);

    try {
      const path = `${userId}/avatar.jpg`;
      const { error } = await supabase.storage
        .from(profilePhotosBucket)
        .upload(path, await readMediaBody(processed, 'The selected profile picture could not be opened.'), {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: true,
        });
      if (error) throw new Error('Your profile picture could not be uploaded. Please try again.');

      const { data } = supabase.storage.from(profilePhotosBucket).getPublicUrl(path);
      return `${data.publicUrl}?v=${Date.now()}`;
    } finally {
      await cleanupMedia(processed, input.uri);
    }
  },
};
