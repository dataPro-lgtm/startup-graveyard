import { z } from 'zod';
import { caseListItemSchema } from './cases.js';

export const copilotVisitorIdSchema = z.string().trim().min(8).max(100);
export const copilotSessionIdSchema = z.string().uuid();
export const copilotMessageIdSchema = z.string().uuid();
export const copilotFeedbackVoteSchema = z.enum(['up', 'down']);
export const copilotMessageRoleSchema = z.enum(['user', 'assistant']);

export const copilotAnswerBodySchema = z.object({
  visitorId: copilotVisitorIdSchema,
  sessionId: copilotSessionIdSchema.optional(),
  question: z.string().trim().min(2).max(1000),
  topK: z.coerce.number().int().min(1).max(10).default(5),
  pinnedCaseIds: z.array(z.string().uuid()).max(8).optional(),
});

export const copilotCitationSchema = z.object({
  caseId: z.string(),
  slug: z.string(),
  companyName: z.string(),
  relevantText: z.string(),
  pinned: z.boolean().optional(),
});

export const copilotAnswerResponseSchema = z.object({
  sessionId: copilotSessionIdSchema,
  userMessageId: copilotMessageIdSchema,
  assistantMessageId: copilotMessageIdSchema,
  answer: z.string(),
  citations: z.array(copilotCitationSchema),
  model: z.string().optional(),
  grounded: z.boolean(),
});

export const copilotCreateSessionBodySchema = z.object({
  visitorId: copilotVisitorIdSchema,
  title: z.string().trim().min(1).max(120).optional(),
});

export const copilotSessionsQuerySchema = z.object({
  visitorId: copilotVisitorIdSchema,
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

export const copilotSessionSummarySchema = z.object({
  id: copilotSessionIdSchema,
  title: z.string(),
  messageCount: z.number().int().nonnegative(),
  pinnedCaseCount: z.number().int().nonnegative(),
  lastQuestion: z.string().nullable(),
  updatedAt: z.string(),
  createdAt: z.string(),
});

export const copilotMessageSchema = z.object({
  id: copilotMessageIdSchema,
  role: copilotMessageRoleSchema,
  content: z.string(),
  citations: z.array(copilotCitationSchema),
  grounded: z.boolean().nullable(),
  model: z.string().nullable(),
  feedbackVote: copilotFeedbackVoteSchema.nullable(),
  feedbackNote: z.string().nullable(),
  createdAt: z.string(),
});

export const copilotSessionDetailSchema = z.object({
  session: copilotSessionSummarySchema,
  pinnedCases: z.array(caseListItemSchema),
  messages: z.array(copilotMessageSchema),
});

export const copilotSessionsListResponseSchema = z.object({
  items: z.array(copilotSessionSummarySchema),
});

export const copilotPinBodySchema = z.object({
  visitorId: copilotVisitorIdSchema,
  caseId: z.string().uuid(),
});

export const copilotFeedbackBodySchema = z.object({
  visitorId: copilotVisitorIdSchema,
  vote: copilotFeedbackVoteSchema,
  note: z.string().trim().min(1).max(500).optional(),
});

export const copilotFeedbackResponseSchema = z.object({
  ok: z.literal(true),
  messageId: copilotMessageIdSchema,
  vote: copilotFeedbackVoteSchema,
  note: z.string().nullable(),
});

export type CopilotAnswerBody = z.infer<typeof copilotAnswerBodySchema>;
export type CopilotAnswerResponse = z.infer<typeof copilotAnswerResponseSchema>;
export type CopilotCitation = z.infer<typeof copilotCitationSchema>;
export type CopilotSessionSummary = z.infer<typeof copilotSessionSummarySchema>;
export type CopilotSessionDetail = z.infer<typeof copilotSessionDetailSchema>;
export type CopilotMessage = z.infer<typeof copilotMessageSchema>;
export type CopilotFeedbackVote = z.infer<typeof copilotFeedbackVoteSchema>;
export type CopilotFeedbackResponse = z.infer<typeof copilotFeedbackResponseSchema>;
