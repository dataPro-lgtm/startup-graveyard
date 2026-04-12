import { z } from 'zod';

export const homeSummarySchema = z.object({
  totalCases: z.number().int().nonnegative(),
  totalFundingUsd: z.number().nonnegative(),
  failurePatterns: z.number().int().nonnegative(),
});

export type HomeSummary = z.infer<typeof homeSummarySchema>;

export const researchBucketSchema = z.object({
  key: z.string(),
  caseCount: z.number().int().nonnegative(),
  totalFundingUsd: z.number().nonnegative(),
});

export const researchTimelinePointSchema = z.object({
  year: z.number().int(),
  caseCount: z.number().int().nonnegative(),
  totalFundingUsd: z.number().nonnegative(),
});

export const researchOverviewSchema = z.object({
  summary: homeSummarySchema,
  topIndustries: z.array(researchBucketSchema),
  topCountries: z.array(researchBucketSchema),
  topFailureReasons: z.array(researchBucketSchema),
  closureTimeline: z.array(researchTimelinePointSchema),
});

export type ResearchBucket = z.infer<typeof researchBucketSchema>;
export type ResearchTimelinePoint = z.infer<typeof researchTimelinePointSchema>;
export type ResearchOverview = z.infer<typeof researchOverviewSchema>;
