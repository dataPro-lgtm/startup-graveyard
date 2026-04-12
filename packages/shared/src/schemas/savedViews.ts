import { z } from 'zod';
import { BILLING_STATUSES, SUBSCRIPTION_TIERS } from '../billing.js';

const trimmedOptional = (max: number) => z.string().trim().min(1).max(max).optional();

export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);
export const billingStatusSchema = z.enum(BILLING_STATUSES);
export const savedViewSortSchema = z.enum(['relevance', 'updated_at']);

export const savedViewFiltersSchema = z.object({
  q: trimmedOptional(120),
  industry: trimmedOptional(80),
  country: trimmedOptional(32),
  closedYear: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  businessModelKey: trimmedOptional(80),
  primaryFailureReasonKey: trimmedOptional(80),
  sort: savedViewSortSchema.optional(),
});

export const savedViewNameSchema = z.string().trim().min(1).max(80);

export const savedViewSummarySchema = z.object({
  subscription: subscriptionTierSchema,
  billingStatus: billingStatusSchema,
  savedViewCount: z.number().int().nonnegative(),
  savedViewLimit: z.number().int().nonnegative(),
  remainingSlots: z.number().int().nonnegative(),
  canUseSavedViews: z.boolean(),
  canAddMore: z.boolean(),
  requiredTier: subscriptionTierSchema.nullable(),
});

export const savedViewItemSchema = z.object({
  id: z.string().uuid(),
  name: savedViewNameSchema,
  filters: savedViewFiltersSchema,
  queryString: z.string(),
  caseCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const savedViewListResponseSchema = z.object({
  summary: savedViewSummarySchema,
  items: z.array(savedViewItemSchema),
});

export const createSavedViewBodySchema = z.object({
  name: savedViewNameSchema,
  filters: savedViewFiltersSchema,
});

export const updateSavedViewBodySchema = z
  .object({
    name: savedViewNameSchema.optional(),
    filters: savedViewFiltersSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.filters !== undefined, {
    message: 'name_or_filters_required',
  });

export const savedViewIdParamsSchema = z.object({
  savedViewId: z.string().uuid(),
});

export const createSavedViewResponseSchema = z.object({
  ok: z.literal(true),
  created: z.boolean(),
  summary: savedViewSummarySchema,
  item: savedViewItemSchema,
});

export const updateSavedViewResponseSchema = z.object({
  ok: z.literal(true),
  summary: savedViewSummarySchema,
  item: savedViewItemSchema,
});

export const deleteSavedViewResponseSchema = z.object({
  ok: z.literal(true),
  summary: savedViewSummarySchema,
  savedViewId: z.string().uuid(),
});

export type SavedViewFilters = z.infer<typeof savedViewFiltersSchema>;
export type SavedViewSummary = z.infer<typeof savedViewSummarySchema>;
export type SavedViewItem = z.infer<typeof savedViewItemSchema>;
export type SavedViewListResponse = z.infer<typeof savedViewListResponseSchema>;
export type CreateSavedViewResponse = z.infer<typeof createSavedViewResponseSchema>;
export type UpdateSavedViewResponse = z.infer<typeof updateSavedViewResponseSchema>;
export type DeleteSavedViewResponse = z.infer<typeof deleteSavedViewResponseSchema>;

export function buildSavedViewQueryString(filters: SavedViewFilters): string {
  const sp = new URLSearchParams();
  if (filters.q) sp.set('q', filters.q);
  if (filters.industry) sp.set('industry', filters.industry);
  if (filters.country) sp.set('country', filters.country);
  if (filters.closedYear) sp.set('closedYear', filters.closedYear);
  if (filters.businessModelKey) sp.set('businessModelKey', filters.businessModelKey);
  if (filters.primaryFailureReasonKey) {
    sp.set('primaryFailureReasonKey', filters.primaryFailureReasonKey);
  }
  const hasQ = Boolean(filters.q?.trim());
  if (filters.sort === 'updated_at' && hasQ) sp.set('sort', 'updated_at');
  if (filters.sort === 'relevance' && !hasQ) sp.set('sort', 'relevance');
  return sp.toString();
}
