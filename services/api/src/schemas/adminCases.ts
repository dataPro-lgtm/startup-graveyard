import { z } from 'zod';

export const createDraftCaseBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .transform((s) => s.toLowerCase()),
  companyName: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(20000),
  industryKey: z.string().trim().min(1).max(100),
  countryCode: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z
      .string()
      .trim()
      .length(2)
      .transform((s) => s.toUpperCase())
      .optional(),
  ),
  businessModelKey: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().trim().max(100).optional(),
  ),
  foundedYear: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1800).max(2100).optional(),
  ),
  closedYear: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1800).max(2100).optional(),
  ),
  totalFundingUsd: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).optional(),
  ),
  primaryFailureReasonKey: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().trim().max(100).optional(),
  ),
  assignedTo: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().trim().max(320).optional(),
  ),
});

export type CreateDraftCaseBody = z.infer<typeof createDraftCaseBodySchema>;

export const createDraftCaseResponseSchema = z.object({
  caseId: z.string().uuid(),
  reviewId: z.string().uuid(),
  status: z.literal('draft'),
});
