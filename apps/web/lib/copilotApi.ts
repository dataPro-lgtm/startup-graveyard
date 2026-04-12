import { z } from 'zod';
import { API_BASE_URL } from './api';

const citationSchema = z.object({
  caseId: z.string().uuid(),
  slug: z.string(),
  companyName: z.string(),
  relevantText: z.string(),
});

const copilotResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(citationSchema),
  model: z.string().optional(),
  grounded: z.boolean(),
});

export type CopilotCitation = z.infer<typeof citationSchema>;
export type CopilotResponse = z.infer<typeof copilotResponseSchema>;

export async function askCopilot(
  question: string,
  topK = 5,
): Promise<CopilotResponse | null> {
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
    const parsed = copilotResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
