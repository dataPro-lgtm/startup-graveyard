import { z } from 'zod';
import { API_BASE_URL } from './api';

const listSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      action: z.string(),
      reviewId: z.string().uuid().nullable(),
      caseId: z.string().uuid().nullable(),
      metadata: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
    }),
  ),
});

export type AdminAuditList = z.infer<typeof listSchema>;

export async function fetchAdminAudit(
  limit: number,
): Promise<
  | { ok: true; data: AdminAuditList }
  | { ok: false; reason: 'no_key' | 'unauthorized' | 'bad_response' }
> {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  const url = `${API_BASE_URL}/v1/admin/audit?limit=${limit}`;
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
