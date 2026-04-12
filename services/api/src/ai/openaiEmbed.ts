import { createHash } from 'node:crypto';
import { config } from '../config/index.js';

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 128;
export const EXPECTED_DIM = 1536;

export type EmbeddingProvider = 'openai' | 'deterministic';

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

export function buildDeterministicEmbedding(input: string): number[] {
  const seed = createHash('sha256').update(input).digest();
  const out = new Array<number>(EXPECTED_DIM);
  for (let i = 0; i < EXPECTED_DIM; i++) {
    const a = seed[i % seed.length] ?? 0;
    const b = seed[(i * 7 + 11) % seed.length] ?? 0;
    const c = seed[(i * 13 + 17) % seed.length] ?? 0;
    const angle = (a * 256 + b + c + i * 31) / 97;
    out[i] = Math.sin(angle);
  }
  return out;
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
  const { vector } = await embedDocumentText(`${companyName.trim()}\n\n${summary.trim()}`);
  return vector;
}

export async function embedDocumentText(
  input: string,
  options: { fallbackToDeterministic?: boolean } = {},
): Promise<{ vector: number[]; provider: EmbeddingProvider }> {
  const { vectors, provider } = await embedDocuments([input], options);
  const vector = vectors[0];
  if (!vector) throw new Error('No embedding generated');
  return { vector, provider };
}

export async function embedDocuments(
  inputs: string[],
  options: { fallbackToDeterministic?: boolean } = {},
): Promise<{ vectors: number[][]; provider: EmbeddingProvider }> {
  const trimmed = inputs.map((item) => item.trim().slice(0, 30_000));
  if (trimmed.length === 0) return { vectors: [], provider: 'deterministic' };
  if (trimmed.some((item) => !item)) throw new Error('Embedding input must be non-empty');

  if (config.hasOpenAI) {
    try {
      const vectors = await fetchEmbeddings(trimmed, config.openai.embeddingModel);
      if (!vectors || vectors.length !== trimmed.length) {
        throw new Error('Embedding array length mismatch');
      }
      for (const vector of vectors) {
        if (vector.length !== EXPECTED_DIM) {
          throw new Error(
            `Embedding dimension ${vector.length}, table requires ${EXPECTED_DIM}; use text-embedding-3-small or set OPENAI_EMBEDDING_MODEL`,
          );
        }
      }
      return { vectors, provider: 'openai' };
    } catch (e) {
      if (!options.fallbackToDeterministic) throw e;
      console.warn(`[openaiEmbed] fallback to deterministic: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!options.fallbackToDeterministic) {
    throw new Error('OPENAI_API_KEY not set');
  }

  return {
    vectors: trimmed.map(buildDeterministicEmbedding),
    provider: 'deterministic',
  };
}

async function fetchEmbedding(input: string, model: string): Promise<number[] | null> {
  const vectors = await fetchEmbeddings([input], model);
  return vectors?.[0] ?? null;
}

async function fetchEmbeddings(inputs: string[], model: string): Promise<number[][] | null> {
  const res = await fetch(`${config.openai.baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: inputs }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`[openaiEmbed] HTTP ${res.status} ${body.slice(0, 200)}`);
    return null;
  }

  const json: unknown = await res.json();
  return extractEmbeddings(json);
}

function extractEmbeddings(json: unknown): number[][] | null {
  if (!json || typeof json !== 'object') return null;
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const out: number[][] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') return null;
    const emb = (item as { embedding?: unknown }).embedding;
    if (!Array.isArray(emb)) return null;
    const nums = emb.map((x) => Number(x));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    if (nums.length !== EXPECTED_DIM) {
      console.warn(`[openaiEmbed] query embedding dim ${nums.length}, expected ${EXPECTED_DIM}`);
    }
    out.push(nums);
  }
  return out;
}
