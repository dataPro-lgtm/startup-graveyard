import { adminApiFetch } from '@/lib/adminApiServer';

export async function GET() {
  const res = await adminApiFetch('/v1/admin/stats/recovery-queue.csv', {
    cache: 'no-store',
  });

  if (!res.ok) {
    return new Response('recovery queue export unavailable', { status: res.status });
  }

  return new Response(await res.text(), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition':
        res.headers.get('content-disposition') ??
        'attachment; filename="team-workspace-recovery-queue.csv"',
    },
  });
}
