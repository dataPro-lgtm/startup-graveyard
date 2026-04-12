import { z } from 'zod';
import { API_BASE_URL } from './api';

const listSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      caseId: z.string().uuid(),
      slug: z.string(),
      companyName: z.string(),
      reviewStatus: z.string(),
      assignedTo: z.string().nullable(),
      decisionNote: z.string().nullable(),
      createdAt: z.string(),
      approvedAt: z.string().nullable(),
    }),
  ),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export type AdminReviewsList = z.infer<typeof listSchema>;

export async function fetchAdminReviews(
  search: string,
): Promise<
  | { ok: true; data: AdminReviewsList }
  | { ok: false; reason: 'no_key' | 'unauthorized' | 'bad_response' }
> {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  const url = `${API_BASE_URL}/v1/admin/reviews${search}`;
  const res = await fetch(url, {
    headers: { 'X-Admin-Key': key },
    cache: 'no-store',
  });
  if (res.status === 401) return { ok: false, reason: 'unauthorized' };
  if (!res.ok) return { ok: false, reason: 'bad_response' };
  const json: unknown = await res.json();
  const parsed = listSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'bad_response' };
  return { ok: true, data: parsed.data };
}
