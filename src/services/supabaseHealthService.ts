import { hasSupabaseConfig, supabase } from '../lib/supabase';

export type SupabaseHealthScope = 'admin' | 'owner';

export interface SupabaseTableCheck {
  label: string;
  status: 'ok' | 'error';
  count?: number | null;
  detail: string;
}

export interface SupabaseHealthResult {
  connected: boolean;
  checkedAt: string;
  latencyMs: number;
  signedIn: boolean;
  checks: SupabaseTableCheck[];
  message: string;
}

async function countTable(label: string, table: string, filter?: { column: string; value: string }) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;
  if (error) {
    return {
      label,
      status: 'error' as const,
      count: null,
      detail: error.message,
    };
  }

  return {
    label,
    status: 'ok' as const,
    count,
    detail: count == null ? 'Reachable' : `${count} row${count === 1 ? '' : 's'} visible`,
  };
}

export async function checkSupabaseHealth(scope: SupabaseHealthScope, userId?: string): Promise<SupabaseHealthResult> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  if (!hasSupabaseConfig) {
    return {
      connected: false,
      checkedAt,
      latencyMs: 0,
      signedIn: false,
      checks: [],
      message: 'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const signedIn = Boolean(sessionData.session?.user);

  const checks: SupabaseTableCheck[] = [
    await countTable('Public spots', 'spots'),
  ];

  if (scope === 'admin') {
    checks.push(await countTable('Reservations', 'reservations'));
    checks.push(await countTable('Owner access requests', 'owner_access_requests'));
  } else {
    if (userId) {
      checks.push(await countTable('My owned spots', 'spots', { column: 'owner_id', value: userId }));
      checks.push(await countTable('My owner requests', 'owner_access_requests', { column: 'requester_id', value: userId }));
    } else {
      checks.push({
        label: 'Owner session',
        status: 'error',
        count: null,
        detail: 'Sign in before checking owner-scoped records.',
      });
    }
  }

  if (sessionError) {
    checks.unshift({
      label: 'Auth session',
      status: 'error',
      count: null,
      detail: sessionError.message,
    });
  } else {
    checks.unshift({
      label: 'Auth session',
      status: 'ok',
      count: null,
      detail: signedIn ? 'Signed in session detected' : 'No signed in session',
    });
  }

  const connected = checks.every((check) => check.status === 'ok');
  return {
    connected,
    checkedAt,
    latencyMs: Date.now() - startedAt,
    signedIn,
    checks,
    message: connected ? 'Supabase is reachable from this dashboard.' : 'One or more Supabase checks failed.',
  };
}
