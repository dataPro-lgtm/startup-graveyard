import { z } from 'zod';
import {
  savedViewFiltersSchema,
  savedViewIdParamsSchema,
  savedViewNameSchema,
} from './savedViews.js';

const shareTokenSchema = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[a-z0-9]+$/);

export const reportShareItemSchema = z.object({
  id: z.string().uuid(),
  savedViewId: z.string().uuid(),
  savedViewName: savedViewNameSchema,
  filters: savedViewFiltersSchema,
  queryString: z.string(),
  caseCount: z.number().int().nonnegative(),
  shareToken: shareTokenSchema,
  sharePath: z.string(),
  shareUrl: z.string().url(),
  lastAccessedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const reportShareListResponseSchema = z.object({
  items: z.array(reportShareItemSchema),
});

export const createReportShareBodySchema = savedViewIdParamsSchema;

export const createReportShareResponseSchema = z.object({
  ok: z.literal(true),
  created: z.boolean(),
  item: reportShareItemSchema,
});

export const deleteReportShareParamsSchema = z.object({
  shareId: z.string().uuid(),
});

export const deleteReportShareResponseSchema = z.object({
  ok: z.literal(true),
  shareId: z.string().uuid(),
});

export const publicReportShareParamsSchema = z.object({
  shareToken: shareTokenSchema,
});

export const publicReportBriefCaseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  companyName: z.string(),
  industry: z.string(),
  country: z.string().nullable(),
  closedYear: z.number().int().nullable(),
  totalFundingUsd: z.number().nullable(),
  primaryFailureReasonKey: z.string().nullable(),
  summary: z.string(),
});

export const publicReportShareBriefSchema = z.object({
  title: savedViewNameSchema,
  generatedAt: z.string(),
  sourceViewUrl: z.string().url(),
  sourceViewPath: z.string(),
  filterSummary: z.array(z.string()),
  totalMatchingCases: z.number().int().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  sampleFundingUsd: z.number().nonnegative(),
  topIndustries: z.array(z.string()),
  topFailureReasons: z.array(z.string()),
  cases: z.array(publicReportBriefCaseSchema),
});

export const publicReportShareResponseSchema = z.object({
  share: z.object({
    id: z.string().uuid(),
    shareToken: shareTokenSchema,
    sharePath: z.string(),
    shareUrl: z.string().url(),
    savedViewId: z.string().uuid(),
    savedViewName: savedViewNameSchema,
    ownerDisplayName: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastAccessedAt: z.string().nullable(),
  }),
  brief: publicReportShareBriefSchema,
});

export type ReportShareItem = z.infer<typeof reportShareItemSchema>;
export type ReportShareListResponse = z.infer<typeof reportShareListResponseSchema>;
export type CreateReportShareResponse = z.infer<typeof createReportShareResponseSchema>;
export type DeleteReportShareResponse = z.infer<typeof deleteReportShareResponseSchema>;
export type PublicReportShareResponse = z.infer<typeof publicReportShareResponseSchema>;
