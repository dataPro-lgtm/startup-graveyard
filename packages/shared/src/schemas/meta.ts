import { z } from 'zod';

export const homeSummarySchema = z.object({
  totalCases: z.number().int().nonnegative(),
  totalFundingUsd: z.number().nonnegative(),
  failurePatterns: z.number().int().nonnegative(),
});

export type HomeSummary = z.infer<typeof homeSummarySchema>;
