import { NextResponse } from 'next/server';
import { adminApiFetch } from '@/lib/adminApiServer';

function redirectTarget(request: Request) {
  const url = new URL(request.headers.get('referer') ?? '/admin/dashboard', request.url);
  url.pathname = '/admin/dashboard';
  return url;
}

export async function POST(request: Request) {
  const target = redirectTarget(request);
  const res = await adminApiFetch('/v1/admin/stats/recovery-handoffs/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
      'recoveryWebhookError',
      body?.error ?? body?.detail ?? 'recovery_handoff_webhook_unavailable',
    );
    return NextResponse.redirect(target, { status: 303 });
  }

  target.searchParams.set(
    'recoveryWebhook',
    body?.skipped === 'no_handoffs'
      ? 'no_handoffs'
      : body?.skipped === 'no_retryable_handoffs'
        ? 'no_retryable_handoffs'
        : body?.skipped === 'no_due_handoffs'
          ? 'no_due_handoffs'
          : String(body?.deliveredCount ?? 0),
  );
  return NextResponse.redirect(target, { status: 303 });
}
