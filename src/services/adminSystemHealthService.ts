import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminServiceHealthStatus = 'online' | 'degraded' | 'offline' | 'not_configured';

export type AdminServiceHealthCheck = {
  id: 'database' | 'auth' | 'functions' | 'privacy';
  label: string;
  detail: string;
  status: AdminServiceHealthStatus;
  latencyMs: number | null;
};

export type AdminSystemHealthResult = {
  checkedAt: string;
  online: boolean;
  checks: AdminServiceHealthCheck[];
};

async function timedCheck(
  id: AdminServiceHealthCheck['id'],
  label: string,
  task: () => Promise<{ status?: AdminServiceHealthStatus; detail: string }>,
): Promise<AdminServiceHealthCheck> {
  const startedAt = Date.now();
  try {
    const result = await task();
    return { id, label, status: result.status ?? 'online', detail: result.detail, latencyMs: Date.now() - startedAt };
  } catch (error: any) {
    return {
      id,
      label,
      status: 'offline',
      detail: error?.message ?? 'The service did not respond.',
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function fetchJson(url: string, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkAdminSystemHealth(client: SupabaseClient): Promise<AdminSystemHealthResult> {
  const faceApiUrl = process.env.EXPO_PUBLIC_FACE_BLUR_API_URL?.trim().replace(/\/+$/, '') ?? '';
  const checks = await Promise.all([
    timedCheck('database', 'Database API', async () => {
      const { error, count } = await client.from('spots').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return { detail: `PostgREST is responding · ${count ?? 0} spots visible` };
    }),
    timedCheck('auth', 'Authentication API', async () => {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) throw new Error(error?.message ?? 'No verified admin session.');
      return { detail: `Verified admin session · ${data.user.email ?? data.user.id}` };
    }),
    timedCheck('functions', 'Backend Functions API', async () => {
      const { data, error } = await client.functions.invoke('payment-capabilities', { method: 'GET' });
      if (error) {
        const status = (error.context as Response | undefined)?.status;
        if (status === 503) return { status: 'degraded' as const, detail: 'Functions API is online; payment configuration needs attention.' };
        throw new Error(error.message);
      }
      return { detail: data?.checkoutEnabled ? 'Functions API online · checkout enabled' : 'Functions API online · checkout disabled' };
    }),
    faceApiUrl
      ? timedCheck('privacy', 'Face privacy API', async () => {
          const { response, body } = await fetchJson(`${faceApiUrl}/health`);
          if (!response.ok || body?.status !== 'ok' || body?.service !== 'cebspot-face-anonymizer') {
            throw new Error(`Unexpected health response (HTTP ${response.status}).`);
          }
          return { detail: 'Face anonymization backend is ready.' };
        })
      : Promise.resolve<AdminServiceHealthCheck>({
          id: 'privacy',
          label: 'Face privacy API',
          status: 'not_configured',
          detail: 'EXPO_PUBLIC_FACE_BLUR_API_URL is not configured.',
          latencyMs: null,
        }),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    online: checks.every((check) => check.status === 'online' || check.status === 'not_configured'),
    checks,
  };
}
