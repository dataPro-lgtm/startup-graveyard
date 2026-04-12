import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

export const listSourceSnapshotsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sourceName: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(200).optional()),
});

export const sourceSnapshotItemSchema = z.object({
  id: z.string().uuid(),
  sourceName: z.string(),
  sourceUrl: z.string(),
  finalUrl: z.string(),
  httpStatus: z.number().int().min(100).max(599),
  contentType: z.string().nullable(),
  title: z.string().nullable(),
  excerpt: z.string().nullable(),
  contentSha256: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  fetchedAt: z.string(),
  createdAt: z.string(),
});

export const listSourceSnapshotsResponseSchema = z.object({
  items: z.array(sourceSnapshotItemSchema),
});
