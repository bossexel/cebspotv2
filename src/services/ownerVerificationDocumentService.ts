import * as FileSystem from 'expo-file-system';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

export const ownerVerificationDocumentsBucket = 'owner-verification-documents';

export type VerificationDocument = {
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

function getFileExtension(document: VerificationDocument) {
  const cleanUri = (document.name || document.uri).split('?')[0] ?? '';
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  if (match?.[1]) return match[1].toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  if (document.mimeType === 'application/pdf') return 'pdf';
  if (document.mimeType === 'image/png') return 'png';
  if (document.mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function getContentType(extension: string, mimeType?: string) {
  if (mimeType === 'application/pdf' || mimeType?.startsWith('image/')) return mimeType;
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
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

export const ownerVerificationDocumentService = {
  async upload(documents: VerificationDocument[], requestKey: string) {
    if (!hasSupabaseConfig) return documents.map((document) => document.uri);

    const uploadedPaths: string[] = [];
    try {
      for (const [index, document] of documents.entries()) {
        const extension = getFileExtension(document);
        const base64 = await FileSystem.readAsStringAsync(document.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const path = `${requestKey}/${index + 1}-${Date.now()}.${extension}`;
        const { error } = await supabase.storage.from(ownerVerificationDocumentsBucket).upload(path, base64ToArrayBuffer(base64), {
          contentType: getContentType(extension, document.mimeType),
          upsert: false,
        });
        if (error) throw new Error(`Unable to upload verification document: ${error.message}`);
        uploadedPaths.push(path);
      }
      return uploadedPaths;
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from(ownerVerificationDocumentsBucket).remove(uploadedPaths).catch(() => undefined);
      }
      throw error;
    }
  },

  async remove(paths: string[]) {
    if (!hasSupabaseConfig || !paths.length) return;
    await supabase.storage.from(ownerVerificationDocumentsBucket).remove(paths);
  },

  async getSignedUrl(path: string, client: SupabaseClient = supabase) {
    if (!hasSupabaseConfig || /^https?:\/\//i.test(path)) return path;
    const { data, error } = await client.storage.from(ownerVerificationDocumentsBucket).createSignedUrl(path, 60 * 10);
    if (error) throw new Error(`Unable to open verification document: ${error.message}`);
    return data.signedUrl;
  },
};
