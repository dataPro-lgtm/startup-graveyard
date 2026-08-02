import { COPILOT_PROMPT_VERSION, COPILOT_SYSTEM_PROMPT } from '../ai/copilotPrompt.js';
import { getProvider } from '../ai/llm.js';
import type { CaseDetail, CaseListItem, CasesRepository } from '../repositories/casesRepository.js';
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

const RETRIEVAL_HINTS = [
  '产品市场契合',
  '共享出行',
  '流媒体',
  '创始人',
  '单位经济',
  '房地产',
  '现金流',
  '监管',
  '扩张',
  '硬件',
  '补贴',
  '平台',
  '融资',
  '竞争',
  '治理',
  '电商',
  '教育',
] as const;

const ASCII_STOP_WORDS = new Set([
  'what',
  'when',
  'where',
  'which',
  'why',
  'with',
  'from',
  'have',
  'startup',
  'startups',
  'failure',
  'failures',
]);

function focusedRetrievalQueries(question: string): string[] {
  const ascii = question.match(/[a-z][a-z0-9.-]{2,}/gi) ?? [];
  const names = ascii.filter((token) => !ASCII_STOP_WORDS.has(token.toLowerCase()));
  const topics = RETRIEVAL_HINTS.filter((hint) => question.includes(hint));
  return [...new Set([...names, ...topics])].slice(0, 4);
}

function lexicalScore(item: CaseListItem, query: string): number {
  const normalizedQuery = query.toLowerCase();
  if (
    item.companyName.toLowerCase() === normalizedQuery ||
    item.slug.toLowerCase() === normalizedQuery
  ) {
    return 3;
  }
  const searchable = `${item.companyName}\n${item.summary}\n${item.keyLessons ?? ''}`.toLowerCase();
  return searchable.includes(normalizedQuery) ? 2 : 0;
}

async function retrieveCaseIds(
  casesRepo: CasesRepository,
  question: string,
  topK: number,
): Promise<string[]> {
  const focusedQueries = focusedRetrievalQueries(question);
  const [broad, focused] = await Promise.all([
    casesRepo.list({ q: question, page: 1, limit: topK, sort: 'relevance' }),
    Promise.all(
      focusedQueries.map(async (query) => {
        const result = await casesRepo.list({
          q: query,
          page: 1,
          limit: Math.max(topK, 6),
          sort: 'updated_at',
        });
        return result.items
          .map((item) => ({ item, score: lexicalScore(item, query) }))
          .sort((left, right) => right.score - left.score)
          .map(({ item }) => item);
      }),
    ),
  ]);

  const focusedItems = focused.flat();
  const exactAnchor = focusedItems.find((item) =>
    focusedQueries.some((query) => lexicalScore(item, query) === 3),
  );
  const sameIndustry = exactAnchor
    ? await casesRepo.list({
        industry: exactAnchor.industry,
        page: 1,
        limit: Math.max(topK + 1, 6),
        sort: 'updated_at',
      })
    : null;

  const lexicalMatches = focusedItems.filter((item) =>
    focusedQueries.some((query) => lexicalScore(item, query) > 0),
  );
  const candidates = exactAnchor
    ? [exactAnchor, ...lexicalMatches, ...(sameIndustry?.items ?? [])]
    : [...lexicalMatches, ...broad.items];

  return candidates
    .filter(
      (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index,
    )
    .slice(0, topK)
    .map((item) => item.id);
}

function buildFallbackAnswer(
  question: string,
  cases: CaseDetail[],
  reason: CopilotFallbackReason,
): string {
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
    `\n\n（注：${
      reason === 'provider_error'
        ? 'AI 服务调用失败，本次已自动切换到规则摘要模式。'
        : '当前未启用可用的 AI 服务，本次使用规则摘要模式。'
    }）`
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

  const retrievedIds = await retrieveCaseIds(casesRepo, question, topK);
  const candidateIds = [...new Set([...pinnedCaseIds, ...retrievedIds])];
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
    answer = buildFallbackAnswer(question, [], 'no_relevant_cases');
    grounded = false;
    fallbackReason = 'no_relevant_cases';
  } else {
    const provider = getProvider();
    if (!provider) {
      answer = buildFallbackAnswer(question, details, 'provider_unavailable');
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
        answer = buildFallbackAnswer(question, details, 'provider_error');
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
