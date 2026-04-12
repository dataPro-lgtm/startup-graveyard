import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

export const reviewStatusSchema = z.enum([
  'pending',
  'changes_requested',
  'approved',
  'rejected',
]);

export const listReviewsQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, reviewStatusSchema.optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

export const reviewIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const reviewListItemSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  slug: z.string(),
  companyName: z.string(),
  reviewStatus: reviewStatusSchema,
  assignedTo: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  publishReadiness: z.object({
    ready: z.boolean(),
    evidenceCount: z.number().int().min(0),
    failureFactorCount: z.number().int().min(0),
    missing: z.array(z.enum(['evidence_sources', 'failure_factors'])),
  }),
});

export const listReviewsResponseSchema = z.object({
  items: z.array(reviewListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const approveReviewResponseSchema = z.object({
  ok: z.literal(true),
  reviewId: z.string().uuid(),
  caseId: z.string().uuid(),
  status: z.literal('approved'),
  approvedAt: z.string(),
});

export const approveReviewBlockedResponseSchema = z.object({
  error: z.literal('publish_requirements_not_met'),
  caseId: z.string().uuid(),
  publishReadiness: reviewListItemSchema.shape.publishReadiness,
});

export const requestChangesReviewBodySchema = z.object({
  decisionNote: z.string().trim().min(1).max(4000),
});

export const requestChangesReviewResponseSchema = z.object({
  reviewId: z.string().uuid(),
  caseId: z.string().uuid(),
  status: z.literal('changes_requested'),
});

export const resubmitReviewResponseSchema = z.object({
  reviewId: z.string().uuid(),
  caseId: z.string().uuid(),
  status: z.literal('pending'),
});

export const rejectReviewBodySchema = z.object({
  decisionNote: z.string().trim().max(4000).optional(),
});

export const rejectReviewResponseSchema = z.object({
  reviewId: z.string().uuid(),
  caseId: z.string().uuid(),
  status: z.literal('rejected'),
});
