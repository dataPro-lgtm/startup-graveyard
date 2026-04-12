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
import { embedSearchQuery } from '../../ai/openaiEmbed.js';
import { getProvider } from '../../ai/llm.js';
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

type CaseDetail = Awaited<ReturnType<FastifyInstance['casesRepo']['getById']>>;
type NonNullCaseDetail = NonNullable<CaseDetail>;
type SessionDetail = Awaited<ReturnType<FastifyInstance['copilotSessionsRepo']['getSession']>>;

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function buildContextSnippet(c: NonNullCaseDetail, pinned = false): string {
  const parts: string[] = [
    `${pinned ? '[Pinned] ' : ''}公司：${c.companyName}（${c.industry}，${c.closedYear ?? '年份不详'}年倒闭）`,
    `摘要：${clip(c.summary, 400)}`,
  ];
  if (c.primaryFailureReasonKey) {
    parts.push(`主要失败原因：${c.primaryFailureReasonKey}`);
  }
  const factors = c.failureFactors.slice(0, 3);
  if (factors.length > 0) {
    parts.push(
      '失败因子：' +
        factors
          .map(
            (f) =>
              `${f.level1Key}→${f.level2Key}${f.explanation ? `（${clip(f.explanation, 120)}）` : ''}`,
          )
          .join('；'),
    );
  }
  if (c.keyLessons) {
    parts.push(`关键教训：${clip(c.keyLessons, 220)}`);
  }
  return parts.join('\n');
}

function buildConversationHistory(session: Exclude<SessionDetail, null>): string {
  return session.messages
    .slice(-6)
    .map((message) => {
      const role = message.role === 'user' ? '用户' : '助手';
      return `${role}：${clip(message.content, message.role === 'user' ? 280 : 420)}`;
    })
    .join('\n');
}

function buildFallbackAnswer(question: string, cases: NonNullCaseDetail[]): string {
  if (cases.length === 0) {
    return `关于"${question}"，当前知识库中暂未找到高度相关的失败案例。请尝试调整关键词，或先固定几个你想比较的案例后继续提问。`;
  }
  const reasons = [...new Set(cases.map((c) => c.primaryFailureReasonKey).filter(Boolean))].slice(
    0,
    3,
  );

  return (
    `关于"${question}"，以下是当前研究会话里最相关的 ${cases.length} 个案例：\n\n` +
    cases
      .slice(0, 5)
      .map(
        (c, i) =>
          `${i + 1}. **${c.companyName}**（${c.industry}，${c.closedYear ?? '?'} 年）\n   ${clip(c.summary, 200)}`,
      )
      .join('\n\n') +
    (reasons.length > 0 ? `\n\n高频失败主因：${reasons.join('、')}。` : '') +
    `\n\n（注：当前为规则摘要模式，未调用 LLM。配置 OPENAI_API_KEY 可获得更深度的分析。）`
  );
}

const SYSTEM_PROMPT = `你是"创业坟场"平台的失败智能分析师。你的任务是基于提供的失败案例知识库和当前研究会话上下文回答用户问题。
规则：
1. 所有结论必须来自提供的案例和会话上下文，不要凭空捏造。
2. 用清晰、结构化的中文回答，优先给出跨案例规律、差异点、可操作教训。
3. 如果证据不足，明确说明不足之处。
4. 如果存在 pinned context，把它们视为本轮优先参考的案例。`;

async function fetchCaseDetails(
  casesRepo: FastifyInstance['casesRepo'],
  ids: string[],
): Promise<NonNullCaseDetail[]> {
  if (ids.length === 0) return [];
  return casesRepo.getByIds(ids);
}

function buildCitations(cases: NonNullCaseDetail[], pinnedCaseIds: Set<string>) {
  return cases.map((d) => ({
    caseId: d.id,
    slug: d.slug,
    companyName: d.companyName,
    relevantText: clip(d.summary, 250),
    pinned: pinnedCaseIds.has(d.id),
  }));
}

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

    try {
      const qVec = await embedSearchQuery(question);
      void qVec;
    } catch {
      // silent degradation to full-text
    }

    const listResult = await app.casesRepo.list({
      q: question,
      page: 1,
      limit: topK,
      sort: 'relevance',
    });

    const candidateIds = [...new Set([...pinnedCaseIds, ...listResult.items.map((item) => item.id)])];
    const details = await fetchCaseDetails(app.casesRepo, candidateIds);
    const pinnedIdSet = new Set(pinnedCaseIds);
    const citations = buildCitations(details, pinnedIdSet);

    let answer: string;
    let grounded: boolean;
    let model: string | undefined;

    if (details.length === 0) {
      answer = buildFallbackAnswer(question, []);
      grounded = false;
    } else {
      const provider = getProvider();
      if (!provider) {
        answer = buildFallbackAnswer(question, details);
        grounded = false;
      } else {
        const contextBlocks = details
          .map((detail) => buildContextSnippet(detail, pinnedIdSet.has(detail.id)))
          .join('\n\n---\n\n');
        const history = existingSession ? buildConversationHistory(existingSession) : '';
        const userMessage = [
          history ? `会话历史：\n${history}` : '',
          `当前问题：${question}`,
          `知识库案例：\n\n${contextBlocks}`,
        ]
          .filter(Boolean)
          .join('\n\n');

        try {
          answer = await provider.chat(SYSTEM_PROMPT, userMessage);
          grounded = true;
          model = provider.name;
        } catch (e) {
          app.log.warn({ err: e }, 'LLM call failed, falling back to rule-based');
          answer = buildFallbackAnswer(question, details);
          grounded = false;
        }
      }
    }

    const saved = await app.copilotSessionsRepo.saveAnswerTurn({
      visitorId,
      sessionId,
      question,
      answer,
      citations,
      grounded,
      model,
      initialPinnedCaseIds,
    });
    if (!saved) return reply.code(404).send({ error: 'session_not_found' });

    return copilotAnswerResponseSchema.parse({
      sessionId: saved.session.session.id,
      userMessageId: saved.userMessageId,
      assistantMessageId: saved.assistantMessageId,
      answer,
      citations,
      model,
      grounded,
    });
  });
}
