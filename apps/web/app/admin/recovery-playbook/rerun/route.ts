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
    target.searchParams.set('recoveryPlaybookRerunError', 'admin_key_unavailable');
    return NextResponse.redirect(target, { status: 303 });
  }

  const formData = await request.formData();
  const runId = String(formData.get('runId') ?? '').trim();
  if (!runId) {
    target.searchParams.set('recoveryPlaybookRerunError', 'run_id_unavailable');
    return NextResponse.redirect(target, { status: 303 });
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/stats/recovery-playbook/rerun-failed`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify({ runId, force: true }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    summary?: string;
    error?: string;
    requestedSteps?: string[];
  } | null;

  if (!res.ok) {
    target.searchParams.set(
      'recoveryPlaybookRerunError',
      body?.error ?? body?.summary ?? 'recovery_playbook_rerun_unavailable',
    );
    return NextResponse.redirect(target, { status: 303 });
  }

  target.searchParams.set(
    'recoveryPlaybookRerun',
    body?.requestedSteps?.length
      ? `${body.requestedSteps.join(', ')} · ${body?.summary ?? 'rerun_completed'}`
      : (body?.summary ?? 'rerun_completed'),
  );
  return NextResponse.redirect(target, { status: 303 });
}
