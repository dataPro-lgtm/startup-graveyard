'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function goToCaseAttachments(formData: FormData) {
  const id = pickStr(formData, 'caseId');
  if (!id || !UUID_RE.test(id)) {
    redirect('/admin/cases?err=invalid_case');
  }
  redirect(`/admin/cases/${id}`);
}

export async function addCaseEvidence(caseId: string, formData: FormData) {
  if (!UUID_RE.test(caseId)) {
    redirect('/admin/cases?err=invalid_case');
  }
  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect(`/admin/cases/${caseId}?err=config`);
  }

  const credibilityRaw = pickStr(formData, 'credibilityLevel');
  const credibilityLevel =
    credibilityRaw === 'low' || credibilityRaw === 'high'
      ? credibilityRaw
      : 'medium';

  const body = {
    sourceType: pickStr(formData, 'sourceType'),
    title: pickStr(formData, 'title'),
    url: pickStr(formData, 'url'),
    publisher: pickStr(formData, 'publisher'),
    publishedAt: pickStr(formData, 'publishedAt'),
    credibilityLevel,
    excerpt: pickStr(formData, 'excerpt'),
  };

  if (!body.sourceType || !body.title || !body.url) {
    redirect(`/admin/cases/${caseId}?err=evidence_fields`);
  }

  const res = await fetch(
    `${API_BASE_URL}/v1/admin/cases/${encodeURIComponent(caseId)}/evidence`,
    {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  revalidatePath(`/admin/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/');
  if (res.status === 404) {
    redirect(`/admin/cases/${caseId}?err=notfound`);
  }
  if (res.status === 400) {
    redirect(`/admin/cases/${caseId}?err=evidence_validation`);
  }
  if (!res.ok) {
    redirect(`/admin/cases/${caseId}?err=evidence_failed`);
  }
  redirect(`/admin/cases/${caseId}?ok=evidence`);
}

export async function addCaseFailureFactor(caseId: string, formData: FormData) {
  if (!UUID_RE.test(caseId)) {
    redirect('/admin/cases?err=invalid_case');
  }
  let h: HeadersInit;
  try {
    h = adminHeaders();
  } catch {
    redirect(`/admin/cases/${caseId}?err=config`);
  }

  const weightRaw = pickStr(formData, 'weight');
  const weight =
    weightRaw !== undefined ? Number(weightRaw) : 1;
  if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
    redirect(`/admin/cases/${caseId}?err=factor_validation`);
  }

  const body = {
    level1Key: pickStr(formData, 'level1Key'),
    level2Key: pickStr(formData, 'level2Key'),
    level3Key: pickStr(formData, 'level3Key'),
    weight,
    explanation: pickStr(formData, 'explanation'),
  };

  if (!body.level1Key || !body.level2Key) {
    redirect(`/admin/cases/${caseId}?err=factor_fields`);
  }

  const res = await fetch(
    `${API_BASE_URL}/v1/admin/cases/${encodeURIComponent(caseId)}/failure-factors`,
    {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  revalidatePath(`/admin/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/');
  if (res.status === 404) {
    redirect(`/admin/cases/${caseId}?err=notfound`);
  }
  if (res.status === 400) {
    redirect(`/admin/cases/${caseId}?err=factor_validation`);
  }
  if (!res.ok) {
    redirect(`/admin/cases/${caseId}?err=factor_failed`);
  }
  redirect(`/admin/cases/${caseId}?ok=factor`);
}
