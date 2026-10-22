import * as FileSystem from 'expo-file-system';
import { base64ToArrayBuffer } from './base64';

export function isLocalFileUri(uri: string) {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph:');
}

export function isBrowserBlobUri(uri: string) {
  return /^(blob|data):/i.test(uri);
}

export async function readLocalFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToArrayBuffer(base64);
}

/** Callers validate allowed sources before reading or privacy processing. */
export async function readMediaBody(uri: string, readErrorMessage: string): Promise<ArrayBuffer> {
  if (isLocalFileUri(uri)) return readLocalFileAsArrayBuffer(uri);

  const response = await fetch(uri);
  if (!response.ok) throw new Error(readErrorMessage);
  return response.arrayBuffer();
}
