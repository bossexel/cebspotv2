import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

const profilePhotosBucket = 'profile-photos';
const maximumSourceBytes = 10 * 1024 * 1024;
const maximumAvatarWidth = 720;

type ProfilePhotoInput = {
  uri: string;
  width?: number | null;
  fileSize?: number | null;
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

export const profilePhotoService = {
  async upload(userId: string, input: ProfilePhotoInput) {
    if (input.fileSize && input.fileSize > maximumSourceBytes) {
      throw new Error('Choose an image smaller than 10 MB.');
    }

    const actions: ImageManipulator.Action[] =
      input.width && input.width > maximumAvatarWidth
        ? [{ resize: { width: maximumAvatarWidth } }]
        : [];
    const processed = await ImageManipulator.manipulateAsync(input.uri, actions, {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });

    try {
      if (!processed.base64) throw new Error('The selected profile picture could not be processed.');

      const path = `${userId}/avatar.jpg`;
      const { error } = await supabase.storage
        .from(profilePhotosBucket)
        .upload(path, base64ToArrayBuffer(processed.base64), {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: true,
        });
      if (error) throw new Error(`Unable to upload profile picture: ${error.message}`);

      const { data } = supabase.storage.from(profilePhotosBucket).getPublicUrl(path);
      return `${data.publicUrl}?v=${Date.now()}`;
    } finally {
      if (processed.uri !== input.uri && processed.uri.startsWith('file:')) {
        await FileSystem.deleteAsync(processed.uri, { idempotent: true }).catch(() => undefined);
      }
    }
  },
};
