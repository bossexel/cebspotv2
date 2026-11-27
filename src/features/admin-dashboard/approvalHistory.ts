import type { SupabaseClient } from '@supabase/supabase-js';

export type ApprovalStatus = 'all' | 'pending' | 'approved' | 'rejected';
export type ApprovalSort = 'latest-approved' | 'newest' | 'oldest';
export type ApprovalHistoryRow = {
  id: string;
  name: string;
  category: string;
  status: string;
  created_at: string;
  approved_at: string | null;
};

export const approvalPageSize = 20;

export async function getApprovalHistory(
  client: SupabaseClient,
  options: { status: ApprovalStatus; sort: ApprovalSort; offset: number; search: string },
  signal: AbortSignal,
) {
  let query = client.from('spot_submissions')
    .select('id,name,category,status,created_at,approved_at');
  const status = options.sort === 'latest-approved' ? 'approved' : options.status;
  if (status !== 'all') query = query.eq('status', status);
  const search = options.search.trim().replace(/[\\%_]/g, '\\$&');
  if (search) query = query.ilike('name', `%${search}%`);
  if (options.sort === 'latest-approved') {
    query = query.order('approved_at', { ascending: false, nullsFirst: false });
  }
  const { data, error } = await query
    .order('created_at', { ascending: options.sort === 'oldest' })
    .order('id', { ascending: true })
    .range(options.offset, options.offset + approvalPageSize)
    .abortSignal(signal);
  if (error) throw error;
  const rows = (data ?? []) as ApprovalHistoryRow[];
  return { rows: rows.slice(0, approvalPageSize), hasMore: rows.length > approvalPageSize };
}
