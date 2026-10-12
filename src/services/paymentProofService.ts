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
  throw new Error('Use a JPEG, PNG, or PDF payment proof.');
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
  async uploadProof(uri: string, userId: string, reservationId: string) {
    if (!hasSupabaseConfig) throw new Error('Payment proof submission requires a connected account.');
    if (!isLocalFileUri(uri) || !/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(reservationId)) {
      throw new Error('Select a local proof for your saved reservation.');
    }

    const extension = getFileExtension(uri);
    const contentType = getContentType(extension);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || !('size' in info) || info.size <= 0 || info.size > 5 * 1024 * 1024) {
      throw new Error('Payment proof must be between 1 byte and 5 MiB.');
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { data, error } = await supabase.functions.invoke(
      `private-upload?kind=reservation_proof&resourceId=${encodeURIComponent(reservationId)}`,
      { body: base64ToArrayBuffer(base64), headers: { 'Content-Type': contentType } },
    );

    if (error) {
      throw new Error('Unable to upload payment proof. Retry while your reservation hold is active.');
    }

    if (typeof data?.path !== 'string' || !data.path.startsWith(`${userId}/${reservationId}/`)) {
      throw new Error('The server did not return a reservation-bound proof.');
    }
    return data.path as string;
  },

  async getProofUrl(path: string, client: SupabaseClient = supabase) {
    if (!hasSupabaseConfig) return path;
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|pdf)$/i.test(path)) {
      throw new Error('This proof must be resubmitted to private reservation storage.');
    }

    const { data, error } = await client.storage.from(paymentProofsBucket).createSignedUrl(path, 60 * 5);
    if (error) {
      throw new Error(`Unable to open payment screenshot: ${error.message}`);
    }

    return data.signedUrl;
  },
};
