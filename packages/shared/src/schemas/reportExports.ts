import { z } from 'zod';
import { savedViewFiltersSchema, savedViewNameSchema } from './savedViews.js';

export const exportResearchReportBodySchema = z.object({
  name: savedViewNameSchema,
  filters: savedViewFiltersSchema,
});

export const exportResearchReportResponseSchema = z.object({
  ok: z.literal(true),
  filename: z.string(),
  mimeType: z.literal('text/markdown'),
  title: z.string(),
  caseCount: z.number().int().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  generatedAt: z.string(),
  content: z.string(),
});

export type ExportResearchReportBody = z.infer<typeof exportResearchReportBodySchema>;
export type ExportResearchReportResponse = z.infer<typeof exportResearchReportResponseSchema>;
