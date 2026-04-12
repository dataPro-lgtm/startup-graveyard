import { z } from 'zod';
import { caseListItemSchema } from './cases.js';
import { BILLING_STATUSES, SUBSCRIPTION_TIERS } from '../billing.js';

export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);
export const billingStatusSchema = z.enum(BILLING_STATUSES);

export const watchlistSummarySchema = z.object({
  subscription: subscriptionTierSchema,
  billingStatus: billingStatusSchema,
  watchlistCount: z.number().int().nonnegative(),
  watchlistLimit: z.number().int().nonnegative(),
  remainingSlots: z.number().int().nonnegative(),
  canUseWatchlist: z.boolean(),
  canAddMore: z.boolean(),
  requiredTier: subscriptionTierSchema.nullable(),
});

export const watchlistItemSchema = caseListItemSchema.extend({
  addedAt: z.string(),
});

export const watchlistListResponseSchema = z.object({
  summary: watchlistSummarySchema,
  items: z.array(watchlistItemSchema),
});

export const watchlistStatusQuerySchema = z.object({
  caseId: z.string().uuid(),
});

export const watchlistStatusResponseSchema = z.object({
  summary: watchlistSummarySchema,
  caseId: z.string().uuid(),
  saved: z.boolean(),
});

export const watchlistMutationBodySchema = z.object({
  caseId: z.string().uuid(),
});

export const watchlistMutationResponseSchema = z.object({
  ok: z.literal(true),
  summary: watchlistSummarySchema,
  caseId: z.string().uuid(),
  saved: z.boolean(),
});

export type WatchlistSummary = z.infer<typeof watchlistSummarySchema>;
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export type WatchlistListResponse = z.infer<typeof watchlistListResponseSchema>;
export type WatchlistStatusResponse = z.infer<typeof watchlistStatusResponseSchema>;
export type WatchlistMutationResponse = z.infer<typeof watchlistMutationResponseSchema>;
