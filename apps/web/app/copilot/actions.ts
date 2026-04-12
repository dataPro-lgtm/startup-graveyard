'use server';

import { API_BASE_URL } from '@/lib/api';

export type CopilotCitation = {
  caseId: string;
  slug: string;
  companyName: string;
  relevantText: string;
};

export type CopilotResult =
  | { ok: true; answer: string; citations: CopilotCitation[]; model?: string; grounded: boolean }
  | { ok: false; error: string };

export async function askCopilotAction(
  question: string,
  topK = 5,
): Promise<CopilotResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/copilot/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, topK }),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `API ${res.status}` };
    const data = (await res.json()) as {
      answer: string;
      citations: CopilotCitation[];
      model?: string;
      grounded: boolean;
    };
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '请求失败' };
  }
}
