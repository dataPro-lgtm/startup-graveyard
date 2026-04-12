'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';

function adminHeaders(): HeadersInit {
  const k = process.env.ADMIN_API_KEY;
  if (!k) throw new Error('ADMIN_API_KEY missing');
  return { 'X-Admin-Key': k };
}

function pickStr(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

export async function createDraftCase(formData: FormData) {
  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect('/admin/reviews?err=config');
  }

  const totalFundingRaw = pickStr(formData, 'totalFundingUsd');
  let totalFundingUsd: number | undefined;
  if (totalFundingRaw !== undefined) {
    const n = Number(totalFundingRaw);
    if (!Number.isFinite(n) || n < 0) {
      redirect('/admin/reviews?err=draft_validation');
    }
    totalFundingUsd = Math.trunc(n);
  }

  const foundedYearRaw = pickStr(formData, 'foundedYear');
  const closedYearRaw = pickStr(formData, 'closedYear');
  const payload = {
    slug: pickStr(formData, 'slug'),
    companyName: pickStr(formData, 'companyName'),
    summary: pickStr(formData, 'summary'),
    industryKey: pickStr(formData, 'industryKey'),
    countryCode: pickStr(formData, 'countryCode'),
    assignedTo: pickStr(formData, 'assignedTo'),
    businessModelKey: pickStr(formData, 'businessModelKey'),
    primaryFailureReasonKey: pickStr(formData, 'primaryFailureReasonKey'),
    foundedYear: foundedYearRaw !== undefined ? Number(foundedYearRaw) : undefined,
    closedYear: closedYearRaw !== undefined ? Number(closedYearRaw) : undefined,
    totalFundingUsd,
  };

  if (
    payload.foundedYear !== undefined &&
    (!Number.isInteger(payload.foundedYear) ||
      payload.foundedYear < 1800 ||
      payload.foundedYear > 2100)
  ) {
    redirect('/admin/reviews?err=draft_validation');
  }
  if (
    payload.closedYear !== undefined &&
    (!Number.isInteger(payload.closedYear) ||
      payload.closedYear < 1800 ||
      payload.closedYear > 2100)
  ) {
    redirect('/admin/reviews?err=draft_validation');
  }

  if (!payload.slug || !payload.companyName || !payload.summary || !payload.industryKey) {
    redirect('/admin/reviews?err=draft_fields');
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/cases`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  revalidatePath('/admin/reviews');
  if (res.status === 409) redirect('/admin/reviews?err=duplicate_slug');
  if (res.status === 400) redirect('/admin/reviews?err=draft_validation');
  if (!res.ok) redirect('/admin/reviews?err=draft_failed');
  redirect('/admin/reviews?ok=draft');
}

export async function approveReview(formData: FormData) {
  const id = formData.get('reviewId');
  if (typeof id !== 'string') redirect('/admin/reviews?err=invalid');

  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect('/admin/reviews?err=config');
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/reviews/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: h,
  });
  revalidatePath('/admin/reviews');
  if (res.status === 404) redirect('/admin/reviews?err=notfound');
  if (res.status === 409) redirect('/admin/reviews?err=approve_gate');
  if (!res.ok) redirect('/admin/reviews?err=approve');
  redirect('/admin/reviews?ok=approve');
}

export async function requestChangesReview(formData: FormData) {
  const id = formData.get('reviewId');
  if (typeof id !== 'string') redirect('/admin/reviews?err=invalid');
  const noteRaw = formData.get('decisionNote');
  const decisionNote = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  if (!decisionNote) redirect('/admin/reviews?err=changes_note');

  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect('/admin/reviews?err=config');
  }

  const res = await fetch(
    `${API_BASE_URL}/v1/admin/reviews/${encodeURIComponent(id)}/request-changes`,
    {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionNote }),
    },
  );
  revalidatePath('/admin/reviews');
  if (res.status === 404) redirect('/admin/reviews?err=notfound');
  if (res.status === 400) redirect('/admin/reviews?err=changes_note');
  if (!res.ok) redirect('/admin/reviews?err=request_changes');
  redirect('/admin/reviews?ok=changes_requested');
}

export async function resubmitReview(formData: FormData) {
  const id = formData.get('reviewId');
  if (typeof id !== 'string') redirect('/admin/reviews?err=invalid');

  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect('/admin/reviews?err=config');
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/reviews/${encodeURIComponent(id)}/resubmit`, {
    method: 'POST',
    headers: h,
  });
  revalidatePath('/admin/reviews');
  if (res.status === 404) redirect('/admin/reviews?err=notfound');
  if (!res.ok) redirect('/admin/reviews?err=resubmit');
  redirect('/admin/reviews?ok=resubmitted');
}

export async function rejectReview(formData: FormData) {
  const id = formData.get('reviewId');
  if (typeof id !== 'string') redirect('/admin/reviews?err=invalid');
  const noteRaw = formData.get('decisionNote');
  const decisionNote = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : undefined;

  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect('/admin/reviews?err=config');
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/reviews/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify(decisionNote ? { decisionNote } : {}),
  });
  revalidatePath('/admin/reviews');
  if (res.status === 404) redirect('/admin/reviews?err=notfound');
  if (!res.ok) redirect('/admin/reviews?err=reject');
  redirect('/admin/reviews?ok=reject');
}

export async function enqueueIngestionJob(formData: FormData) {
  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect('/admin/reviews?err=config');
  }

  const sourceName = pickStr(formData, 'sourceName');
  const triggerType = pickStr(formData, 'triggerType');
  const payloadRaw = pickStr(formData, 'payloadJson');

  if (!sourceName || !triggerType) {
    redirect('/admin/reviews?err=ingest_fields');
  }

  let payload: Record<string, unknown> = {};
  if (payloadRaw) {
    try {
      const p: unknown = JSON.parse(payloadRaw);
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        payload = p as Record<string, unknown>;
      } else {
        redirect('/admin/reviews?err=ingest_payload');
      }
    } catch {
      redirect('/admin/reviews?err=ingest_payload');
    }
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/ingestion-jobs`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceName, triggerType, payload }),
  });
  revalidatePath('/admin/reviews');
  if (res.status === 400) redirect('/admin/reviews?err=ingest_validation');
  if (!res.ok) redirect('/admin/reviews?err=ingest_failed');
  redirect('/admin/reviews?ok=ingest');
}

export async function processNextIngestionJob() {
  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect('/admin/reviews?err=config');
  }

  const res = await fetch(`${API_BASE_URL}/v1/admin/ingestion-jobs/process-next`, {
    method: 'POST',
    headers: h,
  });
  revalidatePath('/admin/reviews');
  if (!res.ok) redirect('/admin/reviews?err=process_next_failed');
  const json: unknown = await res.json();
  if (json && typeof json === 'object' && 'ok' in json && (json as { ok: unknown }).ok === false) {
    redirect('/admin/reviews?ok=ingest_empty');
  }
  redirect('/admin/reviews?ok=ingest_processed');
}

export async function reclaimStaleIngestionJobs(formData: FormData) {
  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect('/admin/reviews?err=config');
  }

  const minsRaw = formData.get('maxRunningMinutes');
  const mins = typeof minsRaw === 'string' && minsRaw.trim() ? minsRaw.trim() : '30';
  const res = await fetch(
    `${API_BASE_URL}/v1/admin/ingestion-jobs/reclaim-stale?maxRunningMinutes=${encodeURIComponent(mins)}`,
    { method: 'POST', headers: h },
  );
  revalidatePath('/admin/reviews');
  if (!res.ok) redirect('/admin/reviews?err=reclaim_failed');
  const json: unknown = await res.json();
  const n =
    json &&
    typeof json === 'object' &&
    'reclaimed' in json &&
    typeof (json as { reclaimed: unknown }).reclaimed === 'number'
      ? String((json as { reclaimed: number }).reclaimed)
      : '0';
  redirect(`/admin/reviews?ok=reclaim&n=${encodeURIComponent(n)}`);
}

export async function requeueIngestionJob(formData: FormData) {
  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect('/admin/reviews?err=config');
  }
  const id = formData.get('jobId');
  if (typeof id !== 'string') redirect('/admin/reviews?err=invalid');
  const stayDetail = pickStr(formData, 'stayOnDetail') === '1';
  const res = await fetch(
    `${API_BASE_URL}/v1/admin/ingestion-jobs/${encodeURIComponent(id)}/requeue`,
    { method: 'POST', headers: h },
  );
  revalidatePath('/admin/reviews');
  revalidatePath(`/admin/ingestion-jobs/${id}`);
  if (res.status === 404) {
    redirect(
      stayDetail
        ? `/admin/ingestion-jobs/${encodeURIComponent(id)}?err=requeue_notfound`
        : '/admin/reviews?err=requeue_notfound',
    );
  }
  if (!res.ok) {
    redirect(
      stayDetail
        ? `/admin/ingestion-jobs/${encodeURIComponent(id)}?err=requeue_failed`
        : '/admin/reviews?err=requeue_failed',
    );
  }
  if (stayDetail) {
    redirect(`/admin/ingestion-jobs/${encodeURIComponent(id)}?ok=requeued`);
  }
  redirect('/admin/reviews?ok=requeued');
}
