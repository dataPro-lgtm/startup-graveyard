import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

export const listCasesQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  industry: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  country: z.preprocess(
    emptyToUndefined,
    z.string().trim().length(2).transform((s) => s.toUpperCase()).optional(),
  ),
  closedYear: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1800).max(2100).optional()),
  businessModelKey: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((s) => s.toLowerCase())
      .optional(),
  ),
  primaryFailureReasonKey: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((s) => s.toLowerCase())
      .optional(),
  ),
  sort: z.preprocess(
    emptyToUndefined,
    z.enum(['relevance', 'updated_at']).optional(),
  ),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListCasesQuery = z.infer<typeof listCasesQuerySchema>;

export const caseListItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  companyName: z.string(),
  industry: z.string(),
  country: z.string().nullable(),
  closedYear: z.number().nullable(),
  summary: z.string(),
  /** `cases.business_model_key` */
  businessModelKey: z.string().nullable(),
  /** `cases.founded_year` */
  foundedYear: z.number().int().nullable(),
  /** `cases.total_funding_usd`（JSON number；极大值可能超安全整数） */
  totalFundingUsd: z.number().nullable(),
  /** `cases.primary_failure_reason_key` */
  primaryFailureReasonKey: z.string().nullable(),
});

export const listCasesResponseSchema = z.object({
  items: z.array(caseListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const caseIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const caseSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .transform((s) => s.toLowerCase()),
});

export const similarCasesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

export const similarCasesResponseSchema = z.object({
  items: z.array(caseListItemSchema),
});

export const evidenceSourceSchema = z.object({
  id: z.string().uuid(),
  sourceType: z.string(),
  title: z.string(),
  url: z.string(),
  publisher: z.string().nullable(),
  publishedAt: z.string().nullable(),
  credibilityLevel: z.string(),
  excerpt: z.string().nullable(),
});

export const failureFactorSchema = z.object({
  id: z.string().uuid(),
  level1Key: z.string(),
  level2Key: z.string(),
  level3Key: z.string().nullable(),
  weight: z.number(),
  explanation: z.string().nullable(),
});

export const timelineEventSchema = z.object({
  id: z.string().uuid(),
  eventDate: z.string(),
  eventType: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  amountUsd: z.number().nullable(),
  sortOrder: z.number().int(),
});

export const caseDetailSchema = caseListItemSchema.extend({
  keyLessons: z.string().nullable(),
  evidenceSources: z.array(evidenceSourceSchema),
  failureFactors: z.array(failureFactorSchema),
  timelineEvents: z.array(timelineEventSchema).default([]),
});
