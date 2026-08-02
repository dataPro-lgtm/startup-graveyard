import { NextResponse } from 'next/server';
import { adminApiFetch } from '@/lib/adminApiServer';

function redirectTarget(request: Request) {
  const url = new URL(request.headers.get('referer') ?? '/admin/dashboard', request.url);
  url.pathname = '/admin/dashboard';
  return url;
}

export async function POST(request: Request) {
  const target = redirectTarget(request);
  const res = await adminApiFetch('/v1/admin/stats/recovery-playbook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    summary?: string;
    error?: string;
  } | null;

  if (!res.ok) {
    target.searchParams.set(
      'recoveryPlaybookError',
      body?.error ?? body?.summary ?? 'recovery_playbook_unavailable',
    );
    return NextResponse.redirect(target, { status: 303 });
  }

  target.searchParams.set('recoveryPlaybook', body?.summary ?? 'playbook_completed');
  return NextResponse.redirect(target, { status: 303 });
}
