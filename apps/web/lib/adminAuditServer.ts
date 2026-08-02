import { z } from 'zod';
import { adminApiFetch } from './adminApiServer';

const listSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      action: z.string(),
      reviewId: z.string().uuid().nullable(),
      caseId: z.string().uuid().nullable(),
      metadata: z.record(z.string(), z.unknown()),
      actorUserId: z.string().uuid().nullable(),
      actorEmail: z.string().email().nullable(),
      actorAdminRole: z.enum(['viewer', 'editor', 'operator', 'owner']).nullable(),
      actorAuthType: z.enum(['user_session', 'service_key', 'system']).nullable(),
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
  const res = await adminApiFetch(`/v1/admin/audit?limit=${limit}`, {
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
  if (!res.ok) return { ok: false, reason: 'bad_response' };
  const json: unknown = await res.json();
  const parsed = listSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'bad_response' };
  return { ok: true, data: parsed.data };
}
