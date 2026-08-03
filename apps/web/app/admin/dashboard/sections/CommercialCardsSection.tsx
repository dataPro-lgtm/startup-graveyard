import { type AdminStats } from '@/lib/statsApi';
import type { DashboardMetrics } from '../metrics';
import { BarRow, ChartCard, EmptyState } from '../primitives';
import { formatPercent } from '../formatters';

export function CommercialCardsSection({ stats, m }: { stats: AdminStats; m: DashboardMetrics }) {
  const { billingFunnelStats, researchStats, teamStats, maxEvalBatchCases, maxResearchMetric } = m;
  return (
    <>
      <ChartCard title="个人付费工作流激活">
        {researchStats.activeResearchUsers === 0 ? (
          <EmptyState text="当前还没有用户完成 watchlist / saved views / brief share 的付费工作流。" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <BarRow
              label="活跃研究用户"
              value={researchStats.activeResearchUsers}
              max={maxResearchMetric}
              color="#0ea5e9"
              sub={`激活率 ${formatPercent(researchStats.researchActivationRate)}`}
            />
            <BarRow
              label="Watchlist 用户"
              value={researchStats.watchlistUsers}
              max={maxResearchMetric}
              color="#22c55e"
              sub={`${researchStats.watchlistEntries} 条保存 · 人均 ${
                researchStats.avgWatchlistEntriesPerUser?.toFixed(1) ?? 'N/A'
              }`}
            />
            <BarRow
              label="Saved View 用户"
              value={researchStats.savedViewUsers}
              max={maxResearchMetric}
              color="#38bdf8"
              sub={`${researchStats.savedViews} 个视图 · 人均 ${
                researchStats.avgSavedViewsPerUser?.toFixed(1) ?? 'N/A'
              }`}
            />
            <BarRow
              label="Brief 分享用户"
              value={researchStats.reportShareUsers}
              max={maxResearchMetric}
              color="#a855f7"
              sub={`${researchStats.reportShares} 个分享页 · 已访问 ${researchStats.accessedReportShares}`}
            />
          </div>
        )}
      </ChartCard>

      <ChartCard title="最近商业化动作">
        {billingFunnelStats.recentEvents.length === 0 ? (
          <EmptyState text="当前还没有最近的商业化动作记录。发起 checkout、portal 或恢复订阅后，这里会保留最近留痕。" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {billingFunnelStats.recentEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  borderRadius: 12,
                  border: '1px solid #1d2746',
                  background: '#0d1426',
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ color: '#f5f7fb', fontSize: 13, fontWeight: 600 }}>
                    {event.type}
                    {event.plan ? ` · ${event.plan.toUpperCase()}` : ''}
                    {' · '}
                    {event.source === 'team_workspace' ? 'Team Workspace' : '账户页'}
                  </div>
                  <div style={{ color: '#8a96b0', fontSize: 12 }}>
                    {new Date(event.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div style={{ color: '#c8d0e5', fontSize: 12, lineHeight: 1.7 }}>
                  {event.detail}
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Workspace 账单生命周期事件">
        {teamStats.recentBillingEvents.length === 0 ? (
          <EmptyState text="当前还没有团队账单事件。降级补偿、席位恢复和成员权限恢复会在这里留痕。" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {teamStats.recentBillingEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${
                    event.severity === 'critical'
                      ? '#4b2430'
                      : event.severity === 'warning'
                        ? '#5b4a19'
                        : event.severity === 'success'
                          ? '#214635'
                          : '#1f325d'
                  }`,
                  background:
                    event.severity === 'critical'
                      ? '#23131a'
                      : event.severity === 'warning'
                        ? '#241d0d'
                        : event.severity === 'success'
                          ? '#0f2018'
                          : '#10192d',
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ color: '#f5f7fb', fontSize: 13, fontWeight: 600 }}>
                    {event.workspaceName} · {event.title}
                  </div>
                  <div style={{ color: '#8a96b0', fontSize: 12 }}>
                    {new Date(event.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div style={{ color: '#c8d0e5', fontSize: 12, lineHeight: 1.7 }}>
                  {event.detail}
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        <ChartCard title="Copilot Eval 回放批次">
          {stats.copilot.evals.recentBatches.length === 0 ? (
            <EmptyState text="还没有运行 Copilot eval suite。可通过 scheduler trigger 或 nightly job 生成第一批回放数据。" />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {stats.copilot.evals.recentBatches.map((row) => (
                <BarRow
                  key={row.batchId}
                  label={`${row.promptVersion} · ${new Date(row.createdAt).toLocaleDateString('zh-CN')}`}
                  value={row.totalCases}
                  max={maxEvalBatchCases}
                  color="#14b8a6"
                  sub={`${row.passedCases}/${row.totalCases} pass · ${formatPercent(row.passRate)} · recall ${formatPercent(row.avgCitationRecall)}`}
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="最新回放失败样本">
          {stats.copilot.evals.latestFailures.length === 0 ? (
            <EmptyState text="最近一次回放没有失败样本，或尚未运行 eval suite。" compact />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {stats.copilot.evals.latestFailures.map((item) => (
                <div
                  key={`${item.batchId}:${item.evalCaseSlug}`}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #1d2746',
                    background: '#0d1426',
                    padding: '12px 14px',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ color: '#f5f7fb', fontSize: 13, fontWeight: 600 }}>
                    {item.evalCaseTitle}
                  </div>
                  <div style={{ color: '#c8d0e5', fontSize: 12 }}>{item.question}</div>
                  <div style={{ color: '#6b7ca8', fontSize: 12 }}>
                    期望：{item.expectedCaseSlugs.join(', ') || '无引用'} ｜ 实际：
                    {item.actualCitationSlugs.join(', ') || '无引用'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                    <span style={{ color: '#9fb3ff' }}>prompt {item.promptVersion}</span>
                    <span style={{ color: '#f87171' }}>
                      recall {formatPercent(item.citationRecall)}
                    </span>
                    <span style={{ color: '#f59e0b' }}>
                      precision {formatPercent(item.citationPrecision)}
                    </span>
                    {item.fallbackReason ? (
                      <span style={{ color: '#f87171' }}>fallback: {item.fallbackReason}</span>
                    ) : null}
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
