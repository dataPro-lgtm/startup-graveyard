'use server';

import { API_BASE_URL } from '@/lib/api';
import {
  copilotAnswerResponseSchema,
  copilotFeedbackResponseSchema,
  copilotSessionDetailSchema,
  copilotSessionsListResponseSchema,
  type CopilotAnswerResponse,
  type CopilotFeedbackResponse,
  type CopilotFeedbackVote,
  type CopilotSessionDetail,
  type CopilotSessionSummary,
} from '@sg/shared/schemas/copilot';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function parseJson<T>(
  res: Response,
  parser: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
): Promise<ActionResult<T>> {
  if (!res.ok) return { ok: false, error: `API ${res.status}` };
  const json: unknown = await res.json();
  const parsed = parser.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'invalid_response' };
  return { ok: true, data: parsed.data };
}

export async function askCopilotAction(input: {
  visitorId: string;
  question: string;
  sessionId?: string;
  topK?: number;
  pinnedCaseIds?: string[];
}): Promise<ActionResult<CopilotAnswerResponse>> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/copilot/answer`, {
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
    return parseJson(res, copilotAnswerResponseSchema);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '请求失败' };
  }
}

export async function listCopilotSessionsAction(
  visitorId: string,
  limit = 12,
): Promise<ActionResult<CopilotSessionSummary[]>> {
  try {
    const search = new URLSearchParams({ visitorId, limit: `${limit}` });
    const res = await fetch(`${API_BASE_URL}/v1/copilot/sessions?${search.toString()}`, {
      cache: 'no-store',
    });
    const parsed = await parseJson(res, copilotSessionsListResponseSchema);
    if (!parsed.ok) return parsed;
    return { ok: true, data: parsed.data.items };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '请求失败' };
  }
}

export async function createCopilotSessionAction(
  visitorId: string,
  title?: string,
): Promise<ActionResult<CopilotSessionDetail>> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/copilot/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, title }),
      cache: 'no-store',
    });
    return parseJson(res, copilotSessionDetailSchema);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '请求失败' };
  }
}

export async function getCopilotSessionAction(
  visitorId: string,
  sessionId: string,
): Promise<ActionResult<CopilotSessionDetail>> {
  try {
    const search = new URLSearchParams({ visitorId });
    const res = await fetch(
      `${API_BASE_URL}/v1/copilot/sessions/${encodeURIComponent(sessionId)}?${search.toString()}`,
      {
        cache: 'no-store',
      },
    );
    return parseJson(res, copilotSessionDetailSchema);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '请求失败' };
  }
}

export async function pinCopilotCaseAction(
  visitorId: string,
  sessionId: string,
  caseId: string,
): Promise<ActionResult<CopilotSessionDetail>> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/copilot/sessions/${encodeURIComponent(sessionId)}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, caseId }),
      cache: 'no-store',
    });
    return parseJson(res, copilotSessionDetailSchema);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '请求失败' };
  }
}

export async function unpinCopilotCaseAction(
  visitorId: string,
  sessionId: string,
  caseId: string,
): Promise<ActionResult<CopilotSessionDetail>> {
  try {
    const search = new URLSearchParams({ visitorId });
    const res = await fetch(
      `${API_BASE_URL}/v1/copilot/sessions/${encodeURIComponent(sessionId)}/pins/${encodeURIComponent(caseId)}?${search.toString()}`,
      {
        method: 'DELETE',
        cache: 'no-store',
      },
    );
    return parseJson(res, copilotSessionDetailSchema);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '请求失败' };
  }
}

export async function submitCopilotFeedbackAction(
  visitorId: string,
  messageId: string,
  vote: CopilotFeedbackVote,
  note?: string,
): Promise<ActionResult<CopilotFeedbackResponse>> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/v1/copilot/messages/${encodeURIComponent(messageId)}/feedback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, vote, note }),
        cache: 'no-store',
      },
    );
    return parseJson(res, copilotFeedbackResponseSchema);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '请求失败' };
  }
}
