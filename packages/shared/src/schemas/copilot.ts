import { z } from 'zod';

export const copilotAnswerBodySchema = z.object({
  question: z.string().trim().min(2).max(1000),
  topK: z.coerce.number().int().min(1).max(10).default(5),
});

export const copilotCitationSchema = z.object({
  caseId: z.string(),
  slug: z.string(),
  companyName: z.string(),
  relevantText: z.string(),
});

export const copilotAnswerResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(copilotCitationSchema),
  model: z.string().optional(),
  grounded: z.boolean(),
});

export type CopilotAnswerBody = z.infer<typeof copilotAnswerBodySchema>;
export type CopilotAnswerResponse = z.infer<typeof copilotAnswerResponseSchema>;
export type CopilotCitation = z.infer<typeof copilotCitationSchema>;
