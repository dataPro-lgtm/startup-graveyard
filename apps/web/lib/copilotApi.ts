import { API_BASE_URL } from './api';
import {
  copilotAnswerResponseSchema,
  copilotFeedbackResponseSchema,
  copilotSessionDetailSchema,
  copilotSessionsListResponseSchema,
  type CopilotAnswerResponse,
  type CopilotCitation,
  type CopilotFeedbackResponse,
  type CopilotFeedbackVote,
  type CopilotSessionDetail,
  type CopilotSessionSummary,
} from '@sg/shared/schemas/copilot';

export type { CopilotCitation, CopilotAnswerResponse as CopilotResponse };

export async function askCopilot(
  input: {
    visitorId: string;
    question: string;
    sessionId?: string;
    topK?: number;
    pinnedCaseIds?: string[];
  },
): Promise<CopilotAnswerResponse | null> {
  const url = `${API_BASE_URL}/v1/copilot/answer`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId: input.visitorId,
        question: input.question,
        sessionId: input.sessionId,
        topK: input.topK ?? 5,
        pinnedCaseIds: input.pinnedCaseIds,
      }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = copilotAnswerResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listCopilotSessions(
  visitorId: string,
  limit = 12,
): Promise<CopilotSessionSummary[]> {
  try {
    const search = new URLSearchParams({ visitorId, limit: `${limit}` });
    const res = await fetch(`${API_BASE_URL}/v1/copilot/sessions?${search.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    const parsed = copilotSessionsListResponseSchema.safeParse(json);
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}

export async function getCopilotSession(
  visitorId: string,
  sessionId: string,
): Promise<CopilotSessionDetail | null> {
  try {
    const search = new URLSearchParams({ visitorId });
    const res = await fetch(
      `${API_BASE_URL}/v1/copilot/sessions/${encodeURIComponent(sessionId)}?${search.toString()}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = copilotSessionDetailSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function submitCopilotFeedback(
  visitorId: string,
  messageId: string,
  vote: CopilotFeedbackVote,
): Promise<CopilotFeedbackResponse | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/v1/copilot/messages/${encodeURIComponent(messageId)}/feedback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, vote }),
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = copilotFeedbackResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
