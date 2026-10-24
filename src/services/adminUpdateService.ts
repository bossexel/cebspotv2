import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AdminUpdate = {
  id: string;
  message: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

type AdminUpdateRow = {
  id: string;
  message: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

const ADMIN_UPDATE_COLUMNS = 'id,message,is_published,published_at,created_at,updated_at,created_by';

function mapAdminUpdate(row: AdminUpdateRow): AdminUpdate {
  return {
    id: row.id,
    message: row.message,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function updateError(error: { message?: string } | null, fallback: string) {
  if (!error) return new Error(fallback);
  if (error.message?.includes('admin_updates')) {
    return new Error('Admin Updates is not ready in the database yet. Apply the latest Supabase migration, then retry.');
  }
  return new Error(error.message || fallback);
}

export async function getPublishedAdminUpdates(
  limit = 3,
  client: SupabaseClient = supabase,
): Promise<AdminUpdate[]> {
  const { data, error } = await client
    .from('admin_updates')
    .select(ADMIN_UPDATE_COLUMNS)
    .eq('is_published', true)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw updateError(error, 'Unable to load Admin Updates.');
  return ((data ?? []) as AdminUpdateRow[]).map(mapAdminUpdate);
}

export async function getAllAdminUpdates(client: SupabaseClient = supabase): Promise<AdminUpdate[]> {
  const { data, error } = await client
    .from('admin_updates')
    .select(ADMIN_UPDATE_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw updateError(error, 'Unable to load Admin Updates.');
  return ((data ?? []) as AdminUpdateRow[]).map(mapAdminUpdate);
}

export async function createAdminUpdate(
  input: { message: string; isPublished: boolean },
  client: SupabaseClient = supabase,
): Promise<AdminUpdate> {
  const message = input.message.trim();
  if (!message) throw new Error('Write a message before saving the update.');

  const { data, error } = await client
    .from('admin_updates')
    .insert({ message, is_published: input.isPublished })
    .select(ADMIN_UPDATE_COLUMNS)
    .single();

  if (error || !data) throw updateError(error, 'Unable to create the update.');
  return mapAdminUpdate(data as AdminUpdateRow);
}

export async function editAdminUpdate(
  id: string,
  input: { message: string; isPublished: boolean },
  client: SupabaseClient = supabase,
): Promise<AdminUpdate> {
  const message = input.message.trim();
  if (!message) throw new Error('Write a message before saving the update.');

  const { data, error } = await client
    .from('admin_updates')
    .update({ message, is_published: input.isPublished })
    .eq('id', id)
    .select(ADMIN_UPDATE_COLUMNS)
    .single();

  if (error || !data) throw updateError(error, 'Unable to edit the update.');
  return mapAdminUpdate(data as AdminUpdateRow);
}

export async function deleteAdminUpdate(id: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('admin_updates').delete().eq('id', id);
  if (error) throw updateError(error, 'Unable to delete the update.');
}

export function subscribeToPublishedAdminUpdates(
  onChange: () => void,
  client: SupabaseClient = supabase,
): () => void {
  let channel: RealtimeChannel | null = client
    .channel(`published-admin-updates-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_updates' }, onChange)
    .subscribe();

  return () => {
    if (channel) client.removeChannel(channel);
    channel = null;
  };
}
