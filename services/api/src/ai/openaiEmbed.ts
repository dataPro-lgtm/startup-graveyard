import { config } from '../config/index.js';

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 128;
const EXPECTED_DIM = 1536;

type CacheEntry = { at: number; vec: number[] };
const queryCache = new Map<string, CacheEntry>();

function cacheKey(model: string, text: string): string {
  return `${model}\0${text}`;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [k, v] of queryCache) {
    if (now - v.at > CACHE_TTL_MS) queryCache.delete(k);
  }
  while (queryCache.size > CACHE_MAX) {
    const first = queryCache.keys().next().value;
    if (first === undefined) break;
    queryCache.delete(first);
  }
}

export function vectorToPgLiteral(vec: number[]): string {
  return `[${vec.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;
}

/** Query embedding for search; returns null on failure (callers fall back to trgm). */
export async function embedSearchQuery(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!config.hasOpenAI) return null;

  const model = config.openai.embeddingModel;
  const ck = cacheKey(model, trimmed);
  const hit = queryCache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.vec;

  try {
    const emb = await fetchEmbedding(trimmed, model);
    if (!emb) return null;
    pruneCache();
    queryCache.set(ck, { at: Date.now(), vec: emb });
    return emb;
  } catch (e) {
    console.warn(`[openaiEmbed] ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Document embedding for indexing; throws on failure so ingestion can mark job failed. */
export async function embedCaseDocument(companyName: string, summary: string): Promise<number[]> {
  if (!config.hasOpenAI) throw new Error('OPENAI_API_KEY not set');

  const input = `${companyName.trim()}\n\n${summary.trim()}`.slice(0, 30_000);
  const emb = await fetchEmbedding(input, config.openai.embeddingModel);
  if (!emb) throw new Error('No embedding array in OpenAI response');
  if (emb.length !== EXPECTED_DIM) {
    throw new Error(
      `Embedding dimension ${emb.length}, table requires ${EXPECTED_DIM}; use text-embedding-3-small or set OPENAI_EMBEDDING_MODEL`,
    );
  }
  return emb;
}

async function fetchEmbedding(input: string, model: string): Promise<number[] | null> {
  const res = await fetch(`${config.openai.baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`[openaiEmbed] HTTP ${res.status} ${body.slice(0, 200)}`);
    return null;
  }

  const json: unknown = await res.json();
  return extractEmbedding(json);
}

function extractEmbedding(json: unknown): number[] | null {
  if (!json || typeof json !== 'object') return null;
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!first || typeof first !== 'object') return null;
  const emb = (first as { embedding?: unknown }).embedding;
  if (!Array.isArray(emb)) return null;
  const nums = emb.map((x) => Number(x));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  if (nums.length !== EXPECTED_DIM) {
    console.warn(`[openaiEmbed] query embedding dim ${nums.length}, expected ${EXPECTED_DIM}`);
  }
  return nums;
}
