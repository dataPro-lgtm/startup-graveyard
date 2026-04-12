import { z } from 'zod';

export const copilotAnswerBodySchema = z.object({
  question: z.string().trim().min(2).max(1000),
  /** 最多引用多少个案例片段（默认 5）。 */
  topK: z.coerce.number().int().min(1).max(10).default(5),
});

export const copilotCitationSchema = z.object({
  caseId: z.string().uuid(),
  slug: z.string(),
  companyName: z.string(),
  relevantText: z.string(),
});

export const copilotAnswerResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(copilotCitationSchema),
  model: z.string().optional(),
  /** 是否基于真实 LLM；false 表示降级到规则摘要模式 */
  grounded: z.boolean(),
});

export type CopilotAnswerBody = z.infer<typeof copilotAnswerBodySchema>;
export type CopilotAnswerResponse = z.infer<typeof copilotAnswerResponseSchema>;
