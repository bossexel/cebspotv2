export const privateUploadLimit = 5 * 1024 * 1024;

export class UploadError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function readPrivateUpload(request: Request, timeoutMs = 15000) {
  if (Number(request.headers.get('content-length')) > privateUploadLimit) {
    throw new UploadError('File exceeds the 5 MiB limit.', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError('A file is required.', 400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new UploadError('Upload timed out.', 408)); }, timeoutMs);
  });
  try {
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.byteLength;
      if (length > privateUploadLimit) throw new UploadError('File exceeds the 5 MiB limit.', 413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally {
    clearTimeout(timer); void reader.cancel().catch(() => {});
  }
}

export function privateUploadExtension(bytes: Uint8Array, contentType: string) {
  const starts = (signature: number[]) => bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);
  if (contentType === 'image/jpeg' && starts([255,216,255])) return 'jpg';
  if (contentType === 'image/png' && starts([137,80,78,71,13,10,26,10])) return 'png';
  if (contentType === 'application/pdf' && starts([37,80,68,70,45])) return 'pdf';
  throw new UploadError('Use a JPEG, PNG, or PDF file with matching contents.', 415);
}
