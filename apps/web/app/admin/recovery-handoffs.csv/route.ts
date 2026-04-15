import { API_BASE_URL, ADMIN_API_KEY } from '@/lib/api';

export async function POST() {
  if (!ADMIN_API_KEY) {
    return new Response('admin key unavailable', { status: 500 });
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/stats/recovery-handoffs/export`, {
    method: 'POST',
    headers: {
      'x-admin-key': ADMIN_API_KEY,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return new Response('recovery handoff export unavailable', { status: res.status });
  }

  return new Response(await res.text(), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition':
        res.headers.get('content-disposition') ??
        'attachment; filename="team-workspace-recovery-handoffs.csv"',
    },
  });
}
