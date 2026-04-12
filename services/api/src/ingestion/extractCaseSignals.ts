import type {
  AddFailureFactorBody,
  AddTimelineEventBody,
} from '../schemas/adminCaseAttachments.js';

type ReasonKey = 'premature_scaling' | 'product_market_fit' | 'regulatory' | 'competition';

export type ExtractedCaseSignals = {
  primaryFailureReasonKey: ReasonKey | null;
  failureFactors: AddFailureFactorBody[];
  timelineEvents: AddTimelineEventBody[];
  keyLessons: string | null;
};

type Rule = {
  id: string;
  reasonKey: ReasonKey;
  level1Key: string;
  level2Key: string;
  level3Key: string | null;
  explanation: string;
  lesson: string;
  patterns: RegExp[];
};

const FACTOR_RULES: Rule[] = [
  {
    id: 'premature_scaling',
    reasonKey: 'premature_scaling',
    level1Key: 'finance',
    level2Key: 'premature_scaling',
    level3Key: 'cash_burn',
    explanation: '快速扩张、过早放大成本或单位经济承压。',
    lesson: '扩张前先验证单位经济模型和留存，不要在融资充裕阶段用规模掩盖结构性问题。',
    patterns: [
      /\brapid expansion\b/i,
      /\bexpanded too fast\b/i,
      /\bgrew too quickly\b/i,
      /\baggressive hiring\b/i,
      /\boverhiring\b/i,
      /\bcash burn\b/i,
      /\bburned through\b/i,
      /\bunit economics\b/i,
      /\blayoffs?\b/i,
      /高速扩张|激进扩张|扩张过快|烧钱|单位经济|裁员/u,
    ],
  },
  {
    id: 'product_market_fit',
    reasonKey: 'product_market_fit',
    level1Key: 'market',
    level2Key: 'product_market_fit',
    level3Key: 'weak_demand',
    explanation: '产品价值不成立、用户需求不足或留存验证失败。',
    lesson: '先验证用户是否真的需要这个产品，再决定定价、渠道和投入强度。',
    patterns: [
      /\bno demand\b/i,
      /\black of demand\b/i,
      /\bpoor retention\b/i,
      /\bwrong consumption context\b/i,
      /\bunnecessary product\b/i,
      /\busers? didn'?t\b/i,
      /\bby hand\b/i,
      /没有需求|需求不足|留存差|产品不必要|可直接手动/u,
    ],
  },
  {
    id: 'regulatory',
    reasonKey: 'regulatory',
    level1Key: 'regulatory',
    level2Key: 'regulatory_compliance',
    level3Key: 'lawsuit_or_investigation',
    explanation: '监管、合规或诉讼直接破坏商业模式可持续性。',
    lesson: '监管约束要前置到产品和运营设计里，不能等规模做大后再补课。',
    patterns: [
      /\blawsuits?\b/i,
      /\bregulator(y|s)?\b/i,
      /\bcompliance\b/i,
      /\binvestigation\b/i,
      /\bban(ned)?\b/i,
      /\bsec\b/i,
      /\bcms\b/i,
      /\blicen[cs]e\b/i,
      /诉讼|监管|合规|调查|禁令|牌照/u,
    ],
  },
  {
    id: 'competition',
    reasonKey: 'competition',
    level1Key: 'competitive',
    level2Key: 'better_funded_competitor',
    level3Key: 'platform_competition',
    explanation: '平台型巨头或更强竞争者进入，导致获客和留存迅速恶化。',
    lesson: '面对巨头或免费替代品时，必须提前建立差异化和分发护城河。',
    patterns: [
      /\bcompetition\b/i,
      /\bcompetitors?\b/i,
      /\bfree alternative\b/i,
      /\bapple\b/i,
      /\bspotify\b/i,
      /\byoutube\b/i,
      /\btiktok\b/i,
      /\bgoogle\b/i,
      /\bmeta\b/i,
      /竞争|巨头|免费替代|平台挤压/u,
    ],
  },
];

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？；;])\s+|\n+/u)
    .map((item) => normalize(item))
    .filter(Boolean);
}

function firstMatchingSentence(sentences: string[], patterns: RegExp[]): string | null {
  for (const sentence of sentences) {
    if (patterns.some((pattern) => pattern.test(sentence))) return sentence;
  }
  return null;
}

function scoreReason(text: string, reasonKey: ReasonKey): number {
  return FACTOR_RULES.filter((rule) => rule.reasonKey === reasonKey).reduce(
    (sum, rule) => sum + rule.patterns.filter((pattern) => pattern.test(text)).length,
    0,
  );
}

function uniqueLessons(rules: Rule[]): string | null {
  const lessons = [...new Set(rules.map((rule) => rule.lesson))];
  if (lessons.length === 0) return null;
  return lessons.map((lesson, index) => `${index + 1}. ${lesson}`).join('\n');
}

function parseAmountUsd(sentence: string): number | undefined {
  const billion = /\$?\s*([\d.]+)\s*billion/i.exec(sentence);
  if (billion) return Math.round(Number(billion[1]) * 1_000_000_000);
  const million = /\$?\s*([\d.]+)\s*million/i.exec(sentence);
  if (million) return Math.round(Number(million[1]) * 1_000_000);
  const plain = /\$([\d,]{4,})/.exec(sentence);
  if (plain) return Number(plain[1].replace(/,/g, ''));
  return undefined;
}

function inferEventType(sentence: string): string | null {
  const s = sentence.toLowerCase();
  if (/(founded|started|创立|成立)/u.test(s)) return 'founded';
  if (/(raised|series [abcde]|funding|融资)/u.test(s)) return 'funding';
  if (/(launch|launched|上线|发布)/u.test(s)) return 'product_launch';
  if (/(pivot|转型)/u.test(s)) return 'pivot';
  if (/(shut down|shutdown|closed down|cease operations|bankrupt|破产|关闭|停运|倒闭)/u.test(s))
    return 'shutdown';
  if (/(layoff|laid off|裁员)/u.test(s)) return 'layoff';
  if (/(acquire|acquired|sold to|出售|收购)/u.test(s)) return 'acquisition';
  if (/(lawsuit|investigation|regulator|ban|sec|cms|诉讼|调查|监管|禁令)/u.test(s))
    return 'regulatory';
  if (/(competition|competitor|apple|spotify|youtube|tiktok|竞争)/u.test(s)) return 'competition';
  return null;
}

function inferEventDate(sentence: string): string | null {
  const isoDate = /\b((?:19|20)\d{2}-\d{2}-\d{2})\b/.exec(sentence);
  if (isoDate) return isoDate[1] ?? null;

  const monthDate = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*((?:19|20)\d{2})\b/i.exec(
    sentence,
  );
  if (monthDate) {
    const monthNames = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];
    const month = monthNames.indexOf(monthDate[1]!.toLowerCase()) + 1;
    return `${monthDate[3]}-${String(month).padStart(2, '0')}-${String(Number(monthDate[2])).padStart(2, '0')}`;
  }

  const year = /\b((?:19|20)\d{2})\b/.exec(sentence);
  if (year) return `${year[1]}-01-01`;
  return null;
}

function extractTimelineEvents(sentences: string[], title: string | null): AddTimelineEventBody[] {
  const seen = new Set<string>();
  const out: AddTimelineEventBody[] = [];
  for (const sentence of sentences) {
    const eventType = inferEventType(sentence);
    const eventDate = inferEventDate(sentence);
    if (!eventType || !eventDate) continue;
    const titleText =
      eventType === 'shutdown' && title
        ? clip(title.split('|')[0]?.trim() || sentence, 160)
        : clip(sentence, 160);
    const key = `${eventDate}\0${eventType}\0${titleText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      eventDate,
      eventType,
      title: titleText,
      description: clip(sentence, 500),
      amountUsd: parseAmountUsd(sentence),
      sortOrder: out.length,
    });
    if (out.length >= 4) break;
  }
  return out;
}

export function extractCaseSignals(input: {
  snapshotText: string;
  title: string | null;
  excerpt: string | null;
}): ExtractedCaseSignals {
  const text = normalize([input.title ?? '', input.excerpt ?? '', input.snapshotText].join('\n'));
  const sentences = splitSentences(text);
  const matchedRules = FACTOR_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  ).slice(0, 3);

  const primaryFailureReasonKey =
    (['premature_scaling', 'product_market_fit', 'regulatory', 'competition'] as const)
      .map((reasonKey) => ({ reasonKey, score: scoreReason(text, reasonKey) }))
      .sort((a, b) => b.score - a.score)[0]?.score > 0
      ? (['premature_scaling', 'product_market_fit', 'regulatory', 'competition'] as const)
          .map((reasonKey) => ({ reasonKey, score: scoreReason(text, reasonKey) }))
          .sort((a, b) => b.score - a.score)[0]!.reasonKey
      : null;

  const failureFactors: AddFailureFactorBody[] = matchedRules.map((rule, index) => {
    const evidenceSentence = firstMatchingSentence(sentences, rule.patterns);
    return {
      level1Key: rule.level1Key,
      level2Key: rule.level2Key,
      level3Key: rule.level3Key ?? undefined,
      weight: Math.max(1, 90 - index * 10),
      explanation: clip(evidenceSentence ?? rule.explanation, 500),
    };
  });

  return {
    primaryFailureReasonKey,
    failureFactors,
    timelineEvents: extractTimelineEvents(sentences, input.title),
    keyLessons: uniqueLessons(matchedRules),
  };
}
