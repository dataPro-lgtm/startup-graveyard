import { z } from 'zod';
import { API_BASE_URL } from './api';

const listSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sourceName: z.string(),
      sourceUrl: z.string(),
      finalUrl: z.string(),
      httpStatus: z.number().int(),
      contentType: z.string().nullable(),
      title: z.string().nullable(),
      excerpt: z.string().nullable(),
      contentSha256: z.string(),
      metadata: z.record(z.string(), z.unknown()),
      fetchedAt: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export type AdminSourceSnapshotsList = z.infer<typeof listSchema>;

export async function fetchAdminSourceSnapshots(
  search: string,
): Promise<
  | { ok: true; data: AdminSourceSnapshotsList }
  | { ok: false; reason: 'no_key' | 'unauthorized' | 'bad_response' }
> {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  const url = `${API_BASE_URL}/v1/admin/source-snapshots${search}`;
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
