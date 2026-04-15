import { NextResponse } from 'next/server';
import { API_BASE_URL, ADMIN_API_KEY } from '@/lib/api';

export async function POST(request: Request) {
  if (!ADMIN_API_KEY) {
    return new Response('admin key unavailable', { status: 500 });
  }

  const form = await request.formData();
  const workspaceId = String(form.get('workspaceId') ?? '').trim();
  const channel = String(form.get('channel') ?? 'crm').trim();
  const snoozeHours = Number(form.get('snoozeHours') ?? 48);
  const note = String(form.get('note') ?? '').trim();

  const res = await fetch(`${API_BASE_URL}/v1/admin/stats/recovery-outreach/handoff`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify({
      workspaceId,
      channel,
      snoozeHours,
      note: note || undefined,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    return new Response('recovery outreach handoff unavailable', { status: res.status });
  }

  return NextResponse.redirect(new URL('/admin/dashboard', request.url));
}
