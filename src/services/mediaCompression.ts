import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image, Platform } from 'react-native';
import { UserFacingError } from '../utils/userError';

export const mediaLimits = {
  photo: { dimension: 1280, bytes: 320 * 1024, quality: 0.64 },
  privacyInput: { dimension: 1280, bytes: 512 * 1024, quality: 0.74 },
  avatar: { dimension: 512, bytes: 120 * 1024, quality: 0.64 },
  document: { dimension: 1600, bytes: 700 * 1024, quality: 0.72 },
  videoBytes: 3 * 1024 * 1024,
  videoDurationSeconds: 15,
};

export async function cleanupMedia(uri: string, originalUri: string) {
  if (uri === originalUri) return;
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
  else if (uri.startsWith('file:')) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

async function fileBytes(uri: string) {
  if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  return info.exists && typeof info.size === 'number' ? info.size : 0;
}

/** Resize before JPEG encoding; each pass starts from the source, avoiding accumulated artifacts. */
export async function compressPhoto(uri: string, policy = mediaLimits.photo): Promise<string> {
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), () => reject(
      new UserFacingError('This photo could not be opened. Please choose another photo.')
    ));
  });
  if (!(size.width > 0 && size.height > 0)) throw new UserFacingError('This photo could not be opened. Please choose another photo.');
  let output = uri;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const dimension = Math.max(Math.min(640, policy.dimension), Math.round(policy.dimension * Math.pow(0.8, attempt)));
      const resize = size.width >= size.height ? { width: Math.min(size.width, dimension) } : { height: Math.min(size.height, dimension) };
      const result = await ImageManipulator.manipulateAsync(uri, [{ resize }], {
        compress: Math.max(0.4, policy.quality - attempt * 0.08),
        format: ImageManipulator.SaveFormat.JPEG,
      });
      await cleanupMedia(output, uri);
      output = result.uri;
      const bytes = await fileBytes(output);
      if (bytes > 0 && bytes <= policy.bytes) return output;
    }
    throw new UserFacingError('This photo could not be made small enough. Please choose another photo.');
  } catch (error) {
    await cleanupMedia(output, uri);
    if (error instanceof UserFacingError) throw error;
    console.warn('Photo preparation failed', error);
    throw new UserFacingError('We could not prepare this photo. Please choose another photo.');
  }
}

export async function compressVideo(uri: string): Promise<string> {
  if (!/^(file|content):/i.test(uri)) throw new UserFacingError('Please select a video saved on your phone.');
  let compressor: typeof import('react-native-compressor');
  try {
    // Lazy loading keeps photo uploads working in Expo Go and older installed binaries.
    compressor = require('react-native-compressor');
  } catch {
    throw new UserFacingError('Please update CebSpot to upload videos. You can still post photos.');
  }
  let output = uri;
  try {
    const metadata = await compressor.getVideoMetaData(uri);
    if (!Number.isFinite(metadata.duration) || metadata.duration <= 0 || metadata.duration > mediaLimits.videoDurationSeconds) {
      throw new UserFacingError('Choose a video that is 15 seconds or shorter.');
    }
    output = await compressor.Video.compress(uri, {
      compressionMethod: 'manual', maxSize: 640, bitrate: 850_000, minimumFileSizeForCompress: 0,
    });
    if (output === uri) throw new Error('Video compression returned its source.');
    const bytes = await fileBytes(output);
    if (bytes <= 0 || bytes > mediaLimits.videoBytes) {
      throw new UserFacingError('This video is still too large. Please trim it or choose a shorter clip.');
    }
    return output;
  } catch (error) {
    await cleanupMedia(output, uri);
    if (error instanceof UserFacingError) throw error;
    console.warn('Video preparation failed', error);
    throw new UserFacingError('We could not prepare this video. Please try another clip.');
  }
}
