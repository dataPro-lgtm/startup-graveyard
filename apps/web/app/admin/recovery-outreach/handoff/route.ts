import { NextResponse } from 'next/server';
import { adminApiFetch } from '@/lib/adminApiServer';

export async function POST(request: Request) {
  const form = await request.formData();
  const workspaceId = String(form.get('workspaceId') ?? '').trim();
  const channel = String(form.get('channel') ?? 'crm').trim();
  const snoozeHours = Number(form.get('snoozeHours') ?? 48);
  const note = String(form.get('note') ?? '').trim();

  const res = await adminApiFetch('/v1/admin/stats/recovery-outreach/handoff', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
