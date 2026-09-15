export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordRequirement {
  key: 'length' | 'letter' | 'number';
  label: string;
  met: boolean;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      key: 'length',
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    {
      key: 'letter',
      label: 'At least one letter',
      met: /[A-Za-z]/.test(password),
    },
    {
      key: 'number',
      label: 'At least one number',
      met: /\d/.test(password),
    },
  ];
}

export function isPasswordReady(password: string) {
  return getPasswordRequirements(password).every((requirement) => requirement.met);
}

export function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('email not confirmed') || lowerMessage.includes('verify your email')) {
    return 'Please verify your email before signing in.';
  }

  if (
    lowerMessage.includes('invalid login credentials') ||
    lowerMessage.includes('invalid credentials') ||
    lowerMessage.includes('invalid email or password')
  ) {
    return 'Invalid email or password.';
  }

  if (
    lowerMessage.includes('already registered') ||
    lowerMessage.includes('already exists') ||
    lowerMessage.includes('user already')
  ) {
    return 'An account with this email already exists.';
  }

  if (
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('network request failed') ||
    lowerMessage.includes('load failed') ||
    lowerMessage.includes('timed out')
  ) {
    return 'Unable to connect. Check your internet connection and try again.';
  }

  if (lowerMessage.includes('password') && lowerMessage.includes('at least')) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('too many requests') ||
    lowerMessage.includes('security purposes')
  ) {
    return 'Please wait a moment before requesting another email.';
  }

  if (lowerMessage.includes('same password') || lowerMessage.includes('different from the old password')) {
    return 'Choose a password that is different from your previous password.';
  }

  if (lowerMessage.includes('weak password')) {
    return 'Choose a stronger password and complete all password requirements.';
  }

  if (lowerMessage.includes('expired') || lowerMessage.includes('invalid token') || lowerMessage.includes('otp')) {
    return 'This verification code is invalid or has expired. Request a new code.';
  }

  return message || 'Something went wrong. Please try again.';
}
