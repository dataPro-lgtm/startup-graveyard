/**
 * Copilot routes
 *
 * - POST   /v1/copilot/answer
 * - GET    /v1/copilot/sessions
 * - POST   /v1/copilot/sessions
 * - GET    /v1/copilot/sessions/:sessionId
 * - POST   /v1/copilot/sessions/:sessionId/pins
 * - DELETE /v1/copilot/sessions/:sessionId/pins/:caseId
 * - POST   /v1/copilot/messages/:messageId/feedback
 */
import type { FastifyInstance } from 'fastify';
import { generateCopilotAnswer } from '../../copilot/generateAnswer.js';
import {
  copilotAnswerBodySchema,
  copilotAnswerResponseSchema,
  copilotCreateSessionBodySchema,
  copilotFeedbackBodySchema,
  copilotFeedbackResponseSchema,
  copilotMessageSchema,
  copilotPinBodySchema,
  copilotSessionDetailSchema,
  copilotSessionIdSchema,
  copilotSessionsListResponseSchema,
  copilotSessionsQuerySchema,
  copilotVisitorIdSchema,
} from '../../schemas/copilot.js';

type SessionDetail = Awaited<ReturnType<FastifyInstance['copilotSessionsRepo']['getSession']>>;

async function toSessionResponse(app: FastifyInstance, detail: Exclude<SessionDetail, null>) {
  const pinnedCases = await app.casesRepo.getByIds(detail.pinnedCaseIds);
  return copilotSessionDetailSchema.parse({
    session: detail.session,
    pinnedCases,
    messages: detail.messages,
  });
}

function parseSessionId(value: unknown): string | null {
  const parsed = copilotSessionIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function copilotRoutes(app: FastifyInstance) {
  app.get('/sessions', async (request, reply) => {
    const parsed = copilotSessionsQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }

    const items = await app.copilotSessionsRepo.listSessions(parsed.data.visitorId, parsed.data.limit);
    return copilotSessionsListResponseSchema.parse({ items });
  });

  app.post('/sessions', async (request, reply) => {
    const parsed = copilotCreateSessionBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const detail = await app.copilotSessionsRepo.createSession(parsed.data);
    return toSessionResponse(app, detail);
  });

  app.get('/sessions/:sessionId', async (request, reply) => {
    const sessionId = parseSessionId((request.params as { sessionId?: unknown }).sessionId);
    const visitorId = copilotVisitorIdSchema.safeParse((request.query as { visitorId?: unknown }).visitorId);
    if (!sessionId || !visitorId.success) {
      return reply.code(400).send({ error: 'invalid_query' });
    }

    const detail = await app.copilotSessionsRepo.getSession(visitorId.data, sessionId);
    if (!detail) return reply.code(404).send({ error: 'session_not_found' });
    return toSessionResponse(app, detail);
  });

  app.post('/sessions/:sessionId/pins', async (request, reply) => {
    const sessionId = parseSessionId((request.params as { sessionId?: unknown }).sessionId);
    const parsed = copilotPinBodySchema.safeParse(request.body ?? {});
    if (!sessionId || !parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.success ? undefined : parsed.error.flatten() });
    }

    const pinnedCase = await app.casesRepo.getById(parsed.data.caseId);
    if (!pinnedCase) {
      return reply.code(404).send({ error: 'case_not_found' });
    }

    const detail = await app.copilotSessionsRepo.addPinnedCase(
      parsed.data.visitorId,
      sessionId,
      parsed.data.caseId,
    );
    if (!detail) return reply.code(404).send({ error: 'session_not_found' });
    return toSessionResponse(app, detail);
  });

  app.delete('/sessions/:sessionId/pins/:caseId', async (request, reply) => {
    const params = request.params as { sessionId?: unknown; caseId?: unknown };
    const sessionId = parseSessionId(params.sessionId);
    const caseId = copilotPinBodySchema.shape.caseId.safeParse(params.caseId);
    const visitorId = copilotVisitorIdSchema.safeParse((request.query as { visitorId?: unknown }).visitorId);
    if (!sessionId || !caseId.success || !visitorId.success) {
      return reply.code(400).send({ error: 'invalid_query' });
    }

    const detail = await app.copilotSessionsRepo.removePinnedCase(
      visitorId.data,
      sessionId,
      caseId.data,
    );
    if (!detail) return reply.code(404).send({ error: 'session_not_found' });
    return toSessionResponse(app, detail);
  });

  app.post('/messages/:messageId/feedback', async (request, reply) => {
    const messageId = copilotMessageSchema.shape.id.safeParse(
      (request.params as { messageId?: unknown }).messageId,
    );
    const parsed = copilotFeedbackBodySchema.safeParse(request.body ?? {});
    if (!messageId.success || !parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.success ? undefined : parsed.error.flatten() });
    }

    const saved = await app.copilotSessionsRepo.saveFeedback(
      parsed.data.visitorId,
      messageId.data,
      parsed.data.vote,
      parsed.data.note,
    );
    if (!saved) return reply.code(404).send({ error: 'message_not_found' });
    return copilotFeedbackResponseSchema.parse({
      ok: true,
      messageId: saved.messageId,
      vote: saved.vote,
      note: saved.note,
    });
  });

  app.post('/answer', async (request, reply) => {
    const parsed = copilotAnswerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const { question, topK, visitorId, sessionId, pinnedCaseIds: initialPinnedCaseIds } = parsed.data;

    const existingSession = sessionId
      ? await app.copilotSessionsRepo.getSession(visitorId, sessionId)
      : null;
    if (sessionId && !existingSession) {
      return reply.code(404).send({ error: 'session_not_found' });
    }

    const pinnedCaseIds = existingSession?.pinnedCaseIds ?? initialPinnedCaseIds ?? [];
    const generated = await generateCopilotAnswer({
      casesRepo: app.casesRepo,
      question,
      topK,
      pinnedCaseIds,
      history: existingSession?.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      onProviderError: (error) => {
        app.log.warn({ err: error }, 'LLM call failed, falling back to rule-based');
      },
    });

    const saved = await app.copilotSessionsRepo.saveAnswerTurn({
      visitorId,
      sessionId,
      question,
      answer: generated.answer,
      citations: generated.citations,
      grounded: generated.grounded,
      model: generated.model,
      initialPinnedCaseIds,
      run: generated.run,
    });
    if (!saved) return reply.code(404).send({ error: 'session_not_found' });

    return copilotAnswerResponseSchema.parse({
      sessionId: saved.session.session.id,
      userMessageId: saved.userMessageId,
      assistantMessageId: saved.assistantMessageId,
      answer: generated.answer,
      citations: generated.citations,
      model: generated.model,
      grounded: generated.grounded,
    });
  });
}
