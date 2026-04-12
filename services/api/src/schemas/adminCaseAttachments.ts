import { z } from 'zod';

const emptyToUndef = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

export const adminCaseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

export const addEvidenceBodySchema = z.object({
  sourceType: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(500),
  url: z.string().trim().min(1).max(2000),
  publisher: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  publishedAt: z.preprocess(
    emptyToUndef,
    z.union([
      z.undefined(),
      z
        .string()
        .trim()
        .max(40)
        .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'invalid_date' }),
    ]),
  ),
  credibilityLevel: z
    .enum(['low', 'medium', 'high'])
    .default('medium'),
  excerpt: z.preprocess(emptyToUndef, z.string().trim().max(8000).optional()),
});

export type AddEvidenceBody = z.infer<typeof addEvidenceBodySchema>;

export const addFailureFactorBodySchema = z.object({
  level1Key: z.string().trim().min(1).max(100),
  level2Key: z.string().trim().min(1).max(100),
  level3Key: z.preprocess(emptyToUndef, z.string().trim().max(100).optional()),
  weight: z.coerce.number().min(0).max(100).default(1),
  explanation: z.preprocess(emptyToUndef, z.string().trim().max(8000).optional()),
});

export type AddFailureFactorBody = z.infer<typeof addFailureFactorBodySchema>;

export const createdRowResponseSchema = z.object({
  id: z.string().uuid(),
});
