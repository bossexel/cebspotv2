import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { profileService } from './profileService';
import { getPrototypeRoleForEmail } from '../constants/authRoles';
import { normalizeEmail } from '../utils/auth';
import { emailChangeError, emailChangeRedirectUrl, validateNewAccountEmail } from '../utils/emailChange';
import { UserFacingError } from '../utils/userError';

export type EmailChangeState = {
  userId: string;
  currentEmail: string;
  pendingEmail: string | null;
  sentAt: string | null;
  profileSynced: boolean;
};

async function readState(userId: string): Promise<EmailChangeState> {
  if (!hasSupabaseConfig || !userId) throw new UserFacingError('Please sign in to manage your email.');
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error) throw emailChangeError(error);
  if (!user || user.id !== userId || !user.email || !(user.email_confirmed_at || user.confirmed_at)) {
    throw new UserFacingError('Please sign in again before changing your email.');
  }
  const profile = await profileService.getProfile(userId);
  if (!profile || profile.id !== userId || profile.role !== 'user' || getPrototypeRoleForEmail(user.email) !== 'user') {
    throw new UserFacingError('Self-service email changes are available for regular user accounts. Managed accounts need administrator assistance.');
  }
  const currentEmail = normalizeEmail(user.email);
  const pendingEmail = user.new_email ? normalizeEmail(user.new_email) : null;
  return { userId, currentEmail, pendingEmail: pendingEmail && pendingEmail !== currentEmail ? pendingEmail : null,
    sentAt: user.email_change_sent_at ?? null, profileSynced: normalizeEmail(profile.email) === currentEmail };
}

export const emailChangeService = {
  async getState(userId: string): Promise<EmailChangeState> {
    try { return await readState(userId); }
    catch (error) { if (error instanceof UserFacingError) throw error; throw emailChangeError(error); }
  },

  async requestChange(userId: string, value: string): Promise<EmailChangeState> {
    // Validate before making any request. The verified Auth user and private
    // profile must independently identify the same ordinary customer account.
    const email = validateNewAccountEmail(value, '');
    const before = await this.getState(userId);
    validateNewAccountEmail(email, before.currentEmail);
    if (!before.profileSynced) throw new UserFacingError('Your account details are still updating. Check status again before requesting a new change.');
    try {
      const { data, error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: emailChangeRedirectUrl });
      if (error) throw emailChangeError(error);
      if (data.user?.id !== userId) throw new UserFacingError('Your session changed. Reopen Account Details before continuing.');
      // A successful request only means instructions were accepted. Read the
      // verified identity again; never copy the typed address into profiles.
      return await readState(userId);
    } catch (error) { if (error instanceof UserFacingError) throw error; throw emailChangeError(error); }
  },

  async refreshIdentity(userId: string) {
    await this.getState(userId);
    // Refresh this device's existing session instead of adopting tokens from an
    // email link, which might belong to a different account on a shared device.
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw emailChangeError(error);
    if (data.user?.id !== userId) throw new UserFacingError('Please sign in again to refresh your account details.');
    return this.getState(userId);
  },
};
