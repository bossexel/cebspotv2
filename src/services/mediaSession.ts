import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { UserFacingError } from '../utils/userError';

let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session?.access_token) {
        if (error && (!error.status || error.status >= 500)) {
          throw new UserFacingError('We could not connect to your account. Check your connection and try again.');
        }
        throw new UserFacingError('Please sign in again, then try uploading again.');
      }
      return data.session.access_token;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function accessToken() {
  if (!hasSupabaseConfig) throw new UserFacingError('Photo uploads are temporarily unavailable. Please try again shortly.');
  const { data, error } = await supabase.auth.getSession();
  if (error && (!error.status || error.status >= 500)) {
    throw new UserFacingError('We could not connect to your account. Check your connection and try again.');
  }
  if (error || !data.session?.access_token) throw new UserFacingError('Sign in again to upload your photos.');
  if (data.session.expires_at && data.session.expires_at * 1000 < Date.now() + 60_000) return refreshAccessToken();
  return data.session.access_token;
}

/** A 401 is rejected before the service reads/adopts the upload, so one retry is safe. */
export async function withMediaSession<T extends { status: number }>(send: (headers: { Authorization: string }) => Promise<T>): Promise<T> {
  const token = await accessToken();
  let response = await send({ Authorization: `Bearer ${token}` });
  if (response.status === 401) {
    const current = await accessToken();
    const fresh = current !== token ? current : await refreshAccessToken();
    response = await send({ Authorization: `Bearer ${fresh}` });
  }
  return response;
}
