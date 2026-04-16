import { NextResponse } from 'next/server';
import { API_BASE_URL, ADMIN_API_KEY } from '@/lib/api';

function redirectTarget(request: Request) {
  const url = new URL(request.headers.get('referer') ?? '/admin/dashboard', request.url);
  url.pathname = '/admin/dashboard';
  return url;
}

export async function POST(request: Request) {
  const target = redirectTarget(request);
  if (!ADMIN_API_KEY) {
    target.searchParams.set('reclaimStaleError', 'admin_key_unavailable');
    return NextResponse.redirect(target, { status: 303 });
  }

  const formData = await request.formData().catch(() => null);
  const maxRunningMinutesRaw = formData?.get('maxRunningMinutes');
  const maxRunningMinutes =
    typeof maxRunningMinutesRaw === 'string' && maxRunningMinutesRaw.trim()
      ? maxRunningMinutesRaw.trim()
      : '30';

  const res = await fetch(
    `${API_BASE_URL}/v1/admin/ingestion-jobs/reclaim-stale?maxRunningMinutes=${encodeURIComponent(maxRunningMinutes)}`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': ADMIN_API_KEY,
      },
      cache: 'no-store',
    },
  );

  const body = (await res.json().catch(() => null)) as {
    reclaimed?: number;
    error?: string;
  } | null;

  if (!res.ok) {
    target.searchParams.set(
      'reclaimStaleError',
      body?.error ?? 'reclaim_stale_ingestion_unavailable',
    );
    return NextResponse.redirect(target, { status: 303 });
  }

  target.searchParams.set('reclaimStale', String(body?.reclaimed ?? 0));
  return NextResponse.redirect(target, { status: 303 });
}
