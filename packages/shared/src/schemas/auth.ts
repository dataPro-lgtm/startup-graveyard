import { z } from 'zod';
import { BILLING_INTERVALS, BILLING_STATUSES, SUBSCRIPTION_TIERS } from '../billing.js';

export const registerBodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(100).optional(),
});

export const loginBodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);
export const billingStatusSchema = z.enum(BILLING_STATUSES);
export const billingIntervalSchema = z.enum(BILLING_INTERVALS);

export const userEntitlementsSchema = z.object({
  watchlistLimit: z.number().int().nonnegative(),
  savedSearchLimit: z.number().int().nonnegative(),
  monthlyCopilotQuestions: z.number().int().nullable(),
  canExportReports: z.boolean(),
  canUseSavedSearches: z.boolean(),
  canUseWatchlist: z.boolean(),
  canUseTeamWorkspace: z.boolean(),
  canUseApiAccess: z.boolean(),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  subscription: subscriptionTierSchema,
  billingStatus: billingStatusSchema,
  billingInterval: billingIntervalSchema.nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  entitlements: userEntitlementsSchema,
  role: z.enum(['user', 'admin']),
  createdAt: z.string(),
});

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(), // seconds
});

export const meResponseSchema = userSchema;

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type UserProfile = z.infer<typeof userSchema>;
export type UserEntitlements = z.infer<typeof userEntitlementsSchema>;
