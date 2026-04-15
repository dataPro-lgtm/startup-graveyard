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
    target.searchParams.set('recoveryPlaybookError', 'admin_key_unavailable');
    return NextResponse.redirect(target, { status: 303 });
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/stats/recovery-playbook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
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
