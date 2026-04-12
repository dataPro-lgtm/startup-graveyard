/**
 * Thin LLM provider abstraction.
 * Add new providers by implementing LLMProvider and registering in getProvider().
 */
import { config } from '../config/index.js';

export interface LLMProvider {
  readonly vendor: 'openai' | 'anthropic';
  readonly name: string;
  chat(systemPrompt: string, userMessage: string, opts?: ChatOptions): Promise<ChatCompletion>;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ChatUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
}

export interface ChatCompletion {
  text: string;
  usage: ChatUsage;
}

const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_MS = 30_000;

type UsagePrice = {
  inputPer1k: number;
  outputPer1k: number;
};

const DEFAULT_PRICE_MAP: Record<string, UsagePrice> = {
  'openai:gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'anthropic:claude-haiku-4-5-20251001': { inputPer1k: 0.0008, outputPer1k: 0.004 },
};

function parseOptionalNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function estimateCostUsd(
  vendor: 'openai' | 'anthropic',
  model: string,
  usage: { promptTokens: number | null; completionTokens: number | null },
): number | null {
  if (usage.promptTokens == null || usage.completionTokens == null) return null;

  const envInput =
    vendor === 'openai'
      ? parseOptionalNumber(process.env.OPENAI_CHAT_INPUT_COST_PER_1K)
      : parseOptionalNumber(process.env.ANTHROPIC_CHAT_INPUT_COST_PER_1K);
  const envOutput =
    vendor === 'openai'
      ? parseOptionalNumber(process.env.OPENAI_CHAT_OUTPUT_COST_PER_1K)
      : parseOptionalNumber(process.env.ANTHROPIC_CHAT_OUTPUT_COST_PER_1K);

  const defaults = DEFAULT_PRICE_MAP[`${vendor}:${model}`];
  const inputPer1k = envInput ?? defaults?.inputPer1k ?? null;
  const outputPer1k = envOutput ?? defaults?.outputPer1k ?? null;
  if (inputPer1k == null || outputPer1k == null) return null;

  const estimated =
    (usage.promptTokens / 1000) * inputPer1k + (usage.completionTokens / 1000) * outputPer1k;
  return Number(estimated.toFixed(8));
}

// ---------------------------------------------------------------------------
// OpenAI provider
// ---------------------------------------------------------------------------

class OpenAIProvider implements LLMProvider {
  readonly vendor = 'openai' as const;
  readonly name: string;

  constructor() {
    this.name = config.openai.chatModel;
  }

  async chat(
    systemPrompt: string,
    userMessage: string,
    opts: ChatOptions = {},
  ): Promise<ChatCompletion> {
    const resp = await fetch(`${config.openai.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.chatModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 300)}`);
    }

    const data = (await resp.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const promptTokens = Number(data.usage?.prompt_tokens ?? 0) || null;
    const completionTokens = Number(data.usage?.completion_tokens ?? 0) || null;
    const totalTokens =
      Number(data.usage?.total_tokens ?? 0) ||
      (promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null);
    return {
      text: data.choices[0]?.message?.content ?? '',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: estimateCostUsd(this.vendor, this.name, {
          promptTokens,
          completionTokens,
        }),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

class AnthropicProvider implements LLMProvider {
  readonly vendor = 'anthropic' as const;
  readonly name: string;

  constructor() {
    this.name = config.anthropic.chatModel;
  }

  async chat(
    systemPrompt: string,
    userMessage: string,
    opts: ChatOptions = {},
  ): Promise<ChatCompletion> {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.anthropic.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.anthropic.chatModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Anthropic ${resp.status}: ${err.slice(0, 300)}`);
    }

    const data = (await resp.json()) as {
      content: Array<{ type: string; text: string }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };
    const promptTokens = Number(data.usage?.input_tokens ?? 0) || null;
    const completionTokens = Number(data.usage?.output_tokens ?? 0) || null;
    const totalTokens =
      promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null;
    return {
      text: data.content.find((b) => b.type === 'text')?.text ?? '',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: estimateCostUsd(this.vendor, this.name, {
          promptTokens,
          completionTokens,
        }),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

/**
 * Returns the best available LLM provider, or null if none configured.
 * Priority: Anthropic > OpenAI (Anthropic is preferred when both are set).
 */
export function getProvider(): LLMProvider | null {
  if (config.hasAnthropic) return new AnthropicProvider();
  if (config.hasOpenAI) return new OpenAIProvider();
  return null;
}
