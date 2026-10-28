import { getPrototypeRoleForEmail } from '../constants/authRoles';
import { isValidEmail, normalizeEmail } from './auth';
import { UserFacingError } from './userError';

export const emailChangeRedirectUrl = 'cebspot://auth/email-change';

export function isEmailChangeCallback(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'cebspot:' && parsed.hostname === 'auth'
      && parsed.pathname.replace(/\/$/, '') === '/email-change';
  } catch { return false; }
}

export function validateNewAccountEmail(value: string, currentEmail: string) {
  const email = normalizeEmail(value);
  if (!isValidEmail(email) || email.length > 254) throw new UserFacingError('Enter a valid new email address.');
  if (email === normalizeEmail(currentEmail)) throw new UserFacingError('You already use this email address.');
  if (getPrototypeRoleForEmail(email) !== 'user') throw new UserFacingError('This address is reserved for a CebSpot managed account. Choose another email.');
  return email;
}

export function emailChangeError(error: unknown) {
  const code = String((error as { code?: string })?.code ?? '');
  const message = String((error as { message?: string })?.message ?? '');
  if (code === 'email_address_not_authorized') {
    return new UserFacingError('Email delivery is not available for this address yet. Please contact CebSpot support.');
  }
  if (/email_exists|user_already_exists/.test(code)
    || /already.*(registered|exists|used)|email.*in use/i.test(message)) {
    return new UserFacingError('This email address cannot be used. Choose another address or sign in to its existing account.');
  }
  if (/rate|over_email_send_rate_limit|too_many_requests/.test(code) || /rate limit|too many|security purposes/i.test(message)) {
    return new UserFacingError('Please wait before requesting more confirmation emails, then check the pending status.');
  }
  if (/session|jwt|not_authenticated/.test(code)) return new UserFacingError('Please sign in again before changing your email.');
  if (/network|fetch|offline|timed? ?out/i.test(message)) {
    return new UserFacingError('We could not confirm the request. Check your connection, then use Check status before sending again.');
  }
  return new UserFacingError('Your email change could not be confirmed. Use Check status, then try again if needed.');
}
