/**
 * Centralised configuration — all process.env access goes through here.
 * Callers import typed values instead of reading env vars directly.
 */

export const config = {
  db: {
    url: process.env.DATABASE_URL ?? '',
  },

  server: {
    port: Number(process.env.PORT ?? 18080),
    adminApiKey: process.env.ADMIN_API_KEY ?? '',
  },

  auth: {
    /** Secret used to sign JWT access tokens. Generate with: openssl rand -base64 48 */
    jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
    /** Base URL — supports proxy / mirror endpoints */
    baseUrl: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com').replace(/\/$/, ''),
    chatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() ?? '',
    chatModel: process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001',
  },

  /** Which LLM providers are actually configured at runtime */
  get hasOpenAI(): boolean {
    return this.openai.apiKey.length > 0;
  },
  get hasAnthropic(): boolean {
    return this.anthropic.apiKey.length > 0;
  },
} as const;
