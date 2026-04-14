import { z } from 'zod';
import { savedViewFiltersSchema, savedViewNameSchema } from './savedViews.js';

export const exportResearchReportBodySchema = z.object({
  name: savedViewNameSchema,
  filters: savedViewFiltersSchema,
});

const exportResearchReportBaseSchema = z.object({
  ok: z.literal(true),
  title: z.string(),
  caseCount: z.number().int().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  generatedAt: z.string(),
});

export const exportResearchReportResponseSchema = exportResearchReportBaseSchema.extend({
  filename: z.string(),
  mimeType: z.literal('text/markdown'),
  content: z.string(),
});

export const exportResearchReportPdfResponseSchema = exportResearchReportBaseSchema.extend({
  filename: z.string(),
  mimeType: z.literal('application/pdf'),
  contentBase64: z.string().min(1),
});

export type ExportResearchReportBody = z.infer<typeof exportResearchReportBodySchema>;
export type ExportResearchReportResponse = z.infer<typeof exportResearchReportResponseSchema>;
export type ExportResearchReportPdfResponse = z.infer<typeof exportResearchReportPdfResponseSchema>;
