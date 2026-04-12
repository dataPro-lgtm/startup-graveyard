import { z } from 'zod';
import {
  normalizeFailureFactorLevel1Key,
  normalizeFailureFactorLevel2Key,
  normalizeFreeformTaxonomyKey,
  normalizePrimaryFailureReasonKey,
  normalizeTimelineEventType,
} from '@sg/shared/taxonomy';

const emptyToUndef = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : v);

export const adminCaseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

export const addEvidenceBodySchema = z.object({
  sourceType: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(500),
  url: z.string().trim().min(1).max(2000),
  publisher: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  publishedAt: z.preprocess(
    emptyToUndef,
    z.union([
      z.undefined(),
      z
        .string()
        .trim()
        .max(40)
        .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'invalid_date' }),
    ]),
  ),
  credibilityLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  excerpt: z.preprocess(emptyToUndef, z.string().trim().max(8000).optional()),
});

export type AddEvidenceBody = z.infer<typeof addEvidenceBodySchema>;

export const addFailureFactorBodySchema = z.object({
  level1Key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((s) => normalizeFailureFactorLevel1Key(s) ?? normalizeFreeformTaxonomyKey(s)),
  level2Key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((s) => normalizeFailureFactorLevel2Key(s) ?? normalizeFreeformTaxonomyKey(s)),
  level3Key: z.preprocess(
    emptyToUndef,
    z
      .string()
      .trim()
      .max(100)
      .transform((s) => normalizeFailureFactorLevel2Key(s) ?? normalizeFreeformTaxonomyKey(s))
      .optional(),
  ),
  weight: z.coerce.number().min(0).max(100).default(1),
  explanation: z.preprocess(emptyToUndef, z.string().trim().max(8000).optional()),
});

export type AddFailureFactorBody = z.infer<typeof addFailureFactorBodySchema>;

export const addTimelineEventBodySchema = z.object({
  eventDate: z
    .string()
    .trim()
    .max(40)
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'invalid_date' }),
  eventType: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((s) => normalizeTimelineEventType(s) ?? normalizeFreeformTaxonomyKey(s)),
  title: z.string().trim().min(1).max(500),
  description: z.preprocess(emptyToUndef, z.string().trim().max(8000).optional()),
  amountUsd: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(0).max(9_000_000_000_000).optional(),
  ),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type AddTimelineEventBody = z.infer<typeof addTimelineEventBodySchema>;

export const updateCaseAnalysisBodySchema = z
  .object({
    primaryFailureReasonKey: z.preprocess(
      emptyToUndef,
      z
        .string()
        .trim()
        .max(100)
        .transform((s) => normalizePrimaryFailureReasonKey(s) ?? normalizeFreeformTaxonomyKey(s))
        .optional(),
    ),
    keyLessons: z.preprocess(emptyToUndef, z.string().trim().max(12_000).optional()),
  })
  .refine(
    (value) => value.primaryFailureReasonKey !== undefined || value.keyLessons !== undefined,
    {
      message: 'at_least_one_field_required',
    },
  );

export type UpdateCaseAnalysisBody = z.infer<typeof updateCaseAnalysisBodySchema>;

export const createdRowResponseSchema = z.object({
  id: z.string().uuid(),
});
