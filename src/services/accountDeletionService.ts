import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { spotSubmissionDraftService } from './spotSubmissionDraftService';

export const accountDeletionService = {
  async pending() {
    if (!hasSupabaseConfig) throw new Error('Account service unavailable.');
    const identity = await supabase.auth.getUser();
    if (identity.error || !identity.data.user) throw new Error('Sign in again.');
    const result = await supabase.from('account_deletion_requests').select('state').eq('user_id', identity.data.user.id).maybeSingle();
    if (result.error) throw new Error('Unable to check deletion status. Retry.');
    return !!result.data;
  },
  async reauthenticate(email: string, password: string) {
    if (!hasSupabaseConfig) throw new Error('Account service unavailable.');
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw new Error('Sign-in failed. Check your password or sign in again with your original method.');
  },
  async request() {
    if (!hasSupabaseConfig) throw new Error('Account service unavailable.');
    const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) {
      const response = error.context as Response | undefined;
      const body = await response?.json().catch(() => null);
      throw new Error(body?.error ?? 'Deletion could not finish. Retry to resume cleanup.');
    }
    if (!['pending', 'deleted'].includes(data?.status)) throw new Error('Unable to confirm deletion. Retry.');
    return data.status as 'pending' | 'deleted';
  },
  async clearLocalData(userId: string) {
    await spotSubmissionDraftService.clear(userId);
    await AsyncStorage.multiRemove([`cebspot_favorite_spot_ids:${userId}`, 'cebspot_favorite_spot_ids']);
  },
};
