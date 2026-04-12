import { API_BASE_URL } from './api';
import {
  copilotAnswerResponseSchema,
  type CopilotAnswerResponse,
  type CopilotCitation,
} from '@sg/shared/schemas/copilot';

export type { CopilotCitation, CopilotAnswerResponse as CopilotResponse };

export async function askCopilot(
  question: string,
  topK = 5,
): Promise<CopilotAnswerResponse | null> {
  const url = `${API_BASE_URL}/v1/copilot/answer`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, topK }),
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
