import { z } from 'zod';
import { API_BASE_URL } from './api';

const caseItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  companyName: z.string(),
  industry: z.string(),
  country: z.string().nullable(),
  closedYear: z.number().nullable(),
  summary: z.string(),
  businessModelKey: z.string().nullable(),
  foundedYear: z.number().nullable(),
  totalFundingUsd: z.number().nullable(),
  primaryFailureReasonKey: z.string().nullable(),
});

const evidenceSourceSchema = z.object({
  id: z.string().uuid(),
  sourceType: z.string(),
  title: z.string(),
  url: z.string(),
  publisher: z.string().nullable(),
  publishedAt: z.string().nullable(),
  credibilityLevel: z.string(),
  excerpt: z.string().nullable(),
});

const failureFactorSchema = z.object({
  id: z.string().uuid(),
  level1Key: z.string(),
  level2Key: z.string(),
  level3Key: z.string().nullable(),
  weight: z.number(),
  explanation: z.string().nullable(),
});

const timelineEventSchema = z.object({
  id: z.string().uuid(),
  eventDate: z.string(),
  eventType: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  amountUsd: z.number().nullable(),
  sortOrder: z.number().int(),
});

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

const caseDetailSchema = caseItemSchema.extend({
  keyLessons: z.string().nullable(),
  evidenceSources: z.array(evidenceSourceSchema),
  failureFactors: z.array(failureFactorSchema),
  timelineEvents: z.array(timelineEventSchema).default([]),
});

const listResponseSchema = z.object({
  items: z.array(caseItemSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export type CaseListItem = z.infer<typeof caseItemSchema>;
export type CaseDetail = z.infer<typeof caseDetailSchema>;
export type ListCasesResult = z.infer<typeof listResponseSchema>;

export function caseListHref(item: Pick<CaseListItem, 'id' | 'slug'>): string {
  const s = item.slug.trim();
  if (s.length > 0) return `/cases/s/${encodeURIComponent(s)}`;
  return `/cases/${item.id}`;
}

export type CasesSearchParams = {
  q?: string;
  industry?: string;
  country?: string;
  closedYear?: string;
  businessModelKey?: string;
  primaryFailureReasonKey?: string;
  sort?: string;
  page?: string;
  limit?: string;
};

/** Build query string for shareable URLs (omits defaults page=1, limit=20). */
export function buildCasesQueryString(p: CasesSearchParams): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set('q', p.q);
  if (p.industry) sp.set('industry', p.industry);
  if (p.country) sp.set('country', p.country);
  if (p.closedYear) sp.set('closedYear', p.closedYear);
  if (p.businessModelKey) sp.set('businessModelKey', p.businessModelKey);
  if (p.primaryFailureReasonKey) {
    sp.set('primaryFailureReasonKey', p.primaryFailureReasonKey);
  }
  const hasQ = Boolean(p.q?.trim());
  if (p.sort === 'updated_at' && hasQ) sp.set('sort', 'updated_at');
  if (p.sort === 'relevance' && !hasQ) sp.set('sort', 'relevance');
  const page = p.page ?? '1';
  const limit = p.limit ?? '20';
  if (page !== '1') sp.set('page', page);
  if (limit !== '20') sp.set('limit', limit);
  return sp.toString();
}

export function casesListPath(p: CasesSearchParams): string {
  const qs = buildCasesQueryString(p);
  return qs ? `/?${qs}` : '/';
}

export async function fetchCasesList(
  params: CasesSearchParams,
): Promise<ListCasesResult | null> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.industry) sp.set('industry', params.industry);
  if (params.country) sp.set('country', params.country);
  if (params.closedYear) sp.set('closedYear', params.closedYear);
  if (params.businessModelKey) {
    sp.set('businessModelKey', params.businessModelKey);
  }
  if (params.primaryFailureReasonKey) {
    sp.set('primaryFailureReasonKey', params.primaryFailureReasonKey);
  }
  if (params.sort) sp.set('sort', params.sort);
  sp.set('page', params.page ?? '1');
  sp.set('limit', params.limit ?? '20');
  const url = `${API_BASE_URL}/v1/cases?${sp.toString()}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = listResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function fetchCaseById(id: string): Promise<CaseDetail | null> {
  const url = `${API_BASE_URL}/v1/cases/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = caseDetailSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function fetchCaseBySlug(slug: string): Promise<CaseDetail | null> {
  const path = encodeURIComponent(slug.trim().toLowerCase());
  const url = `${API_BASE_URL}/v1/cases/by-slug/${path}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = caseDetailSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const similarResponseSchema = z.object({
  items: z.array(caseItemSchema),
});

export async function fetchSimilarCases(
  id: string,
  limit = 6,
): Promise<CaseListItem[]> {
  const url = `${API_BASE_URL}/v1/cases/${encodeURIComponent(id)}/similar?limit=${limit}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    const parsed = similarResponseSchema.safeParse(json);
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}
