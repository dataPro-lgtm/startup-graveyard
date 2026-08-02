import { adminApiFetch } from '@/lib/adminApiServer';

export async function GET() {
  const res = await adminApiFetch('/v1/admin/stats/platform-snapshot-brief.md', {
    cache: 'no-store',
  });

  if (!res.ok) {
    return new Response('platform snapshot brief unavailable', { status: res.status });
  }

  return new Response(await res.text(), {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition':
        res.headers.get('content-disposition') ??
        'attachment; filename="platform-snapshot-brief.md"',
    },
  });
}
