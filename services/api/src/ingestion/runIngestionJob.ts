import type { Pool } from 'pg';
import { z } from 'zod';
import { embedCaseDocument, vectorToPgLiteral } from '../ai/openaiEmbed.js';
import { generateCopilotAnswer } from '../copilot/generateAnswer.js';
import { captureSourceSnapshot } from './sourceSnapshot.js';
import { rebuildCaseSearchIndex } from './caseIndexing.js';
import { extractCaseSignals } from './extractCaseSignals.js';
import { backfillCaseTaxonomy } from './taxonomyBackfill.js';
import { deliverRecoveryOutreachCrmSync } from '../recoveryOutreach/deliverRecoveryOutreachCrmSync.js';
import { deliverRecoveryOutreachWebhook } from '../recoveryOutreach/deliverRecoveryOutreachWebhook.js';
import { deliverRecoveryOutreachSlackAlert } from '../recoveryOutreach/deliverRecoveryOutreachSlackAlert.js';
import type { AdminCaseAttachmentsRepository } from '../repositories/adminCaseAttachmentsRepository.js';
import type { AdminWriteRepository } from '../repositories/adminWriteRepository.js';
import type { CasesRepository } from '../repositories/casesRepository.js';
import type {
  CopilotEvalBatchResultItem,
  CopilotEvalsRepository,
} from '../repositories/copilotEvalsRepository.js';
import type { SourceSnapshotsRepository } from '../repositories/sourceSnapshotsRepository.js';
import type { IngestionJobsRepository } from '../repositories/ingestionJobsRepository.js';
import type { TeamWorkspacesRepository } from '../repositories/teamWorkspacesRepository.js';
import { createDraftCaseBodySchema } from '../schemas/adminCases.js';

export type IngestionRunInput = {
  sourceName: string;
  triggerType: string;
  payload: Record<string, unknown>;
};

export type IngestionRunContext = {
  casesRepo?: CasesRepository;
  adminWrite?: AdminWriteRepository;
  adminAttachments?: AdminCaseAttachmentsRepository;
  sourceSnapshots?: SourceSnapshotsRepository;
  ingestionJobs?: IngestionJobsRepository;
  copilotEvals?: CopilotEvalsRepository;
  teamWorkspaces?: TeamWorkspacesRepository;
  pool?: Pool;
};

export type IngestionRunResult = { ok: true; detail?: string } | { ok: false; error: string };

const ERR_MAX = 4000;

function clip(s: string): string {
  return s.length <= ERR_MAX ? s : s.slice(0, ERR_MAX);
}

function clipPreview(s: string, max = 320): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * 按 `sourceName` 分发；未知来源视为 noop 成功。
 * - **echo**：`payload.message` 非空字符串。
 * - **fetch_title**：`payload.url` 为 http(s)，拉取 HTML 并解析 `<title>`。
 * - **create_draft**：`payload` 符合 `CreateDraftCaseBody`（与 POST /v1/admin/cases 相同字段），需 `ctx.adminWrite`。
 * - **capture_source_snapshot**：抓取 URL，保存 source snapshot。
 * - **pipeline_url_draft**：抓取 URL -> 保存 snapshot -> 生成 draft -> 自动附一条 evidence。
 * - **extract_case_signals**：从 source snapshot 自动抽取 failure factors / timeline / lessons / primary reason。
 * - **rebuild_case_search_index**：从 case/evidence/factors/timeline/lessons 重建 `case_chunks` 与 `case_embeddings`。
 * - **backfill_case_search_index**：批量回填缺 chunk 或缺 embedding 的已发布案例。
 * - **backfill_case_taxonomy**：批量归一化历史 taxonomy key，并为受影响的 published case 排入重建索引任务。
 * - **run_copilot_eval_suite**：回放内置 Copilot eval dataset，写入批次结果与失败样本。
 * - **reconcile_team_workspace_billing**：全量重跑 Team Workspace 账单/席位补偿与邀请恢复。
 * - **run_team_workspace_recovery_outreach**：为高风险 Team Workspace 调度 owner/admin 恢复触达，并按 `retryIntervalHours` 自动重试、在恢复后自动收敛待处理触达。
 * - **deliver_team_workspace_recovery_crm_sync**：将 `handoff_channel=crm` 的 admin recovery outreach 直接同步到 CRM API，并回写外部 case id / 下次重试时间。
 * - **deliver_team_workspace_recovery_webhook**：将到点且仍可重试的 handoff admin recovery outreach 推送到外部 webhook，并按 `retryIntervalHours` 回写重试窗口；达到上限后会停止自动重试，`force=true` 可忽略冷却窗口立即重推。
 * - **deliver_team_workspace_recovery_slack_alert**：将已进入 webhook dead-letter 的 handoff admin recovery outreach 发送到 Ops Slack；默认只发尚未成功告警的项，`force=true` 可重新发送。
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

  if (sourceName === 'deliver_team_workspace_recovery_webhook') {
    if (!ctx?.teamWorkspaces) {
      return {
        ok: false,
        error: 'deliver_team_workspace_recovery_webhook：服务端未注入 teamWorkspaces',
      };
    }
    const retryIntervalHours =
      typeof payload.retryIntervalHours === 'number' && Number.isFinite(payload.retryIntervalHours)
        ? Math.max(0, Math.trunc(payload.retryIntervalHours))
        : undefined;
    const force = payload.force === true;
    const delivered = await deliverRecoveryOutreachWebhook(ctx.teamWorkspaces, {
      retryIntervalHours,
      force,
    });
    if (!delivered.ok) {
      return {
        ok: false,
        error: clip(
          `deliver_team_workspace_recovery_webhook：${delivered.error} (${delivered.detail})`,
        ),
      };
    }
    return {
      ok: true,
      detail:
        delivered.skipped != null
          ? `attempted=0 delivered=0 skipped=${delivered.skipped}`
          : `attempted=${delivered.attemptedCount} delivered=${delivered.deliveredCount} status=${delivered.statusCode}`,
    };
  }

  if (sourceName === 'deliver_team_workspace_recovery_crm_sync') {
    if (!ctx?.teamWorkspaces) {
      return {
        ok: false,
        error: 'deliver_team_workspace_recovery_crm_sync：服务端未注入 teamWorkspaces',
      };
    }
    const retryIntervalHours =
      typeof payload.retryIntervalHours === 'number' && Number.isFinite(payload.retryIntervalHours)
        ? Math.max(0, Math.trunc(payload.retryIntervalHours))
        : undefined;
    const force = payload.force === true;
    const delivered = await deliverRecoveryOutreachCrmSync(ctx.teamWorkspaces, {
      retryIntervalHours,
      force,
    });
    if (!delivered.ok) {
      return {
        ok: false,
        error: clip(
          `deliver_team_workspace_recovery_crm_sync：${delivered.error} (${delivered.detail})`,
        ),
      };
    }
    return {
      ok: true,
      detail:
        delivered.skipped != null
          ? `attempted=0 synced=0 failed=0 skipped=${delivered.skipped}`
          : `attempted=${delivered.attemptedCount} synced=${delivered.syncedCount} failed=${delivered.failedCount}`,
    };
  }

  if (sourceName === 'deliver_team_workspace_recovery_slack_alert') {
    if (!ctx?.teamWorkspaces) {
      return {
        ok: false,
        error: 'deliver_team_workspace_recovery_slack_alert：服务端未注入 teamWorkspaces',
      };
    }
    const force = payload.force === true;
    const delivered = await deliverRecoveryOutreachSlackAlert(ctx.teamWorkspaces, {
      force,
    });
    if (!delivered.ok) {
      return {
        ok: false,
        error: clip(
          `deliver_team_workspace_recovery_slack_alert：${delivered.error} (${delivered.detail})`,
        ),
      };
    }
    return {
      ok: true,
      detail:
        delivered.skipped != null
          ? `attempted=0 alerted=0 skipped=${delivered.skipped}`
          : `attempted=${delivered.attemptedCount} alerted=${delivered.alertedCount} status=${delivered.statusCode}`,
    };
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
      metadata: {
        ...captured.snapshot.metadata,
        companyName: captured.snapshot.companyName,
        publisher: captured.snapshot.publisher,
      },
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
        error:
          'pipeline_url_draft：服务端未注入完整上下文（adminWrite/adminAttachments/sourceSnapshots）',
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
      metadata: {
        ...captured.snapshot.metadata,
        companyName: captured.snapshot.companyName,
        publisher: captured.snapshot.publisher,
      },
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
    let extractionJobId: string | null = null;
    if (ctx.ingestionJobs) {
      const queued = await ctx.ingestionJobs.enqueue({
        sourceName: 'extract_case_signals',
        triggerType: 'pipeline_followup',
        payload: {
          caseId: out.caseId,
          snapshotId: snapshot.id,
        },
      });
      extractionJobId = queued.id;
    }
    return {
      ok: true,
      detail:
        `snapshotId=${snapshot.id} caseId=${out.caseId} reviewId=${out.reviewId} evidenceId=${evidence.id}` +
        (extractionJobId ? ` extractionJobId=${extractionJobId}` : ''),
    };
  }

  if (sourceName === 'extract_case_signals') {
    if (!ctx?.adminWrite || !ctx?.adminAttachments || !ctx?.sourceSnapshots) {
      return {
        ok: false,
        error:
          'extract_case_signals：服务端未注入完整上下文（adminWrite/adminAttachments/sourceSnapshots）',
      };
    }
    const caseIdRaw = payload.caseId;
    const snapshotIdRaw = payload.snapshotId;
    if (typeof caseIdRaw !== 'string' || !z.string().uuid().safeParse(caseIdRaw).success) {
      return { ok: false, error: 'extract_case_signals：需要合法 payload.caseId（uuid）' };
    }
    if (typeof snapshotIdRaw !== 'string' || !z.string().uuid().safeParse(snapshotIdRaw).success) {
      return { ok: false, error: 'extract_case_signals：需要合法 payload.snapshotId（uuid）' };
    }
    const snapshot = await ctx.sourceSnapshots.getById(snapshotIdRaw);
    if (!snapshot) {
      return { ok: false, error: 'extract_case_signals：snapshot 不存在' };
    }
    const extracted = extractCaseSignals({
      snapshotText: snapshot.snapshotText,
      title: snapshot.title,
      excerpt: snapshot.excerpt,
    });
    let factorCount = 0;
    for (const factor of extracted.failureFactors) {
      const result = await ctx.adminAttachments.addFailureFactor(caseIdRaw, factor);
      if (!result.ok) return { ok: false, error: 'extract_case_signals：case 不存在' };
      factorCount++;
    }
    let timelineCount = 0;
    for (const event of extracted.timelineEvents) {
      const result = await ctx.adminAttachments.addTimelineEvent(caseIdRaw, event);
      if (!result.ok) return { ok: false, error: 'extract_case_signals：case 不存在' };
      timelineCount++;
    }
    if (extracted.primaryFailureReasonKey || extracted.keyLessons) {
      const update = await ctx.adminWrite.updateCaseAnalysis(caseIdRaw, {
        primaryFailureReasonKey: extracted.primaryFailureReasonKey ?? undefined,
        keyLessons: extracted.keyLessons ?? undefined,
      });
      if (!update.ok) return { ok: false, error: 'extract_case_signals：case 不存在' };
    }
    return {
      ok: true,
      detail:
        `caseId=${caseIdRaw} snapshotId=${snapshotIdRaw} factors=${factorCount} timeline=${timelineCount}` +
        ` primaryReason=${extracted.primaryFailureReasonKey ?? 'none'} lessons=${extracted.keyLessons ? 'yes' : 'no'}`,
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
      if (!ctx?.casesRepo) {
        return { ok: false, error: 'rebuild_case_search_index：需要 PostgreSQL 或 casesRepo' };
      }
      const rawId = payload.caseId;
      if (typeof rawId !== 'string' || !rawId.trim()) {
        return { ok: false, error: 'rebuild_case_search_index：需要 payload.caseId（uuid）' };
      }
      const published = await ctx.casesRepo.getById(rawId.trim());
      if (!published) {
        return { ok: false, error: 'rebuild_case_search_index：case 不存在' };
      }
      return {
        ok: true,
        detail: `caseId=${published.id} chunkCount=0 chunks=mock case=mock`,
      };
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
      return { ok: true, detail: 'backfill_case_search_index: skipped in mock mode' };
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

  if (sourceName === 'backfill_case_taxonomy') {
    if (!ctx?.pool) {
      return { ok: false, error: 'backfill_case_taxonomy：需要 PostgreSQL' };
    }
    const limitRaw = payload.limit;
    const limit =
      typeof limitRaw === 'number' && Number.isInteger(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 500)
        : 100;

    const result = await backfillCaseTaxonomy(ctx.pool, limit);

    let reindexQueued = 0;
    if (ctx.ingestionJobs) {
      for (const caseId of result.publishedCaseIds) {
        await ctx.ingestionJobs.enqueue({
          sourceName: 'rebuild_case_search_index',
          triggerType: 'taxonomy_backfill',
          payload: { caseId },
        });
        reindexQueued++;
      }
    }

    return {
      ok: true,
      detail:
        `backfill_case_taxonomy: scanned=${result.scannedCases} cases=${result.casesUpdated}` +
        ` factors=${result.factorsUpdated} timeline=${result.timelineUpdated}` +
        ` reindexQueued=${reindexQueued}`,
    };
  }

  if (sourceName === 'run_copilot_eval_suite') {
    if (!ctx?.casesRepo || !ctx?.copilotEvals) {
      return {
        ok: false,
        error: 'run_copilot_eval_suite：服务端未注入完整上下文（casesRepo/copilotEvals）',
      };
    }

    const limitRaw = payload.limit;
    const topKRaw = payload.topK;
    const onlyCaseSlugsRaw = payload.onlyCaseSlugs;
    const limit =
      typeof limitRaw === 'number' && Number.isInteger(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 50)
        : 20;
    const topK =
      typeof topKRaw === 'number' && Number.isInteger(topKRaw) && topKRaw > 0
        ? Math.min(topKRaw, 10)
        : 5;
    const onlyCaseSlugs =
      Array.isArray(onlyCaseSlugsRaw) && onlyCaseSlugsRaw.every((item) => typeof item === 'string')
        ? onlyCaseSlugsRaw.map((item) => item.trim()).filter(Boolean)
        : undefined;

    const evalCases = await ctx.copilotEvals.listActiveCases({
      limit,
      slugs: onlyCaseSlugs,
    });
    if (evalCases.length === 0) {
      return { ok: true, detail: 'run_copilot_eval_suite：no active eval cases' };
    }

    const results: CopilotEvalBatchResultItem[] = [];
    let groundedCases = 0;
    let fallbackCases = 0;
    let passedCases = 0;
    let totalTokens = 0;
    let totalEstimatedCostUsd = 0;
    const recallValues: number[] = [];
    const precisionValues: number[] = [];
    let promptVersion = 'unknown';
    let provider: string | null = null;
    let model: string | null = null;

    for (const evalCase of evalCases) {
      const pinnedCaseIds: string[] = [];
      for (const slug of evalCase.pinnedCaseSlugs) {
        const pinnedCase = await ctx.casesRepo.getPublishedBySlug(slug);
        if (pinnedCase) pinnedCaseIds.push(pinnedCase.id);
      }

      const answer = await generateCopilotAnswer({
        casesRepo: ctx.casesRepo,
        question: evalCase.question,
        topK,
        pinnedCaseIds,
      });

      promptVersion = answer.run.promptVersion;
      provider = answer.run.provider ?? provider;
      model = answer.run.model ?? model;
      groundedCases += answer.grounded ? 1 : 0;
      fallbackCases += answer.run.fallbackReason ? 1 : 0;
      totalTokens += answer.run.totalTokens ?? 0;
      totalEstimatedCostUsd += answer.run.estimatedCostUsd ?? 0;

      const actualCitationSlugs = answer.citations.map((item) => item.slug);
      const expectedSet = new Set(evalCase.expectedCaseSlugs.map((item) => item.toLowerCase()));
      const matchedExpectedCount = actualCitationSlugs.filter((slug) =>
        expectedSet.has(slug.toLowerCase()),
      ).length;
      const expectedCaseCount = evalCase.expectedCaseSlugs.length;
      const citationRecall =
        expectedCaseCount > 0 ? matchedExpectedCount / expectedCaseCount : null;
      const citationPrecision =
        actualCitationSlugs.length > 0 ? matchedExpectedCount / actualCitationSlugs.length : null;
      if (citationRecall != null) recallValues.push(citationRecall);
      if (citationPrecision != null) precisionValues.push(citationPrecision);

      const groundedOk =
        evalCase.expectedGrounded == null ? true : evalCase.expectedGrounded === answer.grounded;
      const fallbackOk =
        evalCase.expectedFallbackReason == null
          ? true
          : evalCase.expectedFallbackReason === answer.run.fallbackReason;
      const citationsOk =
        expectedCaseCount === 0
          ? actualCitationSlugs.length === 0
          : matchedExpectedCount === expectedCaseCount;
      const passed = groundedOk && fallbackOk && citationsOk;
      if (passed) passedCases++;

      results.push({
        evalCaseId: evalCase.id,
        question: evalCase.question,
        answerPreview: clipPreview(answer.answer),
        grounded: answer.grounded,
        fallbackReason: answer.run.fallbackReason,
        expectedCaseSlugs: evalCase.expectedCaseSlugs,
        actualCitationSlugs,
        matchedExpectedCount,
        expectedCaseCount,
        citationRecall,
        citationPrecision,
        passed,
        responseMs: answer.run.responseMs,
        totalTokens: answer.run.totalTokens,
        estimatedCostUsd: answer.run.estimatedCostUsd,
        promptVersion: answer.run.promptVersion,
      });
    }

    const avgCitationRecall = recallValues.length > 0 ? mean(recallValues) : null;
    const avgCitationPrecision = precisionValues.length > 0 ? mean(precisionValues) : null;
    const avgResponseMs = Math.round(mean(results.map((item) => item.responseMs)));
    const recorded = await ctx.copilotEvals.recordBatch({
      triggerType: input.triggerType,
      promptVersion,
      provider,
      model,
      totalCases: evalCases.length,
      passedCases,
      groundedCases,
      fallbackCases,
      avgCitationRecall,
      avgCitationPrecision,
      avgResponseMs,
      totalTokens,
      totalEstimatedCostUsd,
      results,
    });

    return {
      ok: true,
      detail:
        `run_copilot_eval_suite: batchId=${recorded.batchId} total=${evalCases.length}` +
        ` passed=${passedCases} grounded=${groundedCases} fallback=${fallbackCases}` +
        ` avgRecall=${avgCitationRecall == null ? 'n/a' : avgCitationRecall.toFixed(2)}` +
        ` avgPrecision=${avgCitationPrecision == null ? 'n/a' : avgCitationPrecision.toFixed(2)}`,
    };
  }

  if (sourceName === 'reconcile_team_workspace_billing') {
    if (!ctx?.teamWorkspaces) {
      return {
        ok: false,
        error: 'reconcile_team_workspace_billing：服务端未注入 teamWorkspaces',
      };
    }
    const result = await ctx.teamWorkspaces.reconcileAllBilling();
    return {
      ok: true,
      detail:
        `reconcile_team_workspace_billing: workspaces=${result.workspaceCount}` +
        ` revoked=${result.revokedInviteCount}` +
        ` restored=${result.restoredInviteCount}`,
    };
  }

  if (sourceName === 'run_team_workspace_recovery_outreach') {
    if (!ctx?.teamWorkspaces) {
      return {
        ok: false,
        error: 'run_team_workspace_recovery_outreach：服务端未注入 teamWorkspaces',
      };
    }
    const retryIntervalHoursRaw = payload.retryIntervalHours;
    if (
      retryIntervalHoursRaw != null &&
      (typeof retryIntervalHoursRaw !== 'number' ||
        !Number.isFinite(retryIntervalHoursRaw) ||
        retryIntervalHoursRaw < 0)
    ) {
      return {
        ok: false,
        error:
          'run_team_workspace_recovery_outreach：payload.retryIntervalHours 需要是大于等于 0 的数字',
      };
    }
    const retryIntervalHours =
      typeof retryIntervalHoursRaw === 'number' ? retryIntervalHoursRaw : undefined;
    const result = await ctx.teamWorkspaces.runRecoveryOutreachAutomation({
      retryIntervalHours,
    });
    return {
      ok: true,
      detail:
        `run_team_workspace_recovery_outreach: workspaces=${result.workspaceCount}` +
        ` owner=${result.ownerOutreachCreated}` +
        ` admin=${result.adminOutreachCreated}` +
        ` retried=${result.retriedOutreachCount}` +
        ` resolved=${result.resolvedOutreachCount}`,
    };
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
