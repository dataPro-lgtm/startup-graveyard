import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { CopilotAdminMetrics } from '@sg/shared/schemas/adminStats';
import type {
  CopilotCitation,
  CopilotFallbackReason,
  CopilotFeedbackVote,
  CopilotRunStats,
} from '@sg/shared/schemas/copilot';
import { withTransaction } from '../db/withTransaction.js';

export type CopilotSessionSummary = {
  id: string;
  title: string;
  messageCount: number;
  pinnedCaseCount: number;
  lastQuestion: string | null;
  updatedAt: string;
  createdAt: string;
};

export type CopilotMessageItem = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: CopilotCitation[];
  grounded: boolean | null;
  model: string | null;
  feedbackVote: CopilotFeedbackVote | null;
  feedbackNote: string | null;
  run: CopilotRunStats | null;
  createdAt: string;
};

export type CopilotSessionDetail = {
  session: CopilotSessionSummary;
  pinnedCaseIds: string[];
  messages: CopilotMessageItem[];
};

export type CreateCopilotSessionInput = {
  visitorId: string;
  title?: string;
};

export type SaveCopilotAnswerTurnInput = {
  visitorId: string;
  sessionId?: string;
  question: string;
  answer: string;
  citations: CopilotCitation[];
  grounded: boolean;
  model?: string;
  initialPinnedCaseIds?: string[];
  run?: {
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
};

export type SaveCopilotAnswerTurnResult = {
  session: CopilotSessionDetail;
  userMessageId: string;
  assistantMessageId: string;
};

export type SaveCopilotFeedbackResult = {
  messageId: string;
  vote: CopilotFeedbackVote;
  note: string | null;
};

export interface CopilotSessionsRepository {
  createSession(input: CreateCopilotSessionInput): Promise<CopilotSessionDetail>;
  listSessions(visitorId: string, limit: number): Promise<CopilotSessionSummary[]>;
  getSession(visitorId: string, sessionId: string): Promise<CopilotSessionDetail | null>;
  saveAnswerTurn(input: SaveCopilotAnswerTurnInput): Promise<SaveCopilotAnswerTurnResult | null>;
  getAdminMetrics(): Promise<CopilotAdminMetrics>;
  addPinnedCase(
    visitorId: string,
    sessionId: string,
    caseId: string,
  ): Promise<CopilotSessionDetail | null>;
  removePinnedCase(
    visitorId: string,
    sessionId: string,
    caseId: string,
  ): Promise<CopilotSessionDetail | null>;
  saveFeedback(
    visitorId: string,
    messageId: string,
    vote: CopilotFeedbackVote,
    note?: string,
  ): Promise<SaveCopilotFeedbackResult | null>;
}

const DEFAULT_SESSION_TITLE = '未命名研究会话';

type SessionRecord = {
  id: string;
  visitorId: string;
  title: string;
  pinnedCaseIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

type MessageRecord = CopilotMessageItem & {
  sessionId: string;
};

type SessionSummaryRow = QueryResultRow & {
  id: string;
  title: string;
  pinned_case_ids: unknown;
  created_at: Date;
  updated_at: Date;
  message_count: string | number;
  last_question: string | null;
};

type MessageRow = QueryResultRow & {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: unknown;
  grounded: boolean | null;
  model: string | null;
  created_at: Date;
  feedback_vote: CopilotFeedbackVote | null;
  feedback_note: string | null;
  run_provider: string | null;
  run_model: string | null;
  run_prompt_version: string | null;
  run_response_ms: number | null;
  run_prompt_tokens: number | null;
  run_completion_tokens: number | null;
  run_total_tokens: number | null;
  run_estimated_cost_usd: string | number | null;
  run_retrieved_case_count: number | null;
  run_pinned_case_count: number | null;
  run_citation_count: number | null;
  run_fallback_reason: CopilotFallbackReason | null;
  run_created_at: Date | null;
};

type AdminRunRecord = {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  promptVersion: string;
  question: string;
  answerPreview: string;
  grounded: boolean;
  feedbackVote: CopilotFeedbackVote | null;
  feedbackNote: string | null;
  fallbackReason: CopilotFallbackReason | null;
  responseMs: number;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  createdAt: string;
};

type PromptVersionMetricsRow = QueryResultRow & {
  prompt_version: string;
  runs: string | number;
  grounded_runs: string | number;
  fallback_runs: string | number;
  avg_response_ms: string | number;
  avg_total_tokens: string | number;
  total_estimated_cost_usd: string | number;
  positive_feedback: string | number;
  negative_feedback: string | number;
  no_feedback: string | number;
  last_run_at: Date | null;
};

type CopilotOverviewRow = QueryResultRow & {
  total_runs: string | number;
  total_sessions: string | number;
  grounded_runs: string | number;
  fallback_runs: string | number;
  avg_response_ms: string | number;
  avg_total_tokens: string | number;
  total_estimated_cost_usd: string | number;
  positive_feedback: string | number;
  negative_feedback: string | number;
  no_feedback: string | number;
  last_run_at: Date | null;
};

type FallbackReasonRow = QueryResultRow & {
  reason: CopilotFallbackReason;
  count: string | number;
};

type FlaggedRunRow = QueryResultRow & {
  session_id: string;
  user_message_id: string;
  assistant_message_id: string;
  prompt_version: string;
  question: string;
  answer_preview: string;
  feedback_vote: CopilotFeedbackVote | null;
  feedback_note: string | null;
  fallback_reason: CopilotFallbackReason | null;
  response_ms: string | number;
  total_tokens: string | number | null;
  estimated_cost_usd: string | number | null;
  created_at: Date;
};

function clipTitle(question: string): string {
  const trimmed = question.trim();
  if (!trimmed) return DEFAULT_SESSION_TITLE;
  return trimmed.length <= 40 ? trimmed : `${trimmed.slice(0, 40)}…`;
}

function normalizeCaseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function normalizeCitations(raw: unknown): CopilotCitation[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.caseId !== 'string' ||
      typeof row.slug !== 'string' ||
      typeof row.companyName !== 'string' ||
      typeof row.relevantText !== 'string'
    ) {
      return [];
    }
    return [
      {
        caseId: row.caseId,
        slug: row.slug,
        companyName: row.companyName,
        relevantText: row.relevantText,
        pinned: row.pinned === true,
      },
    ];
  });
}

function clipPreview(value: string, max = 220): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function roundNonnegative(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN) || value == null) return 0;
  return Math.max(0, Math.round(value));
}

function roundCurrency(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN) || value == null) return 0;
  return Number(Math.max(0, value).toFixed(8));
}

function toRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

function emptyAdminMetrics(): CopilotAdminMetrics {
  return {
    overview: {
      totalRuns: 0,
      totalSessions: 0,
      groundedRuns: 0,
      fallbackRuns: 0,
      avgResponseMs: 0,
      avgTotalTokens: 0,
      totalEstimatedCostUsd: 0,
      lastRunAt: null,
    },
    feedbackEval: {
      helpful: 0,
      needsImprovement: 0,
      unrated: 0,
      positiveRate: null,
    },
    byPromptVersion: [],
    byFallbackReason: [],
    recentFlags: [],
  };
}

function summarizeAdminRuns(runs: AdminRunRecord[]): CopilotAdminMetrics {
  if (runs.length === 0) return emptyAdminMetrics();

  const totalRuns = runs.length;
  const totalSessions = new Set(runs.map((run) => run.sessionId)).size;
  const groundedRuns = runs.filter((run) => run.grounded).length;
  const fallbackRuns = runs.filter((run) => run.fallbackReason != null).length;
  const tokenRuns = runs.filter((run) => run.totalTokens != null);
  const totalEstimatedCostUsd = roundCurrency(
    runs.reduce((sum, run) => sum + (run.estimatedCostUsd ?? 0), 0),
  );
  const helpful = runs.filter((run) => run.feedbackVote === 'up').length;
  const needsImprovement = runs.filter((run) => run.feedbackVote === 'down').length;
  const unrated = runs.filter((run) => run.feedbackVote == null).length;

  const byPromptVersion = Array.from(
    runs.reduce((map, run) => {
      const bucket = map.get(run.promptVersion) ?? [];
      bucket.push(run);
      map.set(run.promptVersion, bucket);
      return map;
    }, new Map<string, AdminRunRecord[]>()),
  )
    .map(([promptVersion, bucket]) => {
      const helpfulVotes = bucket.filter((run) => run.feedbackVote === 'up').length;
      const negativeVotes = bucket.filter((run) => run.feedbackVote === 'down').length;
      const noFeedback = bucket.filter((run) => run.feedbackVote == null).length;
      const bucketTokens = bucket.filter((run) => run.totalTokens != null);
      return {
        promptVersion,
        runs: bucket.length,
        groundedRuns: bucket.filter((run) => run.grounded).length,
        fallbackRuns: bucket.filter((run) => run.fallbackReason != null).length,
        avgResponseMs: roundNonnegative(
          bucket.reduce((sum, run) => sum + run.responseMs, 0) / bucket.length,
        ),
        avgTotalTokens: roundNonnegative(
          bucketTokens.length === 0
            ? 0
            : bucketTokens.reduce((sum, run) => sum + (run.totalTokens ?? 0), 0) /
                bucketTokens.length,
        ),
        totalEstimatedCostUsd: roundCurrency(
          bucket.reduce((sum, run) => sum + (run.estimatedCostUsd ?? 0), 0),
        ),
        positiveFeedback: helpfulVotes,
        negativeFeedback: negativeVotes,
        noFeedback,
        groundedRate: toRate(bucket.filter((run) => run.grounded).length, bucket.length),
        positiveRate: toRate(helpfulVotes, helpfulVotes + negativeVotes),
        lastRunAt:
          [...bucket].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? null,
      };
    })
    .sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? '') || b.runs - a.runs)
    .slice(0, 12);

  const byFallbackReason = Array.from(
    runs.reduce((map, run) => {
      if (!run.fallbackReason) return map;
      map.set(run.fallbackReason, (map.get(run.fallbackReason) ?? 0) + 1);
      return map;
    }, new Map<CopilotFallbackReason, number>()),
  )
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const recentFlags = runs
    .filter((run) => run.feedbackVote === 'down' || run.fallbackReason != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((run) => ({
      sessionId: run.sessionId,
      userMessageId: run.userMessageId,
      assistantMessageId: run.assistantMessageId,
      promptVersion: run.promptVersion,
      question: run.question,
      answerPreview: run.answerPreview,
      feedbackVote: run.feedbackVote,
      feedbackNote: run.feedbackNote,
      fallbackReason: run.fallbackReason,
      responseMs: run.responseMs,
      totalTokens: run.totalTokens,
      estimatedCostUsd: run.estimatedCostUsd,
      createdAt: run.createdAt,
    }));

  return {
    overview: {
      totalRuns,
      totalSessions,
      groundedRuns,
      fallbackRuns,
      avgResponseMs: roundNonnegative(
        runs.reduce((sum, run) => sum + run.responseMs, 0) / runs.length,
      ),
      avgTotalTokens: roundNonnegative(
        tokenRuns.length === 0
          ? 0
          : tokenRuns.reduce((sum, run) => sum + (run.totalTokens ?? 0), 0) / tokenRuns.length,
      ),
      totalEstimatedCostUsd,
      lastRunAt:
        [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? null,
    },
    feedbackEval: {
      helpful,
      needsImprovement,
      unrated,
      positiveRate: toRate(helpful, helpful + needsImprovement),
    },
    byPromptVersion,
    byFallbackReason,
    recentFlags,
  };
}

function rowToSessionSummary(row: SessionSummaryRow): CopilotSessionSummary {
  const pinnedCaseIds = normalizeCaseIds(row.pinned_case_ids);
  return {
    id: row.id,
    title: row.title,
    messageCount: Number(row.message_count ?? 0),
    pinnedCaseCount: pinnedCaseIds.length,
    lastQuestion: row.last_question,
    updatedAt: row.updated_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function rowToMessage(row: MessageRow): CopilotMessageItem {
  const run =
    row.run_prompt_version && row.run_created_at
      ? {
          provider: row.run_provider ?? null,
          model: row.run_model ?? null,
          promptVersion: row.run_prompt_version,
          responseMs: Number(row.run_response_ms ?? 0),
          promptTokens: row.run_prompt_tokens == null ? null : Number(row.run_prompt_tokens),
          completionTokens:
            row.run_completion_tokens == null ? null : Number(row.run_completion_tokens),
          totalTokens: row.run_total_tokens == null ? null : Number(row.run_total_tokens),
          estimatedCostUsd:
            row.run_estimated_cost_usd == null ? null : Number(row.run_estimated_cost_usd),
          retrievedCaseCount: Number(row.run_retrieved_case_count ?? 0),
          pinnedCaseCount: Number(row.run_pinned_case_count ?? 0),
          citationCount: Number(row.run_citation_count ?? 0),
          fallbackReason: row.run_fallback_reason ?? null,
          createdAt: row.run_created_at.toISOString(),
        }
      : null;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citations: normalizeCitations(row.citations),
    grounded: row.grounded ?? null,
    model: row.model ?? null,
    feedbackVote: row.feedback_vote ?? null,
    feedbackNote: row.feedback_note ?? null,
    run,
    createdAt: row.created_at.toISOString(),
  };
}

function toSessionDetail(session: SessionRecord, messages: MessageRecord[]): CopilotSessionDetail {
  const sessionMessages = messages
    .filter((message) => message.sessionId === session.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lastQuestion =
    [...sessionMessages].reverse().find((message) => message.role === 'user')?.content ?? null;

  return {
    session: {
      id: session.id,
      title: session.title,
      messageCount: sessionMessages.length,
      pinnedCaseCount: session.pinnedCaseIds.length,
      lastQuestion,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
    },
    pinnedCaseIds: [...session.pinnedCaseIds],
    messages: sessionMessages.map(({ sessionId: _sessionId, ...message }) => message),
  };
}

export class MockCopilotSessionsRepository implements CopilotSessionsRepository {
  private readonly sessions: SessionRecord[] = [];
  private readonly messages: MessageRecord[] = [];

  async createSession(input: CreateCopilotSessionInput): Promise<CopilotSessionDetail> {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: randomUUID(),
      visitorId: input.visitorId,
      title: input.title?.trim() || DEFAULT_SESSION_TITLE,
      pinnedCaseIds: [],
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    };
    this.sessions.unshift(session);
    return toSessionDetail(session, this.messages);
  }

  async listSessions(visitorId: string, limit: number): Promise<CopilotSessionSummary[]> {
    return this.sessions
      .filter((session) => session.visitorId === visitorId)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .slice(0, limit)
      .map((session) => toSessionDetail(session, this.messages).session);
  }

  async getSession(visitorId: string, sessionId: string): Promise<CopilotSessionDetail | null> {
    const session = this.sessions.find(
      (item) => item.id === sessionId && item.visitorId === visitorId,
    );
    if (!session) return null;
    return toSessionDetail(session, this.messages);
  }

  async saveAnswerTurn(
    input: SaveCopilotAnswerTurnInput,
  ): Promise<SaveCopilotAnswerTurnResult | null> {
    let session = input.sessionId
      ? this.sessions.find(
          (item) => item.id === input.sessionId && item.visitorId === input.visitorId,
        )
      : undefined;

    if (input.sessionId && !session) return null;

    if (!session) {
      const created = await this.createSession({
        visitorId: input.visitorId,
        title: clipTitle(input.question),
      });
      session = this.sessions.find((item) => item.id === created.session.id)!;
      session.pinnedCaseIds = [...new Set(input.initialPinnedCaseIds ?? [])];
    }

    const existingCount = this.messages.filter(
      (message) => message.sessionId === session.id,
    ).length;
    if (existingCount === 0 && session.title === DEFAULT_SESSION_TITLE) {
      session.title = clipTitle(input.question);
    }

    const now = new Date().toISOString();
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();

    this.messages.push({
      id: userMessageId,
      sessionId: session.id,
      role: 'user',
      content: input.question,
      citations: [],
      grounded: null,
      model: null,
      feedbackVote: null,
      feedbackNote: null,
      run: null,
      createdAt: now,
    });
    this.messages.push({
      id: assistantMessageId,
      sessionId: session.id,
      role: 'assistant',
      content: input.answer,
      citations: input.citations,
      grounded: input.grounded,
      model: input.model ?? null,
      feedbackVote: null,
      feedbackNote: null,
      run:
        input.run == null
          ? null
          : {
              ...input.run,
              createdAt: now,
            },
      createdAt: now,
    });

    session.updatedAt = now;
    session.lastMessageAt = now;

    const detail = await this.getSession(input.visitorId, session.id);
    if (!detail) return null;
    return {
      session: detail,
      userMessageId,
      assistantMessageId,
    };
  }

  async getAdminMetrics(): Promise<CopilotAdminMetrics> {
    const runs: AdminRunRecord[] = [];
    const sessions = [...this.sessions];
    for (const session of sessions) {
      const sessionMessages = this.messages
        .filter((message) => message.sessionId === session.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      let lastQuestion = '';
      let lastUserMessageId = '';
      for (const message of sessionMessages) {
        if (message.role === 'user') {
          lastQuestion = message.content;
          lastUserMessageId = message.id;
          continue;
        }
        if (!message.run) continue;
        runs.push({
          sessionId: session.id,
          userMessageId: lastUserMessageId,
          assistantMessageId: message.id,
          promptVersion: message.run.promptVersion,
          question: lastQuestion,
          answerPreview: clipPreview(message.content),
          grounded: message.grounded === true,
          feedbackVote: message.feedbackVote,
          feedbackNote: message.feedbackNote,
          fallbackReason: message.run.fallbackReason,
          responseMs: message.run.responseMs,
          totalTokens: message.run.totalTokens,
          estimatedCostUsd: message.run.estimatedCostUsd,
          createdAt: message.run.createdAt,
        });
      }
    }
    return summarizeAdminRuns(runs);
  }

  async addPinnedCase(
    visitorId: string,
    sessionId: string,
    caseId: string,
  ): Promise<CopilotSessionDetail | null> {
    const session = this.sessions.find(
      (item) => item.id === sessionId && item.visitorId === visitorId,
    );
    if (!session) return null;
    if (!session.pinnedCaseIds.includes(caseId)) {
      session.pinnedCaseIds.push(caseId);
      session.updatedAt = new Date().toISOString();
    }
    return this.getSession(visitorId, sessionId);
  }

  async removePinnedCase(
    visitorId: string,
    sessionId: string,
    caseId: string,
  ): Promise<CopilotSessionDetail | null> {
    const session = this.sessions.find(
      (item) => item.id === sessionId && item.visitorId === visitorId,
    );
    if (!session) return null;
    session.pinnedCaseIds = session.pinnedCaseIds.filter((id) => id !== caseId);
    session.updatedAt = new Date().toISOString();
    return this.getSession(visitorId, sessionId);
  }

  async saveFeedback(
    visitorId: string,
    messageId: string,
    vote: CopilotFeedbackVote,
    note?: string,
  ): Promise<SaveCopilotFeedbackResult | null> {
    const message = this.messages.find((item) => item.id === messageId);
    if (!message || message.role !== 'assistant') return null;
    const session = this.sessions.find(
      (item) => item.id === message.sessionId && item.visitorId === visitorId,
    );
    if (!session) return null;
    message.feedbackVote = vote;
    message.feedbackNote = note?.trim() || null;
    session.updatedAt = new Date().toISOString();
    return {
      messageId: message.id,
      vote,
      note: message.feedbackNote,
    };
  }
}

async function getSessionSummaryRow(
  db: Pool | PoolClient,
  visitorId: string,
  sessionId: string,
): Promise<SessionSummaryRow | null> {
  const res = await db.query<SessionSummaryRow>(
    `
    SELECT
      s.id,
      s.title,
      s.pinned_case_ids,
      s.created_at,
      s.updated_at,
      COALESCE(msg.message_count, 0)::bigint AS message_count,
      last_user.content AS last_question
    FROM copilot_sessions s
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS message_count
      FROM copilot_messages m
      WHERE m.session_id = s.id
    ) msg ON TRUE
    LEFT JOIN LATERAL (
      SELECT m.content
      FROM copilot_messages m
      WHERE m.session_id = s.id
        AND m.role = 'user'
      ORDER BY m.created_at DESC
      LIMIT 1
    ) last_user ON TRUE
    WHERE s.id = $1
      AND s.visitor_id = $2
    LIMIT 1
    `,
    [sessionId, visitorId],
  );
  return res.rows[0] ?? null;
}

async function getSessionDetailWithDb(
  db: Pool | PoolClient,
  visitorId: string,
  sessionId: string,
): Promise<CopilotSessionDetail | null> {
  const sessionRow = await getSessionSummaryRow(db, visitorId, sessionId);
  if (!sessionRow) return null;

  const messagesRes = await db.query<MessageRow>(
    `
    SELECT
      m.id,
      m.role,
      m.content,
      m.citations,
      m.grounded,
      m.model,
      m.created_at,
      f.vote AS feedback_vote,
      f.note AS feedback_note,
      r.provider AS run_provider,
      r.model AS run_model,
      r.prompt_version AS run_prompt_version,
      r.response_ms AS run_response_ms,
      r.prompt_tokens AS run_prompt_tokens,
      r.completion_tokens AS run_completion_tokens,
      r.total_tokens AS run_total_tokens,
      r.estimated_cost_usd AS run_estimated_cost_usd,
      r.retrieved_case_count AS run_retrieved_case_count,
      r.pinned_case_count AS run_pinned_case_count,
      r.citation_count AS run_citation_count,
      r.fallback_reason AS run_fallback_reason,
      r.created_at AS run_created_at
    FROM copilot_messages m
    LEFT JOIN copilot_message_feedback f
      ON f.message_id = m.id
    LEFT JOIN copilot_runs r
      ON r.assistant_message_id = m.id
    WHERE m.session_id = $1
    ORDER BY m.created_at ASC, m.id ASC
    `,
    [sessionId],
  );

  return {
    session: rowToSessionSummary(sessionRow),
    pinnedCaseIds: normalizeCaseIds(sessionRow.pinned_case_ids),
    messages: messagesRes.rows.map(rowToMessage),
  };
}

export class PgCopilotSessionsRepository implements CopilotSessionsRepository {
  constructor(private readonly pool: Pool) {}

  async createSession(input: CreateCopilotSessionInput): Promise<CopilotSessionDetail> {
    const res = await this.pool.query<{ id: string }>(
      `
      INSERT INTO copilot_sessions (visitor_id, title, pinned_case_ids)
      VALUES ($1, $2, '[]'::jsonb)
      RETURNING id
      `,
      [input.visitorId, input.title?.trim() || DEFAULT_SESSION_TITLE],
    );
    const detail = await this.getSession(input.visitorId, res.rows[0]!.id);
    if (!detail) {
      throw new Error('failed_to_load_copilot_session');
    }
    return detail;
  }

  async listSessions(visitorId: string, limit: number): Promise<CopilotSessionSummary[]> {
    const res = await this.pool.query<SessionSummaryRow>(
      `
      SELECT
        s.id,
        s.title,
        s.pinned_case_ids,
        s.created_at,
        s.updated_at,
        COALESCE(msg.message_count, 0)::bigint AS message_count,
        last_user.content AS last_question
      FROM copilot_sessions s
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::bigint AS message_count
        FROM copilot_messages m
        WHERE m.session_id = s.id
      ) msg ON TRUE
      LEFT JOIN LATERAL (
        SELECT m.content
        FROM copilot_messages m
        WHERE m.session_id = s.id
          AND m.role = 'user'
        ORDER BY m.created_at DESC
        LIMIT 1
      ) last_user ON TRUE
      WHERE s.visitor_id = $1
      ORDER BY s.last_message_at DESC, s.updated_at DESC, s.created_at DESC
      LIMIT $2
      `,
      [visitorId, limit],
    );
    return res.rows.map(rowToSessionSummary);
  }

  async getSession(visitorId: string, sessionId: string): Promise<CopilotSessionDetail | null> {
    return getSessionDetailWithDb(this.pool, visitorId, sessionId);
  }

  async saveAnswerTurn(
    input: SaveCopilotAnswerTurnInput,
  ): Promise<SaveCopilotAnswerTurnResult | null> {
    return withTransaction(this.pool, async (client) => {
      let sessionId = input.sessionId;
      let title = clipTitle(input.question);

      if (sessionId) {
        const sessionRow = await client.query<{
          id: string;
          title: string;
          message_count: string | number;
        }>(
          `
          SELECT
            s.id,
            s.title,
            (SELECT COUNT(*)::bigint FROM copilot_messages m WHERE m.session_id = s.id) AS message_count
          FROM copilot_sessions s
          WHERE s.id = $1
            AND s.visitor_id = $2
          LIMIT 1
          FOR UPDATE
          `,
          [sessionId, input.visitorId],
        );
        const row = sessionRow.rows[0];
        if (!row) return null;
        if (Number(row.message_count ?? 0) > 0) {
          title = row.title;
        }
      } else {
        const created = await client.query<{ id: string }>(
          `
          INSERT INTO copilot_sessions (visitor_id, title, pinned_case_ids)
          VALUES ($1, $2, $3::jsonb)
          RETURNING id
          `,
          [input.visitorId, title, JSON.stringify(input.initialPinnedCaseIds ?? [])],
        );
        sessionId = created.rows[0]!.id;
      }

      const userMessageId = randomUUID();
      const assistantMessageId = randomUUID();

      await client.query(
        `
        INSERT INTO copilot_messages (id, session_id, role, content, citations, grounded, model)
        VALUES
          ($1, $2, 'user', $3, '[]'::jsonb, NULL, NULL),
          ($4, $2, 'assistant', $5, $6::jsonb, $7, $8)
        `,
        [
          userMessageId,
          sessionId,
          input.question,
          assistantMessageId,
          input.answer,
          JSON.stringify(input.citations),
          input.grounded,
          input.model ?? null,
        ],
      );

      if (input.run) {
        await client.query(
          `
          INSERT INTO copilot_runs (
            session_id,
            user_message_id,
            assistant_message_id,
            provider,
            model,
            prompt_version,
            grounded,
            fallback_reason,
            response_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            estimated_cost_usd,
            retrieved_case_count,
            pinned_case_count,
            citation_count
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16
          )
          `,
          [
            sessionId,
            userMessageId,
            assistantMessageId,
            input.run.provider,
            input.run.model,
            input.run.promptVersion,
            input.grounded,
            input.run.fallbackReason,
            input.run.responseMs,
            input.run.promptTokens,
            input.run.completionTokens,
            input.run.totalTokens,
            input.run.estimatedCostUsd,
            input.run.retrievedCaseCount,
            input.run.pinnedCaseCount,
            input.run.citationCount,
          ],
        );
      }

      await client.query(
        `
        UPDATE copilot_sessions
        SET title = $2,
            updated_at = NOW(),
            last_message_at = NOW()
        WHERE id = $1
        `,
        [sessionId, title],
      );

      const detail = await getSessionDetailWithDb(client, input.visitorId, sessionId);
      if (!detail) return null;
      return {
        session: detail,
        userMessageId,
        assistantMessageId,
      };
    });
  }

  async getAdminMetrics(): Promise<CopilotAdminMetrics> {
    const [overviewRes, promptRes, fallbackRes, flaggedRes] = await Promise.all([
      this.pool.query<CopilotOverviewRow>(
        `
        SELECT
          COUNT(*)::bigint AS total_runs,
          COUNT(DISTINCT r.session_id)::bigint AS total_sessions,
          COUNT(*) FILTER (WHERE r.grounded)::bigint AS grounded_runs,
          COUNT(*) FILTER (WHERE r.fallback_reason IS NOT NULL)::bigint AS fallback_runs,
          COALESCE(AVG(r.response_ms), 0) AS avg_response_ms,
          COALESCE(AVG(r.total_tokens), 0) AS avg_total_tokens,
          COALESCE(SUM(r.estimated_cost_usd), 0) AS total_estimated_cost_usd,
          COUNT(*) FILTER (WHERE f.vote = 'up')::bigint AS positive_feedback,
          COUNT(*) FILTER (WHERE f.vote = 'down')::bigint AS negative_feedback,
          COUNT(*) FILTER (WHERE f.vote IS NULL)::bigint AS no_feedback,
          MAX(r.created_at) AS last_run_at
        FROM copilot_runs r
        LEFT JOIN copilot_message_feedback f
          ON f.message_id = r.assistant_message_id
        `,
      ),
      this.pool.query<PromptVersionMetricsRow>(
        `
        SELECT
          r.prompt_version,
          COUNT(*)::bigint AS runs,
          COUNT(*) FILTER (WHERE r.grounded)::bigint AS grounded_runs,
          COUNT(*) FILTER (WHERE r.fallback_reason IS NOT NULL)::bigint AS fallback_runs,
          COALESCE(AVG(r.response_ms), 0) AS avg_response_ms,
          COALESCE(AVG(r.total_tokens), 0) AS avg_total_tokens,
          COALESCE(SUM(r.estimated_cost_usd), 0) AS total_estimated_cost_usd,
          COUNT(*) FILTER (WHERE f.vote = 'up')::bigint AS positive_feedback,
          COUNT(*) FILTER (WHERE f.vote = 'down')::bigint AS negative_feedback,
          COUNT(*) FILTER (WHERE f.vote IS NULL)::bigint AS no_feedback,
          MAX(r.created_at) AS last_run_at
        FROM copilot_runs r
        LEFT JOIN copilot_message_feedback f
          ON f.message_id = r.assistant_message_id
        GROUP BY r.prompt_version
        ORDER BY MAX(r.created_at) DESC, COUNT(*) DESC
        LIMIT 12
        `,
      ),
      this.pool.query<FallbackReasonRow>(
        `
        SELECT
          r.fallback_reason AS reason,
          COUNT(*)::bigint AS count
        FROM copilot_runs r
        WHERE r.fallback_reason IS NOT NULL
        GROUP BY r.fallback_reason
        ORDER BY COUNT(*) DESC, r.fallback_reason ASC
        `,
      ),
      this.pool.query<FlaggedRunRow>(
        `
        SELECT
          r.session_id,
          r.user_message_id,
          r.assistant_message_id,
          r.prompt_version,
          user_msg.content AS question,
          CASE
            WHEN length(assistant_msg.content) <= 220 THEN assistant_msg.content
            ELSE left(assistant_msg.content, 220) || '…'
          END AS answer_preview,
          f.vote AS feedback_vote,
          f.note AS feedback_note,
          r.fallback_reason,
          r.response_ms,
          r.total_tokens,
          r.estimated_cost_usd,
          r.created_at
        FROM copilot_runs r
        JOIN copilot_messages user_msg
          ON user_msg.id = r.user_message_id
        JOIN copilot_messages assistant_msg
          ON assistant_msg.id = r.assistant_message_id
        LEFT JOIN copilot_message_feedback f
          ON f.message_id = r.assistant_message_id
        WHERE f.vote = 'down'
           OR r.fallback_reason IS NOT NULL
        ORDER BY r.created_at DESC
        LIMIT 8
        `,
      ),
    ]);

    const overview = overviewRes.rows[0];
    if (!overview || Number(overview.total_runs ?? 0) === 0) {
      return emptyAdminMetrics();
    }

    const helpful = Number(overview.positive_feedback ?? 0);
    const needsImprovement = Number(overview.negative_feedback ?? 0);

    return {
      overview: {
        totalRuns: Number(overview.total_runs ?? 0),
        totalSessions: Number(overview.total_sessions ?? 0),
        groundedRuns: Number(overview.grounded_runs ?? 0),
        fallbackRuns: Number(overview.fallback_runs ?? 0),
        avgResponseMs: roundNonnegative(Number(overview.avg_response_ms ?? 0)),
        avgTotalTokens: roundNonnegative(Number(overview.avg_total_tokens ?? 0)),
        totalEstimatedCostUsd: roundCurrency(Number(overview.total_estimated_cost_usd ?? 0)),
        lastRunAt: overview.last_run_at?.toISOString() ?? null,
      },
      feedbackEval: {
        helpful,
        needsImprovement,
        unrated: Number(overview.no_feedback ?? 0),
        positiveRate: toRate(helpful, helpful + needsImprovement),
      },
      byPromptVersion: promptRes.rows.map((row) => {
        const positiveFeedback = Number(row.positive_feedback ?? 0);
        const negativeFeedback = Number(row.negative_feedback ?? 0);
        const runs = Number(row.runs ?? 0);
        const groundedRuns = Number(row.grounded_runs ?? 0);
        return {
          promptVersion: row.prompt_version,
          runs,
          groundedRuns,
          fallbackRuns: Number(row.fallback_runs ?? 0),
          avgResponseMs: roundNonnegative(Number(row.avg_response_ms ?? 0)),
          avgTotalTokens: roundNonnegative(Number(row.avg_total_tokens ?? 0)),
          totalEstimatedCostUsd: roundCurrency(Number(row.total_estimated_cost_usd ?? 0)),
          positiveFeedback,
          negativeFeedback,
          noFeedback: Number(row.no_feedback ?? 0),
          groundedRate: toRate(groundedRuns, runs),
          positiveRate: toRate(positiveFeedback, positiveFeedback + negativeFeedback),
          lastRunAt: row.last_run_at?.toISOString() ?? null,
        };
      }),
      byFallbackReason: fallbackRes.rows.map((row) => ({
        reason: row.reason,
        count: Number(row.count ?? 0),
      })),
      recentFlags: flaggedRes.rows.map((row) => ({
        sessionId: row.session_id,
        userMessageId: row.user_message_id,
        assistantMessageId: row.assistant_message_id,
        promptVersion: row.prompt_version,
        question: row.question,
        answerPreview: row.answer_preview,
        feedbackVote: row.feedback_vote ?? null,
        feedbackNote: row.feedback_note ?? null,
        fallbackReason: row.fallback_reason ?? null,
        responseMs: roundNonnegative(Number(row.response_ms ?? 0)),
        totalTokens: row.total_tokens == null ? null : Number(row.total_tokens),
        estimatedCostUsd:
          row.estimated_cost_usd == null ? null : roundCurrency(Number(row.estimated_cost_usd)),
        createdAt: row.created_at.toISOString(),
      })),
    };
  }

  async addPinnedCase(
    visitorId: string,
    sessionId: string,
    caseId: string,
  ): Promise<CopilotSessionDetail | null> {
    return withTransaction(this.pool, async (client) => {
      const row = await client.query<{ pinned_case_ids: unknown }>(
        `
        SELECT pinned_case_ids
        FROM copilot_sessions
        WHERE id = $1
          AND visitor_id = $2
        LIMIT 1
        FOR UPDATE
        `,
        [sessionId, visitorId],
      );
      const current = row.rows[0];
      if (!current) return null;
      const next = normalizeCaseIds(current.pinned_case_ids);
      if (!next.includes(caseId)) next.push(caseId);
      await client.query(
        `
        UPDATE copilot_sessions
        SET pinned_case_ids = $3::jsonb,
            updated_at = NOW()
        WHERE id = $1
          AND visitor_id = $2
        `,
        [sessionId, visitorId, JSON.stringify(next)],
      );
      return this.getSession(visitorId, sessionId);
    });
  }

  async removePinnedCase(
    visitorId: string,
    sessionId: string,
    caseId: string,
  ): Promise<CopilotSessionDetail | null> {
    return withTransaction(this.pool, async (client) => {
      const row = await client.query<{ pinned_case_ids: unknown }>(
        `
        SELECT pinned_case_ids
        FROM copilot_sessions
        WHERE id = $1
          AND visitor_id = $2
        LIMIT 1
        FOR UPDATE
        `,
        [sessionId, visitorId],
      );
      const current = row.rows[0];
      if (!current) return null;
      const next = normalizeCaseIds(current.pinned_case_ids).filter((id) => id !== caseId);
      await client.query(
        `
        UPDATE copilot_sessions
        SET pinned_case_ids = $3::jsonb,
            updated_at = NOW()
        WHERE id = $1
          AND visitor_id = $2
        `,
        [sessionId, visitorId, JSON.stringify(next)],
      );
      return this.getSession(visitorId, sessionId);
    });
  }

  async saveFeedback(
    visitorId: string,
    messageId: string,
    vote: CopilotFeedbackVote,
    note?: string,
  ): Promise<SaveCopilotFeedbackResult | null> {
    const res = await this.pool.query<{
      message_id: string;
      vote: CopilotFeedbackVote;
      note: string | null;
    }>(
      `
      INSERT INTO copilot_message_feedback (message_id, vote, note)
      SELECT m.id, $3, $4
      FROM copilot_messages m
      JOIN copilot_sessions s
        ON s.id = m.session_id
      WHERE m.id = $1
        AND s.visitor_id = $2
        AND m.role = 'assistant'
      ON CONFLICT (message_id) DO UPDATE
      SET vote = EXCLUDED.vote,
          note = EXCLUDED.note,
          updated_at = NOW()
      RETURNING message_id, vote, note
      `,
      [messageId, visitorId, vote, note?.trim() || null],
    );

    const row = res.rows[0];
    if (!row) return null;
    return {
      messageId: row.message_id,
      vote: row.vote,
      note: row.note,
    };
  }
}
