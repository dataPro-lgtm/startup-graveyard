import type { Pool } from 'pg';
import { z } from 'zod';
import { embedCaseDocument, vectorToPgLiteral } from '../ai/openaiEmbed.js';
import { captureSourceSnapshot } from './sourceSnapshot.js';
import { rebuildCaseSearchIndex } from './caseIndexing.js';
import type { AdminCaseAttachmentsRepository } from '../repositories/adminCaseAttachmentsRepository.js';
import type { AdminWriteRepository } from '../repositories/adminWriteRepository.js';
import type { SourceSnapshotsRepository } from '../repositories/sourceSnapshotsRepository.js';
import { createDraftCaseBodySchema } from '../schemas/adminCases.js';

export type IngestionRunInput = {
  sourceName: string;
  triggerType: string;
  payload: Record<string, unknown>;
};

export type IngestionRunContext = {
  adminWrite?: AdminWriteRepository;
  adminAttachments?: AdminCaseAttachmentsRepository;
  sourceSnapshots?: SourceSnapshotsRepository;
  pool?: Pool;
};

export type IngestionRunResult = { ok: true; detail?: string } | { ok: false; error: string };

const ERR_MAX = 4000;

function clip(s: string): string {
  return s.length <= ERR_MAX ? s : s.slice(0, ERR_MAX);
}

/**
 * 按 `sourceName` 分发；未知来源视为 noop 成功。
 * - **echo**：`payload.message` 非空字符串。
 * - **fetch_title**：`payload.url` 为 http(s)，拉取 HTML 并解析 `<title>`。
 * - **create_draft**：`payload` 符合 `CreateDraftCaseBody`（与 POST /v1/admin/cases 相同字段），需 `ctx.adminWrite`。
 * - **capture_source_snapshot**：抓取 URL，保存 source snapshot。
 * - **pipeline_url_draft**：抓取 URL -> 保存 snapshot -> 生成 draft -> 自动附一条 evidence。
 * - **rebuild_case_search_index**：从 case/evidence/factors/timeline/lessons 重建 `case_chunks` 与 `case_embeddings`。
 * - **backfill_case_search_index**：批量回填缺 chunk 或缺 embedding 的已发布案例。
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
    const t = await captureSourceSnapshot(urlRaw);
    if (!t.ok) return { ok: false, error: clip(`fetch_title：${t.error}`) };
    return { ok: true, detail: t.snapshot.title ?? t.snapshot.companyName };
  }

  if (sourceName === 'capture_source_snapshot') {
    if (!ctx?.sourceSnapshots) {
      return { ok: false, error: 'capture_source_snapshot：服务端未注入 sourceSnapshots' };
    }
    const urlRaw = payload.url;
    if (typeof urlRaw !== 'string' || !urlRaw.trim()) {
      return { ok: false, error: clip('capture_source_snapshot：需要 payload.url') };
    }
    const captured = await captureSourceSnapshot(urlRaw);
    if (!captured.ok) {
      return { ok: false, error: clip(`capture_source_snapshot：${captured.error}`) };
    }
    const saved = await ctx.sourceSnapshots.save({
      sourceName,
      sourceUrl: captured.snapshot.sourceUrl,
      finalUrl: captured.snapshot.finalUrl,
      httpStatus: captured.snapshot.httpStatus,
      contentType: captured.snapshot.contentType,
      title: captured.snapshot.title,
      excerpt: captured.snapshot.excerpt,
      contentSha256: captured.snapshot.contentSha256,
      snapshotText: captured.snapshot.snapshotText,
      metadata: captured.snapshot.metadata,
    });
    return { ok: true, detail: `snapshotId=${saved.id} title=${captured.snapshot.companyName}` };
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
    if (!ctx?.adminWrite || !ctx?.adminAttachments || !ctx?.sourceSnapshots) {
      return {
        ok: false,
        error: 'pipeline_url_draft：服务端未注入完整上下文（adminWrite/adminAttachments/sourceSnapshots）',
      };
    }
    const urlRaw = payload.url;
    if (typeof urlRaw !== 'string' || !urlRaw.trim()) {
      return {
        ok: false,
        error: clip('pipeline_url_draft：需要 payload.url'),
      };
    }
    const captured = await captureSourceSnapshot(urlRaw);
    if (!captured.ok) {
      return { ok: false, error: clip(`pipeline_url_draft：${captured.error}`) };
    }
    const snapshot = await ctx.sourceSnapshots.save({
      sourceName,
      sourceUrl: captured.snapshot.sourceUrl,
      finalUrl: captured.snapshot.finalUrl,
      httpStatus: captured.snapshot.httpStatus,
      contentType: captured.snapshot.contentType,
      title: captured.snapshot.title,
      excerpt: captured.snapshot.excerpt,
      contentSha256: captured.snapshot.contentSha256,
      snapshotText: captured.snapshot.snapshotText,
      metadata: captured.snapshot.metadata,
    });
    const parsed = createDraftCaseBodySchema.safeParse({
      ...payload,
      companyName:
        typeof payload.companyName === 'string' && payload.companyName.trim()
          ? payload.companyName.trim().slice(0, 500)
          : captured.snapshot.companyName.slice(0, 500),
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
    const evidence = await ctx.adminAttachments.addEvidence(out.caseId, {
      sourceType: 'web_snapshot',
      title: captured.snapshot.title ?? captured.snapshot.companyName,
      url: captured.snapshot.finalUrl,
      publisher: captured.snapshot.publisher ?? undefined,
      publishedAt: undefined,
      credibilityLevel: 'medium',
      excerpt: captured.snapshot.excerpt
        ? `${captured.snapshot.excerpt}\n\n[snapshot:${snapshot.id}]`
        : `[snapshot:${snapshot.id}]`,
    });
    if (!evidence.ok) {
      return {
        ok: false,
        error: 'pipeline_url_draft：draft 已创建，但自动 evidence 附加失败',
      };
    }
    return {
      ok: true,
      detail: `snapshotId=${snapshot.id} caseId=${out.caseId} reviewId=${out.reviewId} evidenceId=${evidence.id}`,
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
    } catch {
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
  }

  if (sourceName === 'rebuild_case_search_index') {
    if (!ctx?.pool) {
      return { ok: false, error: 'rebuild_case_search_index：需要 PostgreSQL' };
    }
    const rawId = payload.caseId;
    if (typeof rawId !== 'string' || !rawId.trim()) {
      return { ok: false, error: 'rebuild_case_search_index：需要 payload.caseId（uuid）' };
    }
    const idParsed = z.string().uuid().safeParse(rawId.trim());
    if (!idParsed.success) {
      return { ok: false, error: 'rebuild_case_search_index：caseId 不是合法 uuid' };
    }
    const result = await rebuildCaseSearchIndex(ctx.pool, idParsed.data);
    if (!result.ok) {
      return { ok: false, error: 'rebuild_case_search_index：case 不存在' };
    }
    return {
      ok: true,
      detail: `caseId=${result.caseId} chunkCount=${result.chunkCount} chunks=${result.chunkEmbeddingProvider} case=${result.caseEmbeddingProvider}`,
    };
  }

  if (sourceName === 'backfill_case_search_index') {
    if (!ctx?.pool) {
      return { ok: false, error: 'backfill_case_search_index：需要 PostgreSQL' };
    }
    const limitRaw = payload.limit;
    const limit =
      typeof limitRaw === 'number' && Number.isInteger(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 100)
        : 25;
    const { rows } = await ctx.pool.query<{ id: string }>(
      `
      SELECT c.id
      FROM cases c
      WHERE c.status = 'published'
        AND (
          NOT EXISTS (SELECT 1 FROM case_embeddings e WHERE e.case_id = c.id)
          OR NOT EXISTS (SELECT 1 FROM case_chunks ch WHERE ch.case_id = c.id)
        )
      ORDER BY c.published_at NULLS LAST, c.updated_at DESC
      LIMIT $1
      `,
      [limit],
    );
    let done = 0;
    let failed = 0;
    for (const row of rows) {
      const result = await rebuildCaseSearchIndex(ctx.pool, row.id);
      if (result.ok) done++;
      else failed++;
    }
    return { ok: true, detail: `backfill_case_search_index: done=${done} failed=${failed}` };
  }

  // ── auto_embed_new ──────────────────────────────────────────────────────────
  // Finds all published cases without embeddings and generates them.
  // Safe to run repeatedly (idempotent). Respects rate limits via sequential delay.
  if (sourceName === 'auto_embed_new') {
    if (!ctx?.pool) {
      return { ok: false, error: 'auto_embed_new：需要 PostgreSQL' };
    }
    const useOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
    if (!useOpenAI) {
      return { ok: false, error: 'auto_embed_new：需要 OPENAI_API_KEY' };
    }

    const { rows } = await ctx.pool.query<{
      id: string;
      company_name: string;
      summary: string;
      industry_key: string | null;
      search_tags: string | null;
    }>(`
      SELECT c.id, c.company_name, c.summary, c.industry_key, c.search_tags
      FROM cases c
      LEFT JOIN case_embeddings e ON e.case_id = c.id
      WHERE c.status = 'published' AND e.case_id IS NULL
      ORDER BY c.created_at
      LIMIT 50
    `);

    if (rows.length === 0) return { ok: true, detail: 'auto_embed_new：no unembedded cases' };

    let done = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const vec = await embedCaseDocument(row.company_name, row.summary);
        await ctx.pool.query(
          `INSERT INTO case_embeddings (case_id, embedding)
           VALUES ($1::uuid, $2::vector(1536))
           ON CONFLICT (case_id) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = NOW()`,
          [row.id, vectorToPgLiteral(vec)],
        );
        done++;
        // 350ms between calls = ~3 req/s, well under rate limits
        await new Promise((r) => setTimeout(r, 350));
      } catch {
        failed++;
      }
    }
    return { ok: true, detail: `auto_embed_new: done=${done} failed=${failed}` };
  }

  // ── cleanup_sessions ────────────────────────────────────────────────────────
  // Prunes expired user refresh tokens
  if (sourceName === 'cleanup_sessions') {
    if (!ctx?.pool) return { ok: false, error: 'cleanup_sessions：需要 PostgreSQL' };
    const { rowCount } = await ctx.pool.query(`DELETE FROM user_sessions WHERE expires_at < NOW()`);
    return { ok: true, detail: `cleanup_sessions: pruned ${rowCount ?? 0} rows` };
  }

  return { ok: true, detail: 'noop' };
}
