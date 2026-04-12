import { z } from 'zod';
import { API_BASE_URL } from './api';

const jobItemSchema = z.object({
  id: z.string().uuid(),
  sourceName: z.string(),
  triggerType: z.string(),
  status: z.string(),
  payload: z.record(z.string(), z.unknown()),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
});

const listSchema = z.object({
  items: z.array(jobItemSchema),
});

export type AdminIngestionList = z.infer<typeof listSchema>;
export type AdminIngestionJobItem = z.infer<typeof jobItemSchema>;

export async function fetchAdminIngestionJobById(id: string): Promise<
  | { ok: true; data: AdminIngestionJobItem }
  | {
      ok: false;
      reason: 'no_key' | 'unauthorized' | 'not_found' | 'bad_response';
    }
> {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  const url = `${API_BASE_URL}/v1/admin/ingestion-jobs/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: { 'X-Admin-Key': key },
    cache: 'no-store',
  });
  if (res.status === 401) return { ok: false, reason: 'unauthorized' };
  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (!res.ok) return { ok: false, reason: 'bad_response' };
  const json: unknown = await res.json();
  const parsed = jobItemSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'bad_response' };
  return { ok: true, data: parsed.data };
}

export async function fetchAdminIngestionJobs(
  search: string,
): Promise<
  | { ok: true; data: AdminIngestionList }
  | { ok: false; reason: 'no_key' | 'unauthorized' | 'bad_response' }
> {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  const url = `${API_BASE_URL}/v1/admin/ingestion-jobs${search}`;
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
