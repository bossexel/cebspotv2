/** Only known, actionable messages cross the UI boundary. Never show server text. */
export class UserFacingError extends Error {}

export function userErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof UserFacingError) return error.message;
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? '');
  if (/session.*expired|sign in|invalid.*token|HTTP 401/i.test(message)) {
    return 'Please sign in again, then retry. Your saved draft is still available.';
  }
  if (/network|fetch failed|failed to fetch|offline|timed? ?out|abort/i.test(message)) {
    return 'We could not connect. Check your internet connection and try again.';
  }
  if (/429|rate limit|photo limit|queue is full/i.test(message)) {
    return 'Photo limit reached. Please wait a moment, then try again.';
  }
  if (/privacy|anonym|face|processing/i.test(message)) {
    return 'We could not prepare your photo safely. Please try again shortly. Your original photo was not uploaded.';
  }
  return fallback;
}
