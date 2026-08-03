import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { type AdminStats, fetchAdminStats } from '@/lib/statsApi';
import { pickSearchParam } from '@/lib/searchParams';

export const metadata: Metadata = { title: '运营 Dashboard' };

// Revalidate every 60 s — shows near-real-time data without hammering the DB
export const revalidate = 60;

import { deriveDashboardMetrics } from './metrics';
import { OpsOverviewSection } from './sections/OpsOverviewSection';
import { SnapshotOpsSection } from './sections/SnapshotOpsSection';
import { TeamRecoverySection } from './sections/TeamRecoverySection';
import { CommercialCardsSection } from './sections/CommercialCardsSection';
import { ContentInsightsSection } from './sections/ContentInsightsSection';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const recoveryPlaybook = pickSearchParam(raw.recoveryPlaybook);
  const recoveryPlaybookError = pickSearchParam(raw.recoveryPlaybookError);
  const recoveryPlaybookRerun = pickSearchParam(raw.recoveryPlaybookRerun);
  const recoveryPlaybookRerunError = pickSearchParam(raw.recoveryPlaybookRerunError);
  const recoveryEmail = pickSearchParam(raw.recoveryEmail);
  const recoveryEmailError = pickSearchParam(raw.recoveryEmailError);
  const recoveryMemberEmail = pickSearchParam(raw.recoveryMemberEmail);
  const recoveryMemberEmailError = pickSearchParam(raw.recoveryMemberEmailError);
  const recoveryCrm = pickSearchParam(raw.recoveryCrm);
  const recoveryCrmError = pickSearchParam(raw.recoveryCrmError);
  const recoveryWebhook = pickSearchParam(raw.recoveryWebhook);
  const recoveryWebhookError = pickSearchParam(raw.recoveryWebhookError);
  const recoverySlack = pickSearchParam(raw.recoverySlack);
  const recoverySlackError = pickSearchParam(raw.recoverySlackError);
  const reclaimStale = pickSearchParam(raw.reclaimStale);
  const reclaimStaleError = pickSearchParam(raw.reclaimStaleError);
  const platformSnapshot = pickSearchParam(raw.platformSnapshot);
  const platformSnapshotError = pickSearchParam(raw.platformSnapshotError);
  const stats = await fetchAdminStats();
  void headers();

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 80px' }}>
      {/* Breadcrumb */}
      <div
        style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 28, fontSize: 13 }}
      >
        <Link href="/admin/reviews" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
          ← 运营台
        </Link>
        <span style={{ color: '#4a5568' }}>Dashboard</span>
        <Link
          href="/admin/recovery-queue.csv"
          style={{ color: '#9fb3ff', textDecoration: 'none', marginLeft: 'auto' }}
        >
          导出 Recovery Queue CSV
        </Link>
        <Link
          href="/admin/platform-snapshot-report.csv"
          style={{ color: '#9fb3ff', textDecoration: 'none' }}
        >
          导出 Platform Snapshot CSV
        </Link>
        <Link
          href="/admin/platform-snapshot-brief.md"
          style={{ color: '#9fb3ff', textDecoration: 'none' }}
        >
          导出 Platform Snapshot Brief
        </Link>
        <form action="/admin/recovery-handoffs.csv" method="post" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              border: '1px solid #3b4a72',
              background: '#12192b',
              color: '#9fb3ff',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            导出 CRM Handoff CSV
          </button>
        </form>
        <form action="/admin/recovery-handoffs/crm" method="post" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              border: '1px solid #0f766e',
              background: '#0d2322',
              color: '#99f6e4',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            同步 CRM Case
          </button>
        </form>
        <form action="/admin/recovery-playbook" method="post" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              border: '1px solid #b45309',
              background: '#2a1b0b',
              color: '#fde68a',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            运行 Recovery Playbook
          </button>
        </form>
        <form action="/admin/recovery-owner-email" method="post" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              border: '1px solid #7c3aed',
              background: '#20123d',
              color: '#ddd6fe',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            发送 Owner 恢复邮件
          </button>
        </form>
        <form action="/admin/recovery-member-email" method="post" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              border: '1px solid #2563eb',
              background: '#13233f',
              color: '#bfdbfe',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            发送成员回退通知
          </button>
        </form>
        <form action="/admin/recovery-handoffs/webhook" method="post" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              border: '1px solid #1f4d38',
              background: '#10251b',
              color: '#a7f3d0',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            推送 CRM Webhook
          </button>
        </form>
        <form action="/admin/recovery-handoffs/slack" method="post" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              border: '1px solid #4c1d95',
              background: '#1f1535',
              color: '#d8b4fe',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            通知 Ops Slack
          </button>
        </form>
        <form action="/admin/ingestion-jobs/reclaim-stale" method="post" style={{ margin: 0 }}>
          <input type="hidden" name="maxRunningMinutes" value="30" />
          <button
            type="submit"
            style={{
              border: '1px solid #7f1d1d',
              background: '#2b1414',
              color: '#fecaca',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            回收 Stale Jobs
          </button>
        </form>
        <form action="/admin/platform-snapshot" method="post" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              border: '1px solid #334155',
              background: '#111827',
              color: '#cbd5e1',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            捕获 Platform Snapshot
          </button>
        </form>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 32px' }}>运营数据 Dashboard</h1>

      {recoveryPlaybook ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #b45309',
            background: '#2a1b0b',
            color: '#fde68a',
            fontSize: 13,
          }}
        >
          Recovery playbook 已执行：{recoveryPlaybook}
        </div>
      ) : null}
      {recoveryPlaybookError ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4b2430',
            background: '#23131a',
            color: '#fecdd3',
            fontSize: 13,
          }}
        >
          Recovery playbook 执行失败：{recoveryPlaybookError}
        </div>
      ) : null}
      {recoveryPlaybookRerun ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #0f766e',
            background: '#0d2322',
            color: '#99f6e4',
            fontSize: 13,
          }}
        >
          已补跑失败步骤：{recoveryPlaybookRerun}
        </div>
      ) : null}
      {recoveryPlaybookRerunError ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4b2430',
            background: '#23131a',
            color: '#fecdd3',
            fontSize: 13,
          }}
        >
          Recovery playbook 失败步骤补跑失败：{recoveryPlaybookRerunError}
        </div>
      ) : null}
      {recoveryEmail ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #7c3aed',
            background: '#20123d',
            color: '#e9d5ff',
            fontSize: 13,
          }}
        >
          {recoveryEmail === 'no_owner_outreach'
            ? '当前没有需要发送恢复邮件的 owner outreach。'
            : recoveryEmail === 'already_delivered'
              ? '当前 owner recovery outreach 对应的本轮邮件已经全部发出；如需立即补发，可再次点击页顶按钮。'
              : recoveryEmail === 'no_due_owner_outreach'
                ? '当前没有到点需要自动重试的 owner recovery 邮件；如需立即补发，可再次点击页顶按钮。'
                : `已向 owner 发送 ${recoveryEmail} 封恢复邮件。`}
        </div>
      ) : null}
      {recoveryEmailError ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4b2430',
            background: '#23131a',
            color: '#fecdd3',
            fontSize: 13,
          }}
        >
          Owner 恢复邮件发送失败：{recoveryEmailError}
        </div>
      ) : null}
      {recoveryMemberEmail ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #2563eb',
            background: '#13233f',
            color: '#dbeafe',
            fontSize: 13,
          }}
        >
          {recoveryMemberEmail === 'no_member_notifications'
            ? '当前没有需要发送给成员的回退通知。'
            : recoveryMemberEmail === 'already_delivered'
              ? '当前成员回退通知在本轮里已经全部发出；如需立即补发，可再次点击页顶按钮。'
              : recoveryMemberEmail === 'no_due_member_notifications'
                ? '当前没有到点需要自动重试的成员回退邮件；如需立即补发，可再次点击页顶按钮。'
                : `已向成员发送 ${recoveryMemberEmail} 封回退通知邮件。`}
        </div>
      ) : null}
      {recoveryMemberEmailError ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4b2430',
            background: '#23131a',
            color: '#fecdd3',
            fontSize: 13,
          }}
        >
          成员回退通知发送失败：{recoveryMemberEmailError}
        </div>
      ) : null}
      {recoveryCrm ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #0f766e',
            background: '#0d2322',
            color: '#99f6e4',
            fontSize: 13,
          }}
        >
          {recoveryCrm === 'no_crm_handoffs'
            ? '当前没有 `handoff_channel=crm` 的恢复项。'
            : recoveryCrm === 'already_synced'
              ? '当前 CRM handoff 已经完成同步；如需重新下发，可再次点击页顶按钮。'
              : recoveryCrm === 'no_due_crm_handoffs'
                ? '当前没有到点需要自动重试的 CRM handoff；如需立即重推，可再次点击页顶按钮。'
                : `已向 CRM API 同步 ${recoveryCrm} 条 recovery case。`}
        </div>
      ) : null}
      {recoveryCrmError ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4b2430',
            background: '#23131a',
            color: '#fecdd3',
            fontSize: 13,
          }}
        >
          CRM API 同步失败：{recoveryCrmError}
        </div>
      ) : null}
      {recoveryWebhook ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #1f4d38',
            background: '#10251b',
            color: '#a7f3d0',
            fontSize: 13,
          }}
        >
          {recoveryWebhook === 'no_handoffs'
            ? '当前没有需要推送到外部 webhook 的 handoff。'
            : recoveryWebhook === 'no_due_handoffs'
              ? '当前没有到点需要自动重试的 webhook handoff；如需立即重推，直接再次点击页顶按钮即可。'
              : recoveryWebhook === 'no_retryable_handoffs'
                ? '当前可自动重试的 webhook handoff 已经耗尽重试次数，需要人工强制重推或先排查 CRM endpoint。'
                : `已向外部 webhook 推送 ${recoveryWebhook} 条 recovery handoff。`}
        </div>
      ) : null}
      {recoveryWebhookError ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4b2430',
            background: '#23131a',
            color: '#fecdd3',
            fontSize: 13,
          }}
        >
          Recovery webhook 推送失败：{recoveryWebhookError}
        </div>
      ) : null}
      {recoverySlack ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4c1d95',
            background: '#1f1535',
            color: '#e9d5ff',
            fontSize: 13,
          }}
        >
          {recoverySlack === 'no_dead_letter_handoffs'
            ? '当前没有需要通知 Ops Slack 的 webhook dead-letter handoff。'
            : recoverySlack === 'already_alerted'
              ? '当前 dead-letter handoff 已经完成 Ops Slack 告警；如需重复提醒，可再次点击页顶按钮。'
              : `已向 Ops Slack 发送 ${recoverySlack} 条 dead-letter 告警。`}
        </div>
      ) : null}
      {recoverySlackError ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4b2430',
            background: '#23131a',
            color: '#fecdd3',
            fontSize: 13,
          }}
        >
          Ops Slack 告警失败：{recoverySlackError}
        </div>
      ) : null}
      {reclaimStale ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #7f1d1d',
            background: '#2b1414',
            color: '#fecaca',
            fontSize: 13,
          }}
        >
          {reclaimStale === '0'
            ? '当前没有超过阈值的 stale running jobs。'
            : `已回收 ${reclaimStale} 条 stale running jobs。`}
        </div>
      ) : null}
      {reclaimStaleError ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4b2430',
            background: '#23131a',
            color: '#fecdd3',
            fontSize: 13,
          }}
        >
          回收 stale running jobs 失败：{reclaimStaleError}
        </div>
      ) : null}
      {platformSnapshot ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #334155',
            background: '#111827',
            color: '#cbd5e1',
            fontSize: 13,
          }}
        >
          已捕获平台快照：{platformSnapshot}
        </div>
      ) : null}
      {platformSnapshotError ? (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #4b2430',
            background: '#23131a',
            color: '#fecdd3',
            fontSize: 13,
          }}
        >
          平台快照捕获失败：{platformSnapshotError}
        </div>
      ) : null}

      {!stats ? (
        <p style={{ color: '#f87171' }}>数据加载失败，请检查 API 连接和管理员密钥。</p>
      ) : (
        <DashboardContent stats={stats} />
      )}
    </main>
  );
}

function DashboardContent({ stats }: { stats: AdminStats }) {
  const m = deriveDashboardMetrics(stats);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <OpsOverviewSection stats={stats} m={m} />
      <SnapshotOpsSection stats={stats} m={m} />
      <TeamRecoverySection stats={stats} m={m} />
      <CommercialCardsSection stats={stats} m={m} />
      <ContentInsightsSection stats={stats} m={m} />
    </div>
  );
}
