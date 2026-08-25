export const MIN_PASSWORD_LENGTH = 8;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  return message || 'Something went wrong. Please try again.';
}
