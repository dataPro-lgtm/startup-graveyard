import { z } from 'zod';

export const caseListItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  companyName: z.string(),
  industry: z.string(),
  country: z.string().nullable(),
  closedYear: z.number().nullable(),
  summary: z.string(),
  businessModelKey: z.string().nullable(),
  foundedYear: z.number().nullable(),
  totalFundingUsd: z.number().nullable(),
  primaryFailureReasonKey: z.string().nullable(),
});

export const listCasesResponseSchema = z.object({
  items: z.array(caseListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
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

export const similarCasesResponseSchema = z.object({
  items: z.array(caseListItemSchema),
});

export type CaseListItem = z.infer<typeof caseListItemSchema>;
export type CaseDetail = z.infer<typeof caseDetailSchema>;
export type ListCasesResult = z.infer<typeof listCasesResponseSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
export type FailureFactor = z.infer<typeof failureFactorSchema>;
