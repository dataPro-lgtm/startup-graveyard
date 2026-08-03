import { type AdminStats, formatUsd } from '@/lib/statsApi';
import type { DashboardMetrics } from '../metrics';
import { BarRow, ChartCard, EmptyState, KpiCard } from '../primitives';
import {
  formatCompactUsd,
  formatDateTime,
  formatPercent,
  platformAlertSeverityColor,
  platformAlertSeverityLabel,
  workerStatusLabel,
  workerTickOutcomeLabel,
} from '../formatters';

export function OpsOverviewSection({ stats, m }: { stats: AdminStats; m: DashboardMetrics }) {
  const {
    platformStats,
    subscriptionStats,
    billingFunnelStats,
    researchStats,
    teamStats,
    playbookStats,
    maxPlatformAlertMetric,
    groundedRate,
  } = m;
  return (
    <>
      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        <KpiCard
          label="已发布案例"
          value={String(stats.totalPublished)}
          sub={`草稿 ${stats.totalDraft} 篇`}
          color="#5b7cff"
        />
        <KpiCard
          label="总融资蒸发"
          value={formatUsd(stats.totalFundingUsd)}
          sub={`均值 ${formatUsd(stats.avgFundingUsd)}`}
          color="#f87171"
        />
        <KpiCard
          label="待审核"
          value={String(stats.pendingReviews)}
          sub="条待处理 Review"
          color="#fbbf24"
          href="/admin/reviews"
        />
        <KpiCard
          label="摄取队列"
          value={String(stats.ingestionStats.pending + stats.ingestionStats.running)}
          sub={`失败 ${stats.ingestionStats.failed} / 完成 ${stats.ingestionStats.completed}`}
          color="#34d399"
          href="/admin/reviews"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        <KpiCard
          label="活跃付费用户"
          value={String(subscriptionStats.activePaidUsers)}
          sub={`付费转化 ${formatPercent(subscriptionStats.paidConversionRate)}`}
          color="#10b981"
        />
        <KpiCard
          label="Team 占比"
          value={formatPercent(subscriptionStats.teamMixRate)}
          sub={`Team ${subscriptionStats.teamUsers} / Pro ${subscriptionStats.proUsers}`}
          color="#22c55e"
        />
        <KpiCard
          label="研究激活"
          value={formatPercent(researchStats.researchActivationRate)}
          sub={`${researchStats.activeResearchUsers} 个付费活跃研究用户`}
          color="#0ea5e9"
        />
        <KpiCard
          label="分享激活"
          value={formatPercent(researchStats.reportShareActivationRate)}
          sub={`${researchStats.reportShareUsers} 个用户发出 brief`}
          color="#a855f7"
        />
        <KpiCard
          label="Checkout 发起"
          value={String(billingFunnelStats.checkoutStarts)}
          sub={`Team ${billingFunnelStats.teamCheckoutStarts} / Pro ${billingFunnelStats.proCheckoutStarts}`}
          color="#6366f1"
        />
        <KpiCard
          label="结账完成率"
          value={formatPercent(billingFunnelStats.checkoutCompletionRate)}
          sub={`完成 ${billingFunnelStats.checkoutCompletions} 次`}
          color="#14b8a6"
        />
        <KpiCard
          label="订阅恢复"
          value={String(billingFunnelStats.recoveredSubscriptions)}
          sub={`portal ${billingFunnelStats.portalStarts} 次`}
          color="#f97316"
        />
        <KpiCard
          label="Team Workspaces"
          value={String(teamStats.totalWorkspaces)}
          sub={`活跃 ${teamStats.activeWorkspaces} 个`}
          color="#22c55e"
        />
        <KpiCard
          label="Seat 利用率"
          value={formatPercent(teamStats.seatUtilizationRate)}
          sub={`${teamStats.reservedSeats}/${teamStats.totalSeatCapacity} 已占用`}
          color="#38bdf8"
        />
        <KpiCard
          label="待处理邀请"
          value={String(teamStats.pendingInvites)}
          sub={`继承团队权限成员 ${teamStats.inheritedMembers}`}
          color="#f59e0b"
        />
        <KpiCard
          label="账单补偿"
          value={String(teamStats.revokedInvites)}
          sub={`回退成员 ${teamStats.fallbackMembers}`}
          color="#ef4444"
        />
        <KpiCard
          label="风险工作区"
          value={String(teamStats.atRiskWorkspaces)}
          sub={`满席 ${teamStats.fullWorkspaces} 个`}
          color="#f87171"
        />
        <KpiCard
          label="待恢复动作"
          value={String(teamStats.workspacesRequiringAction)}
          sub={`${teamStats.recoveryActions.length} 类账单恢复动作`}
          color="#fb7185"
        />
        <KpiCard
          label="Playbook Runs"
          value={String(playbookStats.totalRuns)}
          sub={
            playbookStats.lastRunAt
              ? `失败 ${playbookStats.failedRuns} · 最近 ${formatDateTime(playbookStats.lastRunAt)}`
              : `失败 ${playbookStats.failedRuns} 次`
          }
          color="#c084fc"
        />
        <KpiCard
          label="Copilot 运行数"
          value={String(stats.copilot.overview.totalRuns)}
          sub={`${stats.copilot.overview.totalSessions} 个研究线程`}
          color="#8b5cf6"
        />
        <KpiCard
          label="Grounded Rate"
          value={formatPercent(groundedRate)}
          sub={`fallback ${stats.copilot.overview.fallbackRuns} 次`}
          color="#38bdf8"
        />
        <KpiCard
          label="反馈 Eval"
          value={formatPercent(stats.copilot.feedbackEval.positiveRate)}
          sub={`👍 ${stats.copilot.feedbackEval.helpful} / 👎 ${stats.copilot.feedbackEval.needsImprovement}`}
          color="#34d399"
        />
        <KpiCard
          label="Copilot 成本"
          value={formatCompactUsd(stats.copilot.overview.totalEstimatedCostUsd)}
          sub={`均值 ${stats.copilot.overview.avgResponseMs} ms · ${stats.copilot.overview.avgTotalTokens} tok`}
          color="#f59e0b"
        />
        <KpiCard
          label="Eval Dataset"
          value={String(stats.copilot.evals.overview.activeCases)}
          sub={`${stats.copilot.evals.overview.totalBatches} 个回放批次`}
          color="#22c55e"
        />
        <KpiCard
          label="Latest Eval"
          value={formatPercent(stats.copilot.evals.overview.latestPassRate)}
          sub={
            stats.copilot.evals.overview.latestPromptVersion
              ? `prompt ${stats.copilot.evals.overview.latestPromptVersion}`
              : '尚未运行回放'
          }
          color="#14b8a6"
        />
        <KpiCard
          label="平台告警"
          value={String(platformStats.alerts.length)}
          sub={`严重 ${platformStats.alertSummary.critical} / 警告 ${platformStats.alertSummary.warning}`}
          color="#fb7185"
        />
        <KpiCard
          label="失败任务"
          value={String(platformStats.ingestion.recentFailedCount)}
          sub={
            platformStats.ingestion.recentFailed[0]
              ? `最新 ${platformStats.ingestion.recentFailed[0].sourceName}`
              : '近期待处理失败任务为 0'
          }
          color="#f97316"
        />
        <KpiCard
          label="Stale Running"
          value={String(platformStats.ingestion.staleRunningCount)}
          sub={`${platformStats.ingestion.runningCount} running · 阈值 ${platformStats.ingestion.staleThresholdMinutes}m`}
          color="#ef4444"
        />
        <KpiCard
          label="Queue Backlog"
          value={
            platformStats.ingestion.oldestQueuedAgeMinutes != null
              ? `${platformStats.ingestion.oldestQueuedAgeMinutes}m`
              : 'Healthy'
          }
          sub={`${platformStats.ingestion.queuedCount} queued · 1h 完成 ${platformStats.ingestion.completedLastHour}`}
          color={
            platformStats.ingestion.oldestQueuedAgeMinutes != null &&
            platformStats.ingestion.oldestQueuedAgeMinutes >= 60
              ? '#fb7185'
              : platformStats.ingestion.oldestQueuedAgeMinutes != null &&
                  platformStats.ingestion.oldestQueuedAgeMinutes >= 15
                ? '#f59e0b'
                : '#22c55e'
          }
        />
        <KpiCard
          label="Worker"
          value={workerStatusLabel(platformStats.worker.status)}
          sub={
            platformStats.worker.lastProcessedAt
              ? `最近处理 ${formatDateTime(platformStats.worker.lastProcessedAt)}`
              : '尚未处理队列'
          }
          color={
            platformStats.worker.status === 'error' || platformStats.worker.consecutiveErrors > 0
              ? '#fb7185'
              : platformStats.worker.status === 'processing'
                ? '#f59e0b'
                : '#22c55e'
          }
        />
        <KpiCard
          label="Scheduler"
          value={workerStatusLabel(platformStats.scheduler.status)}
          sub={
            platformStats.scheduler.lastEnqueuedAt
              ? `最近派发 ${formatDateTime(platformStats.scheduler.lastEnqueuedAt)}`
              : '尚未自动派发任务'
          }
          color={
            platformStats.scheduler.status === 'error' ||
            platformStats.scheduler.consecutiveErrors > 0
              ? '#fb7185'
              : platformStats.scheduler.status === 'processing'
                ? '#f59e0b'
                : '#22c55e'
          }
        />
        <KpiCard
          label="Runtime"
          value={platformStats.runtime.features.mockMode ? 'Mock' : 'Live'}
          sub={`${platformStats.runtime.env} · ${platformStats.runtime.features.aiProvider}`}
          color="#6366f1"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr', gap: 20 }}>
        <ChartCard title="Platform Runtime">
          <div style={{ display: 'grid', gap: 12 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 10,
              }}
            >
              {[
                ['Service', platformStats.runtime.service],
                ['Env', platformStats.runtime.env],
                ['Node', platformStats.runtime.nodeVersion],
                ['Uptime', `${Math.floor(platformStats.runtime.uptimeSeconds / 60)} min`],
                ['Generated At', formatDateTime(platformStats.runtime.generatedAt)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    border: '1px solid #24314f',
                    borderRadius: 12,
                    background: '#0d1426',
                    padding: '12px 14px',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ color: '#8a96b0', fontSize: 12 }}>{label}</div>
                  <div style={{ color: '#eef2ff', fontWeight: 700, fontSize: 13 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {[
                [
                  'Database',
                  platformStats.runtime.features.dbConfigured ? 'Configured' : 'Missing',
                  platformStats.runtime.features.dbConfigured ? '#22c55e' : '#fb7185',
                ],
                [
                  'Admin API',
                  platformStats.runtime.features.adminEnabled ? 'Enabled' : 'Disabled',
                  platformStats.runtime.features.adminEnabled ? '#22c55e' : '#fb7185',
                ],
                [
                  'Stripe',
                  platformStats.runtime.features.stripeEnabled ? 'Enabled' : 'Disabled',
                  platformStats.runtime.features.stripeEnabled ? '#22c55e' : '#f59e0b',
                ],
                [
                  'AI Provider',
                  platformStats.runtime.features.aiProvider,
                  platformStats.runtime.features.aiProvider === 'none' ? '#f59e0b' : '#38bdf8',
                ],
                [
                  'Mode',
                  platformStats.runtime.features.mockMode ? 'Mock repositories' : 'PostgreSQL',
                  platformStats.runtime.features.mockMode ? '#f59e0b' : '#22c55e',
                ],
                [
                  'Worker',
                  workerStatusLabel(platformStats.worker.status),
                  platformStats.worker.status === 'error' ||
                  platformStats.worker.consecutiveErrors > 0
                    ? '#fb7185'
                    : platformStats.worker.status === 'processing'
                      ? '#f59e0b'
                      : '#22c55e',
                ],
                [
                  'Scheduler',
                  workerStatusLabel(platformStats.scheduler.status),
                  platformStats.scheduler.status === 'error' ||
                  platformStats.scheduler.consecutiveErrors > 0
                    ? '#fb7185'
                    : platformStats.scheduler.status === 'processing'
                      ? '#f59e0b'
                      : '#22c55e',
                ],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    border: '1px solid #24314f',
                    borderRadius: 12,
                    background: '#0d1426',
                    padding: '10px 14px',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: '#8a96b0' }}>{label}</span>
                  <span style={{ color, fontWeight: 700 }}>{value}</span>
                </div>
              ))}
            </div>
            <div
              style={{
                border: '1px solid #24314f',
                borderRadius: 12,
                background: '#0d1426',
                padding: '12px 14px',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>Ingestion Worker Health</div>
              <div style={{ color: '#d7deef', fontSize: 13 }}>
                已处理 {platformStats.worker.processedJobs} 条任务
                {platformStats.worker.lastProcessedSourceName
                  ? ` · 最近 ${platformStats.worker.lastProcessedSourceName}`
                  : ''}
                {platformStats.worker.lastProcessedJobStatus
                  ? ` (${platformStats.worker.lastProcessedJobStatus})`
                  : ''}
              </div>
              <div style={{ color: '#8a96b0', fontSize: 12 }}>
                source {platformStats.worker.source} · instance{' '}
                {platformStats.worker.instanceId ?? 'local'} · heartbeat{' '}
                {formatDateTime(platformStats.worker.heartbeatAt)}
              </div>
              <div style={{ color: '#8a96b0', fontSize: 12 }}>
                启动 {formatDateTime(platformStats.worker.startedAt)} · 最近 tick 开始{' '}
                {formatDateTime(platformStats.worker.lastTickStartedAt)} · 最近 tick 完成{' '}
                {formatDateTime(platformStats.worker.lastTickCompletedAt)}
              </div>
              <div style={{ color: '#8a96b0', fontSize: 12 }}>
                poll {Math.floor(platformStats.worker.pollIntervalMs / 1000)}s · start delay{' '}
                {Math.floor(platformStats.worker.startDelayMs / 1000)}s · max jobs/tick{' '}
                {platformStats.worker.maxJobsPerTick}
                {platformStats.worker.consecutiveErrors > 0
                  ? ` · consecutive errors ${platformStats.worker.consecutiveErrors}`
                  : ''}
              </div>
              {platformStats.worker.lastError ? (
                <div style={{ color: '#fecaca', fontSize: 12 }}>
                  最近错误：{platformStats.worker.lastError}
                </div>
              ) : null}
            </div>
            <div
              style={{
                border: '1px solid #24314f',
                borderRadius: 12,
                background: '#0d1426',
                padding: '12px 14px',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>Scheduler Health</div>
              <div style={{ color: '#d7deef', fontSize: 13 }}>
                已派发 {platformStats.scheduler.enqueuedJobs} 条任务 · 状态{' '}
                {workerStatusLabel(platformStats.scheduler.status)}
              </div>
              <div style={{ color: '#8a96b0', fontSize: 12 }}>
                source {platformStats.scheduler.source} · instance{' '}
                {platformStats.scheduler.instanceId ?? 'local'} · heartbeat{' '}
                {formatDateTime(platformStats.scheduler.heartbeatAt)}
              </div>
              <div style={{ color: '#8a96b0', fontSize: 12 }}>
                启动 {formatDateTime(platformStats.scheduler.startedAt)} · 最近 tick{' '}
                {formatDateTime(platformStats.scheduler.lastTickCompletedAt)} · 最近派发{' '}
                {formatDateTime(platformStats.scheduler.lastEnqueuedAt)}
              </div>
              {platformStats.scheduler.lastError ? (
                <div style={{ color: '#fecaca', fontSize: 12 }}>
                  最近错误：{platformStats.scheduler.lastError}
                </div>
              ) : null}
            </div>
            <div
              style={{
                border: '1px solid #24314f',
                borderRadius: 12,
                background: '#0d1426',
                padding: '12px 14px',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>Recent Worker Heartbeats</div>
              {platformStats.worker.recentTicks.length === 0 ? (
                <div style={{ color: '#8a96b0', fontSize: 12 }}>
                  当前还没有 heartbeat 历史，说明 worker 尚未真正跑过一个 tick。
                </div>
              ) : (
                platformStats.worker.recentTicks.map((tick) => (
                  <div
                    key={`${tick.startedAt}-${tick.completedAt}-${tick.outcome}`}
                    style={{
                      border: '1px solid #24314f',
                      borderRadius: 10,
                      background: '#10192e',
                      padding: '10px 12px',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ color: '#eef2ff', fontWeight: 700, fontSize: 12 }}>
                        {workerTickOutcomeLabel(tick.outcome)}
                      </span>
                      <span
                        style={{
                          color: tick.outcome === 'error' ? '#fb7185' : '#8a96b0',
                          fontSize: 12,
                        }}
                      >
                        {tick.processedCount} jobs
                      </span>
                    </div>
                    <div style={{ color: '#8a96b0', fontSize: 12 }}>
                      开始 {formatDateTime(tick.startedAt)} · 完成{' '}
                      {formatDateTime(tick.completedAt)}
                    </div>
                    <div style={{ color: '#d7deef', fontSize: 12 }}>
                      {tick.lastJobSourceName
                        ? `${tick.lastJobSourceName}${tick.lastJobStatus ? ` (${tick.lastJobStatus})` : ''}`
                        : '本次 tick 没有处理具体 job'}
                    </div>
                    {tick.error ? (
                      <div style={{ color: '#fecaca', fontSize: 12 }}>错误：{tick.error}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div
              style={{
                border: '1px solid #24314f',
                borderRadius: 12,
                background: '#0d1426',
                padding: '12px 14px',
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>Stripe Webhook Reliability</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: 8,
                }}
              >
                {[
                  ['Processed', platformStats.stripeWebhooks.processed, '#22c55e'],
                  ['Processing', platformStats.stripeWebhooks.processing, '#38bdf8'],
                  ['Failed', platformStats.stripeWebhooks.failed, '#fb7185'],
                  ['Retried', platformStats.stripeWebhooks.retried, '#f59e0b'],
                  ['Stale leases', platformStats.stripeWebhooks.staleProcessing, '#f97316'],
                ].map(([label, value, color]) => (
                  <div
                    key={String(label)}
                    style={{
                      border: '1px solid #24314f',
                      borderRadius: 10,
                      background: '#10192e',
                      padding: '9px 10px',
                    }}
                  >
                    <div style={{ color: '#8a96b0', fontSize: 11 }}>{label}</div>
                    <div style={{ color: String(color), fontWeight: 800, fontSize: 18 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ color: '#8a96b0', fontSize: 12 }}>
                Total {platformStats.stripeWebhooks.total} · last received{' '}
                {formatDateTime(platformStats.stripeWebhooks.lastReceivedAt)}
              </div>
              {platformStats.stripeWebhooks.recentFailures.map((failure) => (
                <div
                  key={failure.eventId}
                  style={{
                    border: '1px solid #4b2430',
                    borderRadius: 10,
                    background: '#23131a',
                    padding: '9px 11px',
                    color: '#fecdd3',
                    fontSize: 12,
                  }}
                >
                  {failure.eventType} · attempt {failure.attemptCount} · {failure.lastError}
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Platform Alerts">
          {platformStats.alerts.length === 0 ? (
            <EmptyState text="当前没有平台级告警，运行态和恢复链看起来是健康的。" compact />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <BarRow
                label="Critical"
                value={platformStats.alertSummary.critical}
                max={maxPlatformAlertMetric}
                color="#fb7185"
                sub="需要立即处理的基础设施/恢复链问题"
              />
              <BarRow
                label="Warning"
                value={platformStats.alertSummary.warning}
                max={maxPlatformAlertMetric}
                color="#f59e0b"
                sub="功能可运行，但当前环境或链路存在明显风险"
              />
              <BarRow
                label="Info"
                value={platformStats.alertSummary.info}
                max={maxPlatformAlertMetric}
                color="#38bdf8"
                sub="提示性状态，暂不阻断主链"
              />
              {platformStats.alerts.map((alert) => (
                <div
                  key={`${alert.code}-${alert.title}`}
                  style={{
                    border: `1px solid ${platformAlertSeverityColor(alert.severity)}`,
                    borderRadius: 12,
                    background: '#0d1426',
                    padding: '12px 14px',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 700 }}>{alert.title}</div>
                    <div
                      style={{
                        color: platformAlertSeverityColor(alert.severity),
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {platformAlertSeverityLabel(alert.severity)}
                    </div>
                  </div>
                  <div style={{ color: '#d7deef', fontSize: 13 }}>{alert.detail}</div>
                  <div style={{ color: '#8a96b0', fontSize: 12 }}>
                    code: {alert.code}
                    {alert.href ? ` · 建议入口 ${alert.href}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}
