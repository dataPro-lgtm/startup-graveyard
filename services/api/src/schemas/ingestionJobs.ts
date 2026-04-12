import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

export const listIngestionJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(['queued', 'running', 'succeeded', 'failed']).optional(),
  ),
});

export const enqueueIngestionJobBodySchema = z.object({
  sourceName: z.string().trim().min(1).max(200),
  triggerType: z.string().trim().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export const ingestionJobIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ingestionJobItemSchema = z.object({
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

export const listIngestionJobsResponseSchema = z.object({
  items: z.array(ingestionJobItemSchema),
});

export const enqueueIngestionJobResponseSchema = z.object({
  id: z.string().uuid(),
});

export const processNextStubResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), job: ingestionJobItemSchema }),
  z.object({ ok: z.literal(false), reason: z.literal('empty_queue') }),
]);

export const reclaimStaleQuerySchema = z.object({
  maxRunningMinutes: z.coerce.number().int().min(1).max(10080).default(30),
});

export const reclaimStaleResponseSchema = z.object({
  reclaimed: z.number().int(),
  jobIds: z.array(z.string().uuid()),
});

export type EnqueueIngestionJobBody = z.infer<typeof enqueueIngestionJobBodySchema>;
