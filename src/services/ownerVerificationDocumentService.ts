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
  return 'jpg';
}

function getContentType(extension: string, mimeType?: string) {
  if (mimeType && !['application/pdf','image/jpeg','image/png'].includes(mimeType)) throw new Error('Use a JPEG, PNG, or PDF document.');
  if (mimeType) return mimeType;
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'pdf') return 'application/pdf';
  throw new Error('Use a JPEG, PNG, or PDF document.');
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
    if (!hasSupabaseConfig || !/^[0-9a-f-]{36}$/i.test(requestKey) || documents.length<1 || documents.length>3) {
      throw new Error('Select 1 to 3 documents for a saved application draft.');
    }
    const {data:auth,error:authError}=await supabase.auth.getUser();
    if(authError || !auth.user)throw new Error('Sign in before uploading verification documents.');

    const uploadedPaths: string[] = [];
      for (const document of documents) {
        const extension = getFileExtension(document);
        const contentType=getContentType(extension,document.mimeType);
        if(!/^(file|content):/i.test(document.uri))throw new Error('Select a local document.');
        const info=await FileSystem.getInfoAsync(document.uri);
        if(!info.exists || !('size' in info) || info.size<1 || info.size>5242880) throw new Error('Each document must be between 1 byte and 5 MiB.');
        const base64 = await FileSystem.readAsStringAsync(document.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const { data,error } = await supabase.functions.invoke(`private-upload?kind=owner_document&resourceId=${encodeURIComponent(requestKey)}`,{
          body:base64ToArrayBuffer(base64),headers:{'Content-Type':contentType},
        });
        if(error)throw new Error('Private document upload failed. Retry while the application draft is active.');
        if(typeof data?.path!=='string' || !data.path.startsWith(`${auth.user.id}/${requestKey}/`))throw new Error('The server did not return an owned document path.');
        uploadedPaths.push(data.path);
      }
      return uploadedPaths;
  },

  async getSignedUrl(path: string, client: SupabaseClient = supabase) {
    if (!hasSupabaseConfig) throw new Error('Private document viewing requires a connected account.');
    if (!/^[A-Za-z0-9][A-Za-z0-9/_ .-]{1,250}$/.test(path) || path.includes('..')) throw new Error('Invalid private document path.');
    const { data, error } = await client.storage.from(ownerVerificationDocumentsBucket).createSignedUrl(path, 60 * 10);
    if (error) throw new Error(`Unable to open verification document: ${error.message}`);
    return data.signedUrl;
  },
};
