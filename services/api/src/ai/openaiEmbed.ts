const DEFAULT_MODEL = 'text-embedding-3-small';
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 128;

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

/** 用于检索的 query 向量；无 key 或失败时返回 null（调用方回退 trgm）。 */
export async function embedSearchQuery(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
  const ck = cacheKey(model, trimmed);
  const hit = queryCache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.vec;

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: trimmed }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(
        `[openaiEmbed] embeddings HTTP ${res.status} ${errBody.slice(0, 200)}`,
      );
      return null;
    }
    const json: unknown = await res.json();
    const emb = extractEmbedding(json);
    if (!emb) return null;
    pruneCache();
    queryCache.set(ck, { at: Date.now(), vec: emb });
    return emb;
  } catch (e) {
    console.warn(
      `[openaiEmbed] ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/** 写入 case_embeddings；失败抛错供 ingestion 标记 failed。 */
export async function embedCaseDocument(
  companyName: string,
  summary: string,
): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY 未设置');
  }
  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
  const input = `${companyName.trim()}\n\n${summary.trim()}`.slice(0, 30_000);
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenAI embeddings ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const json: unknown = await res.json();
  const emb = extractEmbedding(json);
  if (!emb) throw new Error('OpenAI 响应中无 embedding 数组');
  if (emb.length !== 1536) {
    throw new Error(
      `embedding 维度 ${emb.length}，库表要求 1536；请使用 text-embedding-3-small 或设 OPENAI_EMBEDDING_MODEL`,
    );
  }
  return emb;
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
  if (nums.length !== 1536) {
    console.warn(
      `[openaiEmbed] query embedding dim ${nums.length}, expected 1536; hybrid 排序可能异常`,
    );
  }
  return nums;
}
