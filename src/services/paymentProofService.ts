import * as FileSystem from 'expo-file-system';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

const paymentProofsBucket = 'payment-proofs';

function isLocalFileUri(uri: string) {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph:');
}

function getFileExtension(uri: string) {
  const cleanUri = uri.split('?')[0] ?? '';
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  return (match?.[1] || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
}

function getContentType(extension: string) {
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'pdf') return 'application/pdf';
  return `image/${extension}`;
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

export const paymentProofService = {
  async uploadProof(uri: string, userId: string) {
    if (!hasSupabaseConfig || !isLocalFileUri(uri)) return uri;

    const extension = getFileExtension(uri);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const path = `${userId}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from(paymentProofsBucket).upload(path, base64ToArrayBuffer(base64), {
      contentType: getContentType(extension),
      upsert: false,
    });

    if (error) {
      throw new Error(`Unable to upload payment screenshot: ${error.message}`);
    }

    return path;
  },

  async getProofUrl(path: string, client: SupabaseClient = supabase) {
    if (!hasSupabaseConfig || /^https?:\/\//i.test(path) || isLocalFileUri(path)) return path;

    const { data, error } = await client.storage.from(paymentProofsBucket).createSignedUrl(path, 60 * 5);
    if (error) {
      throw new Error(`Unable to open payment screenshot: ${error.message}`);
    }

    return data.signedUrl;
  },
};
