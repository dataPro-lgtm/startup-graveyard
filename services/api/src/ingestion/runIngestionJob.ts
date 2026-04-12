import type { Pool } from 'pg';
import { z } from 'zod';
import { embedCaseDocument, vectorToPgLiteral } from '../ai/openaiEmbed.js';
import type { AdminWriteRepository } from '../repositories/adminWriteRepository.js';
import { createDraftCaseBodySchema } from '../schemas/adminCases.js';

export type IngestionRunInput = {
  sourceName: string;
  triggerType: string;
  payload: Record<string, unknown>;
};

export type IngestionRunContext = {
  adminWrite?: AdminWriteRepository;
  pool?: Pool;
};

export type IngestionRunResult = { ok: true; detail?: string } | { ok: false; error: string };

const ERR_MAX = 4000;

function clip(s: string): string {
  return s.length <= ERR_MAX ? s : s.slice(0, ERR_MAX);
}

async function fetchHtmlTitle(
  urlInput: string,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  try {
    const u = new URL(urlInput.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: '仅支持 http/https' };
    }
    const res = await fetch(u, {
      redirect: 'follow',
      headers: {
        'user-agent': 'StartupGraveyardIngestion/1.0',
        accept: 'text/html,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const rawTitle = m?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    const title = rawTitle.length > 0 ? rawTitle.slice(0, 800) : '(未找到 <title>)';
    return { ok: true, title };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: clip(msg) };
  }
}

/**
 * 按 `sourceName` 分发；未知来源视为 noop 成功。
 * - **echo**：`payload.message` 非空字符串。
 * - **fetch_title**：`payload.url` 为 http(s)，拉取 HTML 并解析 `<title>`。
 * - **create_draft**：`payload` 符合 `CreateDraftCaseBody`（与 POST /v1/admin/cases 相同字段），需 `ctx.adminWrite`。
 * - **pipeline_url_draft**：`payload.url` + `slug` + `summary` + `industryKey`；用页面 title 作 `companyName` 再建草稿。
 * - **upsert_embedding_stub**：`payload.caseId`（uuid）；需 `ctx.pool`。若设置 `OPENAI_API_KEY` 则用
 *   `company_name`+`summary` 调 OpenAI 写入真实向量；否则用确定性 sin 向量（演示）。
 */
export async function runIngestionJob(
  input: IngestionRunInput,
  ctx?: IngestionRunContext,
): Promise<IngestionRunResult> {
  const { sourceName, payload } = input;

  if (sourceName === 'echo') {
    const msg = payload.message;
    if (typeof msg !== 'string' || !msg.trim()) {
      return {
        ok: false,
        error: clip('echo：需要 payload.message 为非空字符串'),
      };
    }
    return { ok: true, detail: msg.trim().slice(0, 500) };
  }

  if (sourceName === 'fetch_title') {
    const urlRaw = payload.url;
    if (typeof urlRaw !== 'string' || !urlRaw.trim()) {
      return { ok: false, error: clip('fetch_title：需要 payload.url') };
    }
    const t = await fetchHtmlTitle(urlRaw);
    if (!t.ok) return { ok: false, error: clip(`fetch_title：${t.error}`) };
    return { ok: true, detail: t.title };
  }

  if (sourceName === 'create_draft') {
    if (!ctx?.adminWrite) {
      return {
        ok: false,
        error: 'create_draft：服务端未注入 adminWrite（仅 API 进程内可用）',
      };
    }
    const parsed = createDraftCaseBodySchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        error: clip(`create_draft：${JSON.stringify(parsed.error.flatten().fieldErrors)}`),
      };
    }
    const out = await ctx.adminWrite.createDraftCaseWithReview(parsed.data);
    if (!out.ok) {
      return { ok: false, error: 'create_draft：slug 已存在' };
    }
    return {
      ok: true,
      detail: `caseId=${out.caseId} reviewId=${out.reviewId}`,
    };
  }

  if (sourceName === 'pipeline_url_draft') {
    if (!ctx?.adminWrite) {
      return {
        ok: false,
        error: 'pipeline_url_draft：服务端未注入 adminWrite（仅 API 进程内可用）',
      };
    }
    const urlRaw = payload.url;
    if (typeof urlRaw !== 'string' || !urlRaw.trim()) {
      return {
        ok: false,
        error: clip('pipeline_url_draft：需要 payload.url'),
      };
    }
    const t = await fetchHtmlTitle(urlRaw);
    if (!t.ok) {
      return { ok: false, error: clip(`pipeline_url_draft：${t.error}`) };
    }
    const parsed = createDraftCaseBodySchema.safeParse({
      ...payload,
      companyName: t.title.slice(0, 500),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: clip(`pipeline_url_draft：${JSON.stringify(parsed.error.flatten().fieldErrors)}`),
      };
    }
    const out = await ctx.adminWrite.createDraftCaseWithReview(parsed.data);
    if (!out.ok) {
      return { ok: false, error: 'pipeline_url_draft：slug 已存在' };
    }
    return {
      ok: true,
      detail: `url=${urlRaw.trim()} caseId=${out.caseId} reviewId=${out.reviewId}`,
    };
  }

  if (sourceName === 'upsert_embedding_stub') {
    if (!ctx?.pool) {
      return {
        ok: false,
        error: 'upsert_embedding_stub：需要 PostgreSQL（Mock 模式不可用）',
      };
    }
    const rawId = payload.caseId;
    if (typeof rawId !== 'string' || !rawId.trim()) {
      return {
        ok: false,
        error: 'upsert_embedding_stub：需要 payload.caseId（uuid）',
      };
    }
    const idParsed = z.string().uuid().safeParse(rawId.trim());
    if (!idParsed.success) {
      return { ok: false, error: 'upsert_embedding_stub：caseId 不是合法 uuid' };
    }
    const caseId = idParsed.data;
    const row = await ctx.pool.query<{
      company_name: string;
      summary: string;
    }>(`SELECT company_name, summary FROM cases WHERE id = $1 LIMIT 1`, [caseId]);
    const c = row.rows[0];
    if (!c) {
      return { ok: false, error: 'upsert_embedding_stub：case 不存在' };
    }

    const useOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
    if (useOpenAI) {
      try {
        const vec = await embedCaseDocument(c.company_name, c.summary);
        await ctx.pool.query(
          `
          INSERT INTO case_embeddings (case_id, embedding)
          VALUES ($1::uuid, $2::vector(1536))
          ON CONFLICT (case_id) DO UPDATE SET
            embedding = EXCLUDED.embedding,
            updated_at = NOW()
          `,
          [caseId, vectorToPgLiteral(vec)],
        );
        return {
          ok: true,
          detail: `case_embeddings upserted (openai) caseId=${caseId}`,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: clip(`upsert_embedding_stub：${msg}`) };
      }
    }

    await ctx.pool.query(
      `
      INSERT INTO case_embeddings (case_id, embedding)
      SELECT $1::uuid, (
        SELECT array_agg(
          sin((i + abs(hashtext($1::text)))::float8 / 123.0)
          ORDER BY i
        )
        FROM generate_series(1, 1536) AS i
      )::vector(1536)
      ON CONFLICT (case_id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
      `,
      [caseId],
    );
    return {
      ok: true,
      detail: `case_embeddings upserted (stub) caseId=${caseId}`,
    };
  }

  return { ok: true, detail: 'noop' };
}
