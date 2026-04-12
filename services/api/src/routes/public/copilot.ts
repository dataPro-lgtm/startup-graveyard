/**
 * POST /v1/copilot/answer
 *
 * 接受自然语言问题，检索相关失败案例，组装上下文，
 * 调用 LLM（需 OPENAI_API_KEY 或 ANTHROPIC_API_KEY）返回带引用的结构化回答。
 * 未配置任何 API Key 时降级为规则摘要模式（grounded=false）。
 */
import type { FastifyInstance } from 'fastify';
import { embedSearchQuery } from '../../ai/openaiEmbed.js';
import {
  type CopilotAnswerResponse,
  copilotAnswerBodySchema,
  copilotAnswerResponseSchema,
} from '../../schemas/copilot.js';

/** 截断文本至 max 字符 */
function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** 从案例数据构建供 LLM 消费的上下文片段 */
function buildContextSnippet(c: {
  companyName: string;
  summary: string;
  primaryFailureReasonKey: string | null;
  closedYear: number | null;
  industry: string;
  failureFactors: Array<{
    level1Key: string;
    level2Key: string;
    explanation: string | null;
  }>;
}): string {
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

/** 规则降级：在无 LLM 时构造摘要回答 */
function buildFallbackAnswer(
  question: string,
  cases: Array<{
    companyName: string;
    summary: string;
    primaryFailureReasonKey: string | null;
    industry: string;
    closedYear: number | null;
  }>,
): string {
  if (cases.length === 0) {
    return `关于"${question}"，当前知识库中暂未找到高度相关的失败案例。请尝试调整关键词或浏览全部案例列表。`;
  }
  const names = cases.slice(0, 3).map((c) => c.companyName);
  const reasons = [
    ...new Set(cases.map((c) => c.primaryFailureReasonKey).filter(Boolean)),
  ].slice(0, 3);
  return (
    `关于"${question}"，以下是知识库中与此最相关的 ${cases.length} 个失败案例：\n\n` +
    cases
      .slice(0, 5)
      .map(
        (c, i) =>
          `${i + 1}. **${c.companyName}**（${c.industry}，${c.closedYear ?? '?'} 年）\n   ${clip(c.summary, 200)}`,
      )
      .join('\n\n') +
    (reasons.length > 0
      ? `\n\n常见失败原因：${reasons.join('、')}。`
      : '') +
    `\n\n（注：当前为规则摘要模式，未调用 LLM。配置 OPENAI_API_KEY 可获得更深度的分析。）`
  );
}

/** 调用 OpenAI Chat Completions */
async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const model = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini';
  const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com').replace(/\/$/, '');

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}

/** 调用 Anthropic Messages API */
async function callAnthropic(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const model = process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001';

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  return data.content.find((b) => b.type === 'text')?.text ?? '';
}

export async function copilotRoutes(app: FastifyInstance) {
  app.post('/answer', async (request, reply) => {
    const parsed = copilotAnswerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const { question, topK } = parsed.data;

    // 1. 向量检索相关案例
    let candidateIds: string[] = [];
    try {
      const qVec = await embedSearchQuery(question);
      if (qVec && qVec.length === 1536) {
        // 向量相似检索
        candidateIds = await (app as unknown as { pool?: import('pg').Pool }).pool
          ? []
          : [];
        // 通过 casesRepo.findSimilarPublished 代替（需要一个锚点案例，此处改用全文搜索兜底）
      }
    } catch {
      // 降级
    }

    // 2. 全文检索最相关案例（兜底）
    const listResult = await app.casesRepo.list({
      q: question,
      page: 1,
      limit: topK,
      sort: 'relevance',
    });

    const cases = listResult.items;
    if (cases.length === 0) {
      // 无结果降级
      const ans: CopilotAnswerResponse = {
        answer: buildFallbackAnswer(question, []),
        citations: [],
        grounded: false,
      };
      return copilotAnswerResponseSchema.parse(ans);
    }

    // 3. 加载每个案例的详情（含失败因子）
    const detailsRaw = await Promise.allSettled(
      cases.map((c) => app.casesRepo.getById(c.id)),
    );
    const details = detailsRaw
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter(Boolean) as NonNullable<
      Awaited<ReturnType<typeof app.casesRepo.getById>>
    >[];

    const citations = details.map((d) => ({
      caseId: d.id,
      slug: d.slug,
      companyName: d.companyName,
      relevantText: clip(d.summary, 250),
    }));

    // 4. 尝试调用 LLM
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

    if (!hasOpenAI && !hasAnthropic) {
      return copilotAnswerResponseSchema.parse({
        answer: buildFallbackAnswer(question, details),
        citations,
        grounded: false,
      });
    }

    const contextBlocks = details
      .map((d) => buildContextSnippet(d))
      .join('\n\n---\n\n');

    const systemPrompt = `你是"创业坟场"平台的失败智能分析师。你的任务是基于以下提供的失败案例知识库回答用户的问题。
规则：
1. 所有结论必须来自提供的案例，不要凭空捏造。
2. 用清晰、结构化的中文回答，适当使用列表和加粗。
3. 如果案例信息不足以回答，诚实说明。
4. 尽量总结出跨案例的规律和教训。`;

    const userMessage = `问题：${question}\n\n知识库案例：\n\n${contextBlocks}`;

    try {
      let llmAnswer: string;
      let modelName: string;

      if (hasAnthropic) {
        llmAnswer = await callAnthropic(systemPrompt, userMessage);
        modelName = process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001';
      } else {
        llmAnswer = await callOpenAI(systemPrompt, userMessage);
        modelName = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini';
      }

      return copilotAnswerResponseSchema.parse({
        answer: llmAnswer,
        citations,
        model: modelName,
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
