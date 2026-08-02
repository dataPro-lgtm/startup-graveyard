import { z } from 'zod';
import { adminApiFetch } from './adminApiServer';

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
  const res = await adminApiFetch(`/v1/admin/source-snapshots${search}`, {
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
  if (!res.ok) return { ok: false, reason: 'bad_response' };
  const json: unknown = await res.json();
  const parsed = listSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'bad_response' };
  return { ok: true, data: parsed.data };
}
