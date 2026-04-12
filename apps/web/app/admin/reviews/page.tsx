import type { CSSProperties } from 'react';
import Link from 'next/link';
import { fetchAdminAudit } from '@/lib/adminAuditServer';
import { fetchAdminIngestionJobs } from '@/lib/adminIngestionServer';
import { fetchAdminReviews } from '@/lib/adminReviewsServer';
import { fetchAdminSourceSnapshots } from '@/lib/adminSourceSnapshotsServer';
import { pickSearchParam } from '@/lib/searchParams';
import {
  approveReview,
  createDraftCase,
  enqueueIngestionJob,
  processNextIngestionJob,
  reclaimStaleIngestionJobs,
  requestChangesReview,
  rejectReview,
  requeueIngestionJob,
  resubmitReview,
} from './actions';

type ReviewTab = 'pending' | 'changes_requested' | 'all' | 'approved' | 'rejected';

function tabFromRaw(raw: Record<string, string | string[] | undefined>): ReviewTab {
  const s = pickSearchParam(raw.status);
  if (s === 'all' || s === 'changes_requested' || s === 'approved' || s === 'rejected') return s;
  return 'pending';
}

function publishMissingLabel(key: 'evidence_sources' | 'failure_factors'): string {
  return key === 'evidence_sources' ? '至少 1 条证据来源' : '至少 1 个失败因子';
}

/** API 请求 query（不含路径） */
function buildReviewsApiQuery(raw: Record<string, string | string[] | undefined>): string {
  const tab = tabFromRaw(raw);
  const page = pickSearchParam(raw.page) ?? '1';
  const sp = new URLSearchParams();
  if (tab !== 'all') sp.set('status', tab);
  if (page !== '1') sp.set('page', page);
  sp.set('limit', '50');
  return `?${sp.toString()}`;
}

function adminTabHref(tab: ReviewTab, raw?: Record<string, string | string[] | undefined>): string {
  const sp = new URLSearchParams();
  if (tab !== 'pending') {
    if (tab === 'all') sp.set('status', 'all');
    else sp.set('status', tab);
  }
  if (raw) {
    const ings = pickSearchParam(raw.ingestionStatus);
    if (ings) sp.set('ingestionStatus', ings);
    const page = pickSearchParam(raw.page);
    if (page && page !== '1') sp.set('page', page);
  }
  const q = sp.toString();
  return q ? `/admin/reviews?${q}` : '/admin/reviews';
}

function buildIngestionListQuery(raw: Record<string, string | string[] | undefined>): string {
  const sp = new URLSearchParams();
  sp.set('limit', '20');
  const st = pickSearchParam(raw.ingestionStatus);
  if (st === 'queued' || st === 'running' || st === 'succeeded' || st === 'failed') {
    sp.set('status', st);
  }
  return `?${sp.toString()}`;
}

/** 保留当前审核 Tab / 分页，仅改入库列表筛选。 */
function adminReviewsHref(
  raw: Record<string, string | string[] | undefined>,
  ingestionStatus?: string,
): string {
  const sp = new URLSearchParams();
  const tab = tabFromRaw(raw);
  if (tab === 'all') sp.set('status', 'all');
  else if (tab === 'changes_requested') sp.set('status', 'changes_requested');
  else if (tab === 'approved') sp.set('status', 'approved');
  else if (tab === 'rejected') sp.set('status', 'rejected');
  const page = pickSearchParam(raw.page);
  if (page && page !== '1') sp.set('page', page);
  if (ingestionStatus) sp.set('ingestionStatus', ingestionStatus);
  const q = sp.toString();
  return q ? `/admin/reviews?${q}` : '/admin/reviews';
}

const tabBtn: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  fontSize: 14,
  textDecoration: 'none',
  border: '1px solid #2a3658',
  color: '#c8d0e5',
};
const tabBtnActive: CSSProperties = {
  ...tabBtn,
  background: '#1d2746',
  borderColor: '#5b7cff',
  color: '#9fb3ff',
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#9fb3ff',
};

const inputLike: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #2a3658',
  background: '#0b1020',
  color: '#f5f7fb',
  fontSize: 14,
};

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const qs = buildReviewsApiQuery(raw);
  const [result, audit, ingestion, snapshots] = await Promise.all([
    fetchAdminReviews(qs),
    fetchAdminAudit(25),
    fetchAdminIngestionJobs(buildIngestionListQuery(raw)),
    fetchAdminSourceSnapshots('?limit=8'),
  ]);
  const tab = tabFromRaw(raw);

  const ok = pickSearchParam(raw.ok);
  const err = pickSearchParam(raw.err);

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/" style={{ color: '#9fb3ff', fontSize: 14 }}>
          ← 返回首页
        </Link>
      </div>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>审核队列</h1>
      <p style={{ color: '#c8d0e5', marginBottom: 20 }}>
        通过 / 驳回会调用 API；需在根目录 <code style={{ color: '#9fb3ff' }}>.env</code> 配置{' '}
        <code style={{ color: '#9fb3ff' }}>ADMIN_API_KEY</code>（与 API 一致）。
      </p>

      <section
        style={{
          marginBottom: 32,
          padding: 20,
          borderRadius: 16,
          border: '1px solid #1d2746',
          background: '#10172b',
        }}
      >
        <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>新建草稿案例</h2>
        <form action={createDraftCase} style={{ display: 'grid', gap: 14, maxWidth: 560 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={fieldStyle}>
              slug（唯一，小写）
              <input name="slug" required placeholder="如 my-startup" style={inputLike} />
            </label>
            <label style={fieldStyle}>
              公司名
              <input name="companyName" required style={inputLike} />
            </label>
            <label style={fieldStyle}>
              摘要
              <textarea
                name="summary"
                required
                rows={3}
                style={{ ...inputLike, resize: 'vertical' }}
              />
            </label>
            <label style={fieldStyle}>
              行业 key
              <input name="industryKey" required placeholder="如 saas" style={inputLike} />
            </label>
            <label style={fieldStyle}>
              国家 ISO2（可选）
              <input name="countryCode" maxLength={2} placeholder="US" style={inputLike} />
            </label>
            <label style={fieldStyle}>
              商业模式 key（可选）
              <input name="businessModelKey" placeholder="如 marketplace" style={inputLike} />
            </label>
            <label style={fieldStyle}>
              主失败原因 key（可选）
              <input
                name="primaryFailureReasonKey"
                placeholder="如 premature_scaling"
                style={inputLike}
              />
            </label>
            <label style={fieldStyle}>
              成立年（可选）
              <input name="foundedYear" type="number" min={1800} max={2100} style={inputLike} />
            </label>
            <label style={fieldStyle}>
              关闭年（可选）
              <input name="closedYear" type="number" min={1800} max={2100} style={inputLike} />
            </label>
            <label style={fieldStyle}>
              总融资 USD（可选，整数）
              <input name="totalFundingUsd" type="number" min={0} style={inputLike} />
            </label>
            <label style={fieldStyle}>
              指派（可选）
              <input name="assignedTo" placeholder="邮箱或账号" style={inputLike} />
            </label>
          </div>
          <button
            type="submit"
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: '#2a6b4a',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              justifySelf: 'start',
            }}
          >
            创建并进入审核
          </button>
        </form>
      </section>

      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
        {(
          [
            ['pending', '待审核'],
            ['changes_requested', '待补充'],
            ['all', '全部'],
            ['approved', '已通过'],
            ['rejected', '已驳回'],
          ] as const
        ).map(([key, label]) => (
          <Link key={key} href={adminTabHref(key, raw)} style={tab === key ? tabBtnActive : tabBtn}>
            {label}
          </Link>
        ))}
      </nav>

      {ok === 'approve' ? <p style={{ color: '#7dffb3', marginBottom: 16 }}>已通过审核。</p> : null}
      {ok === 'changes_requested' ? (
        <p style={{ color: '#7dffb3', marginBottom: 16 }}>
          已标记为待补充，case 保持 draft，补充后可重新提交审核。
        </p>
      ) : null}
      {ok === 'resubmitted' ? (
        <p style={{ color: '#7dffb3', marginBottom: 16 }}>已重新提交审核。</p>
      ) : null}
      {ok === 'reject' ? <p style={{ color: '#7dffb3', marginBottom: 16 }}>已驳回。</p> : null}
      {ok === 'draft' ? (
        <p style={{ color: '#7dffb3', marginBottom: 16 }}>已创建草稿案例并进入待审核队列。</p>
      ) : null}
      {ok === 'ingest' ? (
        <p style={{ color: '#7dffb3', marginBottom: 16 }}>已入队 ingestion 任务（并写入审计）。</p>
      ) : null}
      {ok === 'ingest_processed' ? (
        <p style={{ color: '#7dffb3', marginBottom: 16 }}>
          已处理队列中下一条任务（审计：ingestion.job_succeeded 或 ingestion.job_failed）。
        </p>
      ) : null}
      {ok === 'ingest_empty' ? (
        <p style={{ color: '#c8d0e5', marginBottom: 16 }}>当前没有 queued 任务。</p>
      ) : null}
      {ok === 'reclaim' ? (
        <p style={{ color: '#7dffb3', marginBottom: 16 }}>
          已回收卡住任务：{pickSearchParam(raw.n) ?? '0'} 条回到 queued（审计
          ingestion.jobs_reclaimed_stale）。
        </p>
      ) : null}
      {ok === 'requeued' ? (
        <p style={{ color: '#7dffb3', marginBottom: 16 }}>已将失败任务重新入队（queued）。</p>
      ) : null}
      {err === 'config' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>
          Web 端未配置 ADMIN_API_KEY 或请求异常。
        </p>
      ) : null}
      {err === 'unauthorized' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>
          密钥与 API 不一致（检查两端 ADMIN_API_KEY）。
        </p>
      ) : null}
      {err === 'approve' || err === 'reject' || err === 'request_changes' || err === 'resubmit' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>操作失败，请重试。</p>
      ) : null}
      {err === 'approve_gate' ? (
        <p style={{ color: '#ffb47d', marginBottom: 16 }}>
          当前案例还不能发布：至少需要 1 条证据来源和 1 个失败因子。
        </p>
      ) : null}
      {err === 'notfound' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>
          记录当前状态不允许该操作（可能已处理或尚未重新提交）。
        </p>
      ) : null}
      {err === 'invalid' ? <p style={{ color: '#ff8a8a', marginBottom: 16 }}>无效请求。</p> : null}
      {err === 'changes_note' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>要求修改时必须填写明确的补充说明。</p>
      ) : null}
      {err === 'draft_fields' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>
          新建草稿：请填写 slug、公司名、摘要、行业 key。
        </p>
      ) : null}
      {err === 'draft_validation' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>API 校验未通过（字段格式或长度）。</p>
      ) : null}
      {err === 'duplicate_slug' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>slug 已存在，请换一个。</p>
      ) : null}
      {err === 'draft_failed' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>
          创建失败（需数据库 + 迁移 0002 审计表；查看 API 日志）。
        </p>
      ) : null}
      {err === 'ingest_fields' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>入队任务：请填写来源名与触发类型。</p>
      ) : null}
      {err === 'ingest_payload' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>payload JSON 解析失败或不是对象。</p>
      ) : null}
      {err === 'ingest_validation' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>入队参数未通过 API 校验。</p>
      ) : null}
      {err === 'ingest_failed' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>
          入队失败（查看 API 日志；PG 需有 ingestion_jobs 表）。
        </p>
      ) : null}
      {err === 'process_next_failed' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>
          处理下一条任务失败（API 或数据库事务）。
        </p>
      ) : null}
      {err === 'reclaim_failed' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>回收卡住任务失败。</p>
      ) : null}
      {err === 'requeue_notfound' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>
          重新入队失败：任务不存在或当前不是 failed。
        </p>
      ) : null}
      {err === 'requeue_failed' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>重新入队请求失败。</p>
      ) : null}

      {result.ok === false && result.reason === 'no_key' ? (
        <p style={{ color: '#ffb47d', marginBottom: 24 }}>
          未设置 ADMIN_API_KEY：列表接口无法调用（请在 .env 中配置）。
        </p>
      ) : null}

      {result.ok === false && result.reason === 'unauthorized' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 24 }}>
          401：Web 与 API 的 ADMIN_API_KEY 不一致。
        </p>
      ) : null}

      {result.ok === false && result.reason === 'bad_response' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 24 }}>
          无法拉取审核列表（API 是否启动？schema 是否匹配？）。
        </p>
      ) : null}

      {result.ok ? (
        <section style={{ display: 'grid', gap: 16 }}>
          {result.data.items.length === 0 ? (
            <p style={{ color: '#c8d0e5' }}>
              {tab === 'pending'
                ? '当前没有待审核项。'
                : tab === 'changes_requested'
                  ? '当前没有待补充项。'
                  : '当前筛选下没有记录。'}
            </p>
          ) : null}
          {result.data.items.map((item) => (
            <article
              key={item.id}
              style={{
                border: '1px solid #1d2746',
                borderRadius: 16,
                padding: 20,
                background: '#10172b',
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 20 }}>{item.companyName}</strong>
                <span style={{ color: '#9fb3ff', marginLeft: 12, fontSize: 14 }}>
                  {item.slug} · {item.reviewStatus}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#8a96b0',
                  marginBottom: 16,
                  wordBreak: 'break-all',
                }}
              >
                review <code>{item.id}</code>
                <br />
                case{' '}
                <Link href={`/admin/cases/${item.caseId}`} style={{ color: '#7d9cff' }}>
                  <code>{item.caseId}</code>
                </Link>
              </div>
              {item.decisionNote ? (
                <p style={{ color: '#c8d0e5', fontSize: 14, marginBottom: 16 }}>
                  备注：{item.decisionNote}
                </p>
              ) : null}
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1px solid ${item.publishReadiness.ready ? '#254636' : '#5a4d2f'}`,
                  background: item.publishReadiness.ready ? '#102118' : '#221c12',
                  color: item.publishReadiness.ready ? '#9fe7b8' : '#ffd39a',
                  fontSize: 13,
                }}
              >
                发布检查：证据 {item.publishReadiness.evidenceCount} 条，失败因子{' '}
                {item.publishReadiness.failureFactorCount} 个，
                {item.publishReadiness.ready ? '可发布' : '未达标'}。
                {!item.publishReadiness.ready ? (
                  <>
                    <br />
                    缺少：{item.publishReadiness.missing.map(publishMissingLabel).join('、')}
                  </>
                ) : null}
              </div>
              {item.reviewStatus === 'pending' ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <form action={approveReview}>
                    <input type="hidden" name="reviewId" value={item.id} />
                    <button
                      type="submit"
                      style={{
                        padding: '10px 18px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#3d5cff',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      通过
                    </button>
                  </form>
                  <form style={{ flex: '1 1 320px' }}>
                    <input type="hidden" name="reviewId" value={item.id} />
                    <textarea
                      name="decisionNote"
                      placeholder="要求补充的内容，或驳回原因"
                      rows={2}
                      style={{
                        width: '100%',
                        maxWidth: 460,
                        marginBottom: 8,
                        padding: 10,
                        borderRadius: 10,
                        border: '1px solid #2a3658',
                        background: '#0b1020',
                        color: '#f5f7fb',
                        resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <button
                        formAction={requestChangesReview}
                        style={{
                          padding: '10px 18px',
                          borderRadius: 10,
                          border: '1px solid #6c5b2d',
                          background: '#2a2412',
                          color: '#ffd39a',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        要求修改
                      </button>
                      <button
                        formAction={rejectReview}
                        style={{
                          padding: '10px 18px',
                          borderRadius: 10,
                          border: '1px solid #5c3d3d',
                          background: '#2a1818',
                          color: '#ffb4b4',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        驳回
                      </button>
                    </div>
                  </form>
                </div>
              ) : item.reviewStatus === 'changes_requested' ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <Link
                    href={`/admin/cases/${item.caseId}`}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 10,
                      border: '1px solid #2a3658',
                      background: '#0b1020',
                      color: '#9fb3ff',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    去补证据 / 因子
                  </Link>
                  <form action={resubmitReview}>
                    <input type="hidden" name="reviewId" value={item.id} />
                    <button
                      type="submit"
                      style={{
                        padding: '10px 18px',
                        borderRadius: 10,
                        border: '1px solid #2a6b4a',
                        background: '#183124',
                        color: '#9fe7b8',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      重新提交审核
                    </button>
                  </form>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: '#8a96b0' }}>已处理，仅可查看。</p>
              )}
            </article>
          ))}
        </section>
      ) : null}

      <section
        id="ingestion"
        style={{
          marginTop: 48,
          padding: 20,
          borderRadius: 16,
          border: '1px solid #1d2746',
          background: '#10172b',
        }}
      >
        <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>入库任务（ingestion_jobs）</h2>
        <p style={{ color: '#8a96b0', fontSize: 13, marginBottom: 16 }}>
          表 <code style={{ color: '#9fb3ff' }}>ingestion_jobs</code>。入队 →{' '}
          <code style={{ color: '#9fb3ff' }}>ingestion.job_queued</code>；处理 →{' '}
          <code style={{ color: '#9fb3ff' }}>ingestion.job_succeeded</code> 或{' '}
          <code style={{ color: '#9fb3ff' }}>ingestion.job_failed</code>。
          <br />
          <span style={{ fontSize: 12 }}>
            内置处理器：<code>echo</code> → <code>payload.message</code>； <code>fetch_title</code>{' '}
            → <code>payload.url</code>； <code>capture_source_snapshot</code> → 抓取 URL 并保存
            source snapshot； <code>create_draft</code> → 与「新建草稿」同字段；{' '}
            <code>pipeline_url_draft</code> → <code>url</code> + <code>slug</code> +{' '}
            <code>summary</code> + <code>industryKey</code>，并自动保存 snapshot + 附一条
            evidence； <code>upsert_embedding_stub</code> →{' '}
            <code>payload.caseId</code>（需 PG，演示向量）；其它 为 noop。长时间{' '}
            <code>running</code> 可用下方「回收卡住」重置为 <code>queued</code>。
          </span>
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          <span style={{ color: '#8a96b0' }}>入库筛选：</span>
          <Link href={adminReviewsHref(raw)} style={{ color: '#9fb3ff' }}>
            全部
          </Link>
          {(['queued', 'running', 'succeeded', 'failed'] as const).map((s) => (
            <Link
              key={s}
              href={adminReviewsHref(raw, s)}
              style={{
                color: '#9fb3ff',
                fontWeight: pickSearchParam(raw.ingestionStatus) === s ? 700 : 400,
              }}
            >
              {s}
            </Link>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'flex-end',
            marginBottom: 20,
          }}
        >
          <form action={processNextIngestionJob}>
            <button
              type="submit"
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid #3d5a8a',
                background: '#152238',
                color: '#9fb3ff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              处理下一条
            </button>
          </form>
          <form
            action={reclaimStaleIngestionJobs}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
          >
            <label style={{ ...fieldStyle, margin: 0 }}>
              运行超过（分钟）仍 running → 重置 queued
              <input
                name="maxRunningMinutes"
                type="number"
                min={1}
                max={10080}
                defaultValue={30}
                style={{ ...inputLike, width: 88 }}
              />
            </label>
            <button
              type="submit"
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid #5a4d3d',
                background: '#231a15',
                color: '#ffc49f',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              回收卡住
            </button>
          </form>
        </div>
        <details
          style={{
            marginBottom: 16,
            fontSize: 12,
            color: '#8a96b0',
            maxWidth: 560,
          }}
        >
          <summary style={{ cursor: 'pointer', color: '#9fb3ff', marginBottom: 8 }}>
            payload 示例（复制到下方 JSON）
          </summary>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 10,
              background: '#0b1020',
              border: '1px solid #1d2746',
              overflow: 'auto',
              lineHeight: 1.45,
            }}
          >
            {`echo → {"message":"ping"}
fetch_title → {"url":"https://example.com"}
capture_source_snapshot → {"url":"https://example.com/post"}
pipeline_url_draft → {"url":"https://example.com/post","slug":"my-startup","summary":"...","industryKey":"saas"}
upsert_embedding_stub → {"caseId":"<已发布 case 的 uuid>"}`}
          </pre>
        </details>
        <form
          action={enqueueIngestionJob}
          style={{
            display: 'grid',
            gap: 12,
            maxWidth: 560,
            marginBottom: 24,
          }}
        >
          <label style={fieldStyle}>
            来源 sourceName
            <input
              name="sourceName"
              required
              placeholder="如 rss / manual_upload"
              style={inputLike}
            />
          </label>
          <label style={fieldStyle}>
            触发类型 triggerType
            <input
              name="triggerType"
              required
              placeholder="如 scheduled / admin"
              style={inputLike}
            />
          </label>
          <label style={fieldStyle}>
            payload（可选 JSON 对象）
            <textarea
              name="payloadJson"
              rows={3}
              placeholder='{"url":"https://..."} 或 create_draft 的 slug/companyName/summary/industryKey'
              style={{ ...inputLike, resize: 'vertical', fontFamily: 'monospace' }}
            />
          </label>
          <button
            type="submit"
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: '#5b7cff',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              justifySelf: 'start',
            }}
          >
            入队
          </button>
        </form>
        {ingestion.ok === false && ingestion.reason === 'bad_response' ? (
          <p style={{ color: '#c8d0e5', fontSize: 14 }}>无法拉取任务列表。</p>
        ) : null}
        {ingestion.ok && ingestion.data.items.length === 0 ? (
          <p style={{ color: '#c8d0e5', fontSize: 14 }}>尚无任务。</p>
        ) : null}
        {ingestion.ok && ingestion.data.items.length > 0 ? (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 10,
              fontSize: 13,
              color: '#c8d0e5',
            }}
          >
            {ingestion.data.items.map((j) => (
              <li
                key={j.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #1d2746',
                  background: '#0d1428',
                }}
              >
                <span style={{ color: '#9fb3ff' }}>{j.status}</span>
                {' · '}
                {j.sourceName} / {j.triggerType}
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: '#8a96b0',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <code>{j.id}</code>
                  <span>·</span>
                  <span>{j.createdAt}</span>
                  <Link
                    href={`/admin/ingestion-jobs/${j.id}`}
                    style={{ color: '#7d9cff', fontWeight: 600 }}
                  >
                    详情
                  </Link>
                </div>
                {j.errorMessage ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: '#ff9f9f',
                      wordBreak: 'break-word',
                    }}
                  >
                    {j.errorMessage}
                  </div>
                ) : null}
                {j.status === 'failed' ? (
                  <form action={requeueIngestionJob} style={{ marginTop: 10 }}>
                    <input type="hidden" name="jobId" value={j.id} />
                    <button
                      type="submit"
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid #3d5a8a',
                        background: '#152238',
                        color: '#9fb3ff',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      重新入队
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section
        style={{
          marginTop: 48,
          padding: 20,
          borderRadius: 16,
          border: '1px solid #1d2746',
          background: '#10172b',
        }}
      >
        <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>来源快照（最近 8 条）</h2>
        <p style={{ color: '#8a96b0', fontSize: 13, marginBottom: 16 }}>
          记录抓取时刻的 URL、标题、摘要和内容 hash，便于追查 ingestion 来源与后续抽取质量。
        </p>
        {snapshots.ok === false && snapshots.reason === 'bad_response' ? (
          <p style={{ color: '#c8d0e5', fontSize: 14 }}>暂无快照数据。</p>
        ) : null}
        {snapshots.ok && snapshots.data.items.length === 0 ? (
          <p style={{ color: '#c8d0e5', fontSize: 14 }}>尚无来源快照。</p>
        ) : null}
        {snapshots.ok && snapshots.data.items.length > 0 ? (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 10,
            }}
          >
            {snapshots.data.items.map((snapshot) => (
              <li
                key={snapshot.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #1d2746',
                  background: '#0d1428',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#9fb3ff', fontSize: 12 }}>{snapshot.sourceName}</span>
                  <span style={{ fontSize: 12, color: '#8a96b0' }}>
                    {new Date(snapshot.fetchedAt).toLocaleString('zh-CN')}
                  </span>
                  <span style={{ fontSize: 12, color: '#8a96b0' }}>HTTP {snapshot.httpStatus}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 15, color: '#f5f7fb', fontWeight: 600 }}>
                  {snapshot.title ?? '(无标题)'}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#8a96b0', wordBreak: 'break-all' }}>
                  {snapshot.finalUrl}
                </div>
                {snapshot.excerpt ? (
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: '#c8d0e5', lineHeight: 1.5 }}>
                    {snapshot.excerpt}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section style={{ marginTop: 56, paddingTop: 32, borderTop: '1px solid #1d2746' }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>审计流水（最近 25 条）</h2>
        <p style={{ color: '#8a96b0', fontSize: 13, marginBottom: 16 }}>
          需已执行迁移 <code style={{ color: '#9fb3ff' }}>0002_admin_audit_events.sql</code>
          ；通过/驳回会写入本表。更多见{' '}
          <Link href="/admin/audit" style={{ color: '#7d9cff' }}>
            审计专页
          </Link>
          。
        </p>
        {audit.ok === false && audit.reason === 'unauthorized' ? (
          <p style={{ color: '#ff8a8a' }}>审计接口 401。</p>
        ) : null}
        {audit.ok === false && audit.reason === 'bad_response' ? (
          <p style={{ color: '#c8d0e5' }}>暂无审计数据或表未创建。</p>
        ) : null}
        {audit.ok && audit.data.items.length === 0 ? (
          <p style={{ color: '#c8d0e5' }}>尚无审计事件。</p>
        ) : null}
        {audit.ok && audit.data.items.length > 0 ? (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 10,
              fontSize: 13,
              color: '#c8d0e5',
            }}
          >
            {audit.data.items.map((row) => (
              <li
                key={row.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #1d2746',
                  background: '#0d1428',
                }}
              >
                <span style={{ color: '#9fb3ff' }}>{row.action}</span>
                <span style={{ marginLeft: 10, opacity: 0.85 }}>
                  {new Date(row.createdAt).toLocaleString('zh-CN')}
                </span>
                <div style={{ marginTop: 6, wordBreak: 'break-all', opacity: 0.9 }}>
                  review {row.reviewId ?? '—'} · case {row.caseId ?? '—'}
                </div>
                {Object.keys(row.metadata).length > 0 ? (
                  <pre
                    style={{
                      margin: '8px 0 0',
                      fontSize: 11,
                      overflow: 'auto',
                      opacity: 0.75,
                    }}
                  >
                    {JSON.stringify(row.metadata, null, 0)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
