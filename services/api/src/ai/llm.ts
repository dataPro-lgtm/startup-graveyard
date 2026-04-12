/**
 * Thin LLM provider abstraction.
 * Add new providers by implementing LLMProvider and registering in getProvider().
 */
import { config } from '../config/index.js';

export interface LLMProvider {
  readonly name: string;
  chat(systemPrompt: string, userMessage: string, opts?: ChatOptions): Promise<string>;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// OpenAI provider
// ---------------------------------------------------------------------------

class OpenAIProvider implements LLMProvider {
  readonly name: string;

  constructor() {
    this.name = config.openai.chatModel;
  }

  async chat(
    systemPrompt: string,
    userMessage: string,
    opts: ChatOptions = {},
  ): Promise<string> {
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
    };
    return data.choices[0]?.message?.content ?? '';
  }
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

class AnthropicProvider implements LLMProvider {
  readonly name: string;

  constructor() {
    this.name = config.anthropic.chatModel;
  }

  async chat(
    systemPrompt: string,
    userMessage: string,
    opts: ChatOptions = {},
  ): Promise<string> {
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
    };
    return data.content.find((b) => b.type === 'text')?.text ?? '';
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
