import { COPILOT_PROMPT_VERSION, COPILOT_SYSTEM_PROMPT } from '../ai/copilotPrompt.js';
import { embedSearchQuery } from '../ai/openaiEmbed.js';
import { getProvider } from '../ai/llm.js';
import type { CaseDetail, CasesRepository } from '../repositories/casesRepository.js';
import type { CopilotCitation, CopilotFallbackReason } from '@sg/shared/schemas/copilot';

export type CopilotConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type CopilotAnswerRunMetrics = {
  provider: string | null;
  model: string | null;
  promptVersion: string;
  responseMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  retrievedCaseCount: number;
  pinnedCaseCount: number;
  citationCount: number;
  fallbackReason: CopilotFallbackReason | null;
};

export type GenerateCopilotAnswerInput = {
  casesRepo: CasesRepository;
  question: string;
  topK: number;
  pinnedCaseIds: string[];
  history?: CopilotConversationTurn[];
  onProviderError?: (error: unknown) => void;
};

export type GenerateCopilotAnswerResult = {
  answer: string;
  citations: CopilotCitation[];
  grounded: boolean;
  model?: string;
  run: CopilotAnswerRunMetrics;
};

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function buildContextSnippet(c: CaseDetail, pinned = false): string {
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

function buildConversationHistory(history: CopilotConversationTurn[]): string {
  return history
    .slice(-6)
    .map((message) => {
      const role = message.role === 'user' ? '用户' : '助手';
      return `${role}：${clip(message.content, message.role === 'user' ? 280 : 420)}`;
    })
    .join('\n');
}

function buildFallbackAnswer(question: string, cases: CaseDetail[]): string {
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

function buildCitations(cases: CaseDetail[], pinnedCaseIds: Set<string>): CopilotCitation[] {
  return cases.map((detail) => ({
    caseId: detail.id,
    slug: detail.slug,
    companyName: detail.companyName,
    relevantText: clip(detail.summary, 250),
    pinned: pinnedCaseIds.has(detail.id),
  }));
}

async function fetchCaseDetails(casesRepo: CasesRepository, ids: string[]): Promise<CaseDetail[]> {
  if (ids.length === 0) return [];
  return casesRepo.getByIds(ids);
}

export async function generateCopilotAnswer(
  input: GenerateCopilotAnswerInput,
): Promise<GenerateCopilotAnswerResult> {
  const { casesRepo, question, topK, history = [] } = input;
  const pinnedCaseIds = [...new Set(input.pinnedCaseIds)];
  const pinnedIdSet = new Set(pinnedCaseIds);

  try {
    const qVec = await embedSearchQuery(question);
    void qVec;
  } catch {
    // silent degradation to full-text
  }

  const listResult = await casesRepo.list({
    q: question,
    page: 1,
    limit: topK,
    sort: 'relevance',
  });

  const candidateIds = [...new Set([...pinnedCaseIds, ...listResult.items.map((item) => item.id)])];
  const details = await fetchCaseDetails(casesRepo, candidateIds);
  const citations = buildCitations(details, pinnedIdSet);
  const answerStartedAt = Date.now();

  let answer: string;
  let grounded: boolean;
  let model: string | undefined;
  let providerName: string | null = null;
  let fallbackReason: CopilotFallbackReason | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;
  let estimatedCostUsd: number | null = null;

  if (details.length === 0) {
    answer = buildFallbackAnswer(question, []);
    grounded = false;
    fallbackReason = 'no_relevant_cases';
  } else {
    const provider = getProvider();
    if (!provider) {
      answer = buildFallbackAnswer(question, details);
      grounded = false;
      fallbackReason = 'provider_unavailable';
    } else {
      providerName = provider.vendor;
      const contextBlocks = details
        .map((detail) => buildContextSnippet(detail, pinnedIdSet.has(detail.id)))
        .join('\n\n---\n\n');
      const historyText = buildConversationHistory(history);
      const userMessage = [
        historyText ? `会话历史：\n${historyText}` : '',
        `当前问题：${question}`,
        `知识库案例：\n\n${contextBlocks}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
        const completion = await provider.chat(COPILOT_SYSTEM_PROMPT, userMessage);
        answer = completion.text;
        grounded = true;
        model = provider.name;
        promptTokens = completion.usage.promptTokens;
        completionTokens = completion.usage.completionTokens;
        totalTokens = completion.usage.totalTokens;
        estimatedCostUsd = completion.usage.estimatedCostUsd;
      } catch (error) {
        input.onProviderError?.(error);
        answer = buildFallbackAnswer(question, details);
        grounded = false;
        fallbackReason = 'provider_error';
      }
    }
  }

  return {
    answer,
    citations,
    grounded,
    model,
    run: {
      provider: providerName,
      model: model ?? null,
      promptVersion: COPILOT_PROMPT_VERSION,
      responseMs: Date.now() - answerStartedAt,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      retrievedCaseCount: details.length,
      pinnedCaseCount: pinnedCaseIds.length,
      citationCount: citations.length,
      fallbackReason,
    },
  };
}
