import { NextResponse } from 'next/server';
import { adminApiFetch } from '@/lib/adminApiServer';

function redirectTarget(request: Request) {
  const url = new URL(request.headers.get('referer') ?? '/admin/dashboard', request.url);
  url.pathname = '/admin/dashboard';
  return url;
}

export async function POST(request: Request) {
  const target = redirectTarget(request);
  const res = await adminApiFetch('/v1/admin/stats/platform-snapshot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => null)) as {
    snapshot?: { createdAt?: string };
    error?: string;
  } | null;

  if (!res.ok) {
    target.searchParams.set(
      'platformSnapshotError',
      body?.error ?? 'platform_snapshot_unavailable',
    );
    return NextResponse.redirect(target, { status: 303 });
  }

  target.searchParams.set(
    'platformSnapshot',
    body?.snapshot?.createdAt ?? 'platform_snapshot_captured',
  );
  return NextResponse.redirect(target, { status: 303 });
}
