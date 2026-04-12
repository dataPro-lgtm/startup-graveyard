import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

export const listReviewsQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(['pending', 'approved', 'rejected']).optional()),
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
  reviewStatus: z.string(),
  assignedTo: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
});

export const listReviewsResponseSchema = z.object({
  items: z.array(reviewListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const approveReviewResponseSchema = z.object({
  reviewId: z.string().uuid(),
  caseId: z.string().uuid(),
  status: z.literal('approved'),
  approvedAt: z.string(),
});

export const rejectReviewBodySchema = z.object({
  decisionNote: z.string().trim().max(4000).optional(),
});

export const rejectReviewResponseSchema = z.object({
  reviewId: z.string().uuid(),
  caseId: z.string().uuid(),
  status: z.literal('rejected'),
});
