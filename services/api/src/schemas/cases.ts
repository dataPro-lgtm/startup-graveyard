/**
 * Re-exports shared case schemas and adds API-specific query schemas.
 * The shared schemas are the single source of truth for response shapes.
 */
import { z } from 'zod';
import {
  normalizeFreeformTaxonomyKey,
  normalizePrimaryFailureReasonKey,
} from '@sg/shared/taxonomy';

// Re-export shared response schemas so API routes can reference them
export {
  caseListItemSchema,
  caseDetailSchema,
  listCasesResponseSchema,
  similarCasesResponseSchema,
  timelineEventSchema,
  evidenceSourceSchema,
  failureFactorSchema,
} from '@sg/shared/schemas/cases';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

export const listCasesQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  industry: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((s) => normalizeFreeformTaxonomyKey(s))
      .optional(),
  ),
  country: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .length(2)
      .transform((s) => s.toUpperCase())
      .optional(),
  ),
  closedYear: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1800).max(2100).optional(),
  ),
  businessModelKey: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((s) => normalizeFreeformTaxonomyKey(s))
      .optional(),
  ),
  primaryFailureReasonKey: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((s) => normalizePrimaryFailureReasonKey(s) ?? normalizeFreeformTaxonomyKey(s))
      .optional(),
  ),
  sort: z.preprocess(emptyToUndefined, z.enum(['relevance', 'updated_at']).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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

export type ListCasesQuery = z.infer<typeof listCasesQuerySchema>;
