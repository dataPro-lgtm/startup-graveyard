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
    target.searchParams.set('recoveryEmailError', 'admin_key_unavailable');
    return NextResponse.redirect(target, { status: 303 });
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/stats/recovery-owner-email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify({ force: true }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    deliveredCount?: number;
    skipped?: string | null;
    error?: string;
    detail?: string;
  } | null;

  if (!res.ok) {
    target.searchParams.set(
      'recoveryEmailError',
      body?.error ?? body?.detail ?? 'recovery_owner_email_unavailable',
    );
    return NextResponse.redirect(target, { status: 303 });
  }

  target.searchParams.set(
    'recoveryEmail',
    body?.skipped === 'no_owner_outreach'
      ? 'no_owner_outreach'
      : body?.skipped === 'already_delivered'
        ? 'already_delivered'
        : body?.skipped === 'no_due_owner_outreach'
          ? 'no_due_owner_outreach'
          : String(body?.deliveredCount ?? 0),
  );
  return NextResponse.redirect(target, { status: 303 });
}
