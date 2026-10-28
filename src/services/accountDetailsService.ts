import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { profileService } from './profileService';
import { getAuthErrorMessage } from '../utils/auth';
import { UserFacingError } from '../utils/userError';
import type { UserProfile } from '../types';

export function validateAccountNames(firstName: string, lastName: string) {
  const first = firstName.trim();
  const last = lastName.trim();
  if (!first || !last) throw new UserFacingError('Enter both your first name and last name.');
  if (first.length > 100 || last.length > 100) throw new UserFacingError('Use 100 characters or fewer for each name.');
  return { first_name: first, last_name: last, display_name: `${first} ${last}` };
}

export const accountDetailsService = {
  async updateNames(userId: string, firstName: string, lastName: string): Promise<UserProfile> {
    const names = validateAccountNames(firstName, lastName);
    if (!hasSupabaseConfig) throw new UserFacingError('Account updates are not configured.');
    const current = await supabase.auth.getUser();
    if (current.error || !current.data.user || current.data.user.id !== userId) {
      throw new UserFacingError('Please sign in again before updating your account.');
    }
    // Signup stores these values in Auth metadata. Updating only profiles
    // would let a later identity sync restore the original signup names.
    const { data, error } = await supabase.auth.updateUser({ data: { ...names, full_name: names.display_name } });
    if (error) throw new UserFacingError(getAuthErrorMessage(error));
    if (data.user?.id !== userId) throw new UserFacingError('Your session changed. Reopen Account Details to check your name.');
    try {
      const profile = await profileService.getProfile(userId);
      if (profile && profile.first_name === names.first_name && profile.last_name === names.last_name
        && profile.display_name === names.display_name) return profile;
      // The existing Auth trigger normally performs this synchronization.
      // Keep older installations consistent without an insert or identity edit.
      return await profileService.updateProfile(userId, names);
    } catch {
      throw new UserFacingError('Your account name was saved, but your profile could not be refreshed. Please retry saving your name.');
    }
  },
};
