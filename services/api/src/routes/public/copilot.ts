/**
 * POST /v1/copilot/answer
 *
 * Accepts a natural-language question, retrieves relevant failure cases,
 * assembles context, and returns a grounded LLM answer with citations.
 * Falls back to a rule-based summary when no LLM provider is configured.
 */
import type { FastifyInstance } from 'fastify';
import { embedSearchQuery } from '../../ai/openaiEmbed.js';
import { getProvider } from '../../ai/llm.js';
import {
  type CopilotAnswerResponse,
  copilotAnswerBodySchema,
  copilotAnswerResponseSchema,
} from '../../schemas/copilot.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CaseDetail = Awaited<ReturnType<FastifyInstance['casesRepo']['getById']>>;
type NonNullCaseDetail = NonNullable<CaseDetail>;

type CitationItem = {
  caseId: string;
  slug: string;
  companyName: string;
  relevantText: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function buildContextSnippet(c: NonNullCaseDetail): string {
  const parts: string[] = [
    `公司：${c.companyName}（${c.industry}，${c.closedYear ?? '年份不详'}年倒闭）`,
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
  return parts.join('\n');
}

function buildFallbackAnswer(question: string, cases: NonNullCaseDetail[]): string {
  if (cases.length === 0) {
    return `关于"${question}"，当前知识库中暂未找到高度相关的失败案例。请尝试调整关键词或浏览全部案例列表。`;
  }
  const reasons = [...new Set(cases.map((c) => c.primaryFailureReasonKey).filter(Boolean))].slice(
    0,
    3,
  );

  return (
    `关于"${question}"，以下是知识库中与此最相关的 ${cases.length} 个失败案例：\n\n` +
    cases
      .slice(0, 5)
      .map(
        (c, i) =>
          `${i + 1}. **${c.companyName}**（${c.industry}，${c.closedYear ?? '?'} 年）\n   ${clip(c.summary, 200)}`,
      )
      .join('\n\n') +
    (reasons.length > 0 ? `\n\n常见失败原因：${reasons.join('、')}。` : '') +
    `\n\n（注：当前为规则摘要模式，未调用 LLM。配置 OPENAI_API_KEY 可获得更深度的分析。）`
  );
}

const SYSTEM_PROMPT = `你是"创业坟场"平台的失败智能分析师。你的任务是基于以下提供的失败案例知识库回答用户的问题。
规则：
1. 所有结论必须来自提供的案例，不要凭空捏造。
2. 用清晰、结构化的中文回答，适当使用列表和加粗。
3. 如果案例信息不足以回答，诚实说明。
4. 尽量总结出跨案例的规律和教训。`;

// ---------------------------------------------------------------------------
// Case retrieval
// ---------------------------------------------------------------------------

async function fetchCaseDetails(
  casesRepo: FastifyInstance['casesRepo'],
  ids: string[],
): Promise<NonNullCaseDetail[]> {
  return casesRepo.getByIds(ids);
}

function buildCitations(cases: NonNullCaseDetail[]): CitationItem[] {
  return cases.map((d) => ({
    caseId: d.id,
    slug: d.slug,
    companyName: d.companyName,
    relevantText: clip(d.summary, 250),
  }));
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function copilotRoutes(app: FastifyInstance) {
  app.post('/answer', async (request, reply) => {
    const parsed = copilotAnswerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const { question, topK } = parsed.data;

    // 1. Try vector search first, then fall back to full-text
    let candidateIds: string[] = [];
    try {
      const qVec = await embedSearchQuery(question);
      if (qVec && qVec.length === 1536) {
        // Vector search is handled inside casesRepo.list via hybrid scoring
        // when a query vector is available — no separate id list needed here
        candidateIds = [];
      }
    } catch {
      // silent degradation to full-text
    }
    void candidateIds; // reserved for future direct vector search path

    // 2. Full-text search for candidates
    const listResult = await app.casesRepo.list({
      q: question,
      page: 1,
      limit: topK,
      sort: 'relevance',
    });

    const listItems = listResult.items;
    if (listItems.length === 0) {
      const ans: CopilotAnswerResponse = {
        answer: buildFallbackAnswer(question, []),
        citations: [],
        grounded: false,
      };
      return copilotAnswerResponseSchema.parse(ans);
    }

    // 3. Load full details (evidence, factors, etc.)
    const details = await fetchCaseDetails(
      app.casesRepo,
      listItems.map((c) => c.id),
    );
    const citations = buildCitations(details);

    // 4. Call LLM if available
    const provider = getProvider();
    if (!provider) {
      return copilotAnswerResponseSchema.parse({
        answer: buildFallbackAnswer(question, details),
        citations,
        grounded: false,
      });
    }

    const contextBlocks = details.map(buildContextSnippet).join('\n\n---\n\n');
    const userMessage = `问题：${question}\n\n知识库案例：\n\n${contextBlocks}`;

    try {
      const llmAnswer = await provider.chat(SYSTEM_PROMPT, userMessage);
      return copilotAnswerResponseSchema.parse({
        answer: llmAnswer,
        citations,
        model: provider.name,
        grounded: true,
      });
    } catch (e) {
      app.log.warn({ err: e }, 'LLM call failed, falling back to rule-based');
      return copilotAnswerResponseSchema.parse({
        answer: buildFallbackAnswer(question, details),
        citations,
        grounded: false,
      });
    }
  });
}
