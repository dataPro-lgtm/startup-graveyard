import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { type AdminStats, fetchAdminStats, formatUsd } from '@/lib/statsApi';
import { ADMIN_API_KEY } from '@/lib/api';

export const metadata: Metadata = { title: '运营 Dashboard' };

// Revalidate every 60 s — shows near-real-time data without hammering the DB
export const revalidate = 60;

export default async function DashboardPage() {
  const adminKey = ADMIN_API_KEY ?? '';
  const stats = await fetchAdminStats(adminKey);
  void headers(); // ensure dynamic rendering when no admin key

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
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 32px' }}>运营数据 Dashboard</h1>

      {!stats ? (
        <p style={{ color: '#f87171' }}>数据加载失败，请检查 API 连接和管理员密钥。</p>
      ) : (
        <DashboardContent stats={stats} />
      )}
    </main>
  );
}

function formatPercent(rate: number | null): string {
  if (rate == null) return 'N/A';
  return `${(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%`;
}

function formatCompactUsd(value: number | null): string {
  if (value == null) return 'N/A';
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return '$0';
}

function DashboardContent({ stats }: { stats: AdminStats }) {
  const teamStats = stats.commercial.teamWorkspaces;
  const maxIndustry = Math.max(...stats.byIndustry.map((r) => r.count), 1);
  const maxYear = Math.max(...stats.byYear.map((r) => r.count), 1);
  const maxReason = Math.max(...stats.byFailureReason.map((r) => r.count), 1);
  const maxPromptRuns = Math.max(...stats.copilot.byPromptVersion.map((r) => r.runs), 1);
  const maxFallbackReason = Math.max(...stats.copilot.byFallbackReason.map((r) => r.count), 1);
  const maxEvalBatchCases = Math.max(
    ...stats.copilot.evals.recentBatches.map((r) => r.totalCases),
    1,
  );
  const maxTeamMetric = Math.max(
    teamStats.totalSeatCapacity,
    teamStats.reservedSeats,
    teamStats.pendingInvites,
    teamStats.inheritedMembers,
    1,
  );
  const groundedRate =
    stats.copilot.overview.totalRuns > 0
      ? stats.copilot.overview.groundedRuns / stats.copilot.overview.totalRuns
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
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
          label="风险工作区"
          value={String(teamStats.atRiskWorkspaces)}
          sub={`满席 ${teamStats.fullWorkspaces} 个`}
          color="#f87171"
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
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <ChartCard title="Team Workspace 运营状态">
          {teamStats.totalWorkspaces === 0 ? (
            <EmptyState text="当前还没有 Team Workspace 数据。团队套餐开通并创建工作区后，这里会出现 seat 与风险概览。" />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <BarRow
                label="已使用 seats"
                value={teamStats.seatsUsed}
                max={maxTeamMetric}
                color="#22c55e"
                sub={`总容量 ${teamStats.totalSeatCapacity}`}
              />
              <BarRow
                label="预留 seats"
                value={teamStats.reservedSeats}
                max={maxTeamMetric}
                color="#38bdf8"
                sub={`待接受邀请 ${teamStats.pendingInvites}`}
              />
              <BarRow
                label="继承 Team 权限成员"
                value={teamStats.inheritedMembers}
                max={maxTeamMetric}
                color="#f59e0b"
                sub={`活跃工作区 ${teamStats.activeWorkspaces}`}
              />
              <BarRow
                label="风险 / 满席工作区"
                value={teamStats.atRiskWorkspaces}
                max={Math.max(teamStats.totalWorkspaces, 1)}
                color="#f87171"
                sub={`满席 ${teamStats.fullWorkspaces} 个`}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Prompt 版本回归视图">
          {stats.copilot.byPromptVersion.length === 0 ? (
            <EmptyState text="还没有 Copilot run 数据。先在 /copilot 发起会话后，这里才会出现 prompt 版本、反馈和成本对比。" />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {stats.copilot.byPromptVersion.map((row) => (
                <BarRow
                  key={row.promptVersion}
                  label={row.promptVersion}
                  value={row.runs}
                  max={maxPromptRuns}
                  color="#8b5cf6"
                  sub={`${formatPercent(row.groundedRate)} grounded · ${formatPercent(row.positiveRate)} helpful · ${formatCompactUsd(row.totalEstimatedCostUsd)}`}
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Fallback 原因">
          {stats.copilot.byFallbackReason.length === 0 ? (
            <EmptyState text="当前还没有 fallback run。" compact />
          ) : (
            stats.copilot.byFallbackReason.map((row) => (
              <BarRow
                key={row.reason}
                label={row.reason}
                value={row.count}
                max={maxFallbackReason}
                color="#f87171"
              />
            ))
          )}
        </ChartCard>
      </div>

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

      {/* ── Charts Row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Industry bar chart */}
        <ChartCard title="行业分布">
          {stats.byIndustry.slice(0, 10).map((row) => (
            <BarRow
              key={row.industry}
              label={row.industry}
              value={row.count}
              max={maxIndustry}
              sub={formatUsd(row.totalFunding)}
              color="#5b7cff"
            />
          ))}
        </ChartCard>

        {/* Failure reason */}
        <ChartCard title="失败原因分布">
          {stats.byFailureReason.map((row) => (
            <BarRow
              key={row.reason}
              label={row.reason.replace(/_/g, ' ')}
              value={row.count}
              max={maxReason}
              color="#f87171"
            />
          ))}
        </ChartCard>
      </div>

      {/* ── Year timeline + Country ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Year bars */}
        <ChartCard title="按倒闭年份">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
            {stats.byYear
              .slice()
              .sort((a, b) => a.year - b.year)
              .map((row) => {
                const pct = Math.max((row.count / maxYear) * 100, 4);
                return (
                  <div
                    key={row.year}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flex: 1,
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 10, color: '#c8d0e5' }}>{row.count}</span>
                    <div
                      style={{
                        width: '100%',
                        height: `${pct}%`,
                        background: 'linear-gradient(180deg, #5b7cff, #3a56cc)',
                        borderRadius: '3px 3px 0 0',
                      }}
                    />
                    <span style={{ fontSize: 9, color: '#6b7ca8', writingMode: 'vertical-rl' }}>
                      {row.year}
                    </span>
                  </div>
                );
              })}
          </div>
        </ChartCard>

        {/* Country list */}
        <ChartCard title="国家分布">
          {stats.byCountry.slice(0, 8).map((row) => (
            <div
              key={row.country}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid #1d2746',
                fontSize: 13,
              }}
            >
              <span style={{ color: '#c8d0e5' }}>{row.country}</span>
              <span style={{ color: '#9fb3ff', fontWeight: 600 }}>{row.count}</span>
            </div>
          ))}
        </ChartCard>
      </div>

      <ChartCard title="最近需要关注的 Copilot run">
        {stats.copilot.recentFlags.length === 0 ? (
          <EmptyState text="目前没有被 downvote 或触发 fallback 的回答。" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {stats.copilot.recentFlags.map((item) => (
              <div
                key={item.assistantMessageId}
                style={{
                  borderRadius: 12,
                  border: '1px solid #1d2746',
                  background: '#0d1426',
                  padding: '14px 16px',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ color: '#f5f7fb', fontWeight: 600 }}>{item.question}</div>
                  <div style={{ color: '#6b7ca8', fontSize: 12 }}>
                    {new Date(item.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div style={{ color: '#c8d0e5', fontSize: 13, lineHeight: 1.7 }}>
                  {item.answerPreview}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                  <span style={{ color: '#9fb3ff' }}>prompt {item.promptVersion}</span>
                  <span style={{ color: '#6b7ca8' }}>{item.responseMs} ms</span>
                  <span style={{ color: '#6b7ca8' }}>
                    {item.totalTokens == null ? 'tok N/A' : `${item.totalTokens} tok`}
                  </span>
                  <span style={{ color: '#6b7ca8' }}>
                    {formatCompactUsd(item.estimatedCostUsd)}
                  </span>
                  {item.feedbackVote ? (
                    <span style={{ color: item.feedbackVote === 'down' ? '#f87171' : '#34d399' }}>
                      {item.feedbackVote === 'down' ? '用户反馈：需要改进' : '用户反馈：有帮助'}
                    </span>
                  ) : null}
                  {item.fallbackReason ? (
                    <span style={{ color: '#f87171' }}>fallback: {item.fallbackReason}</span>
                  ) : null}
                </div>
                {item.feedbackNote ? (
                  <div style={{ color: '#9fb3ff', fontSize: 12 }}>备注：{item.feedbackNote}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      {/* ── Recent cases ────────────────────────────────────────────────── */}
      <ChartCard title="最近入库案例">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.recentlyAdded.map((item) => (
            <div
              key={item.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Link
                href={item.slug ? `/cases/s/${encodeURIComponent(item.slug)}` : `/cases/${item.id}`}
                style={{ color: '#7d9cff', textDecoration: 'none', fontSize: 14 }}
              >
                {item.companyName}
              </Link>
              <span style={{ color: '#6b7ca8', fontSize: 12 }}>
                {new Date(item.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        padding: '20px 24px',
        borderRadius: 14,
        border: `1px solid ${color}33`,
        background: '#10172b',
      }}
    >
      <p style={{ margin: '0 0 6px', fontSize: 12, color: '#9fb3ff', letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </p>
      <p style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 700, color }}>{value}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#6b7ca8' }}>{sub}</p>
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '20px 24px',
        borderRadius: 14,
        border: '1px solid #1d2746',
        background: '#10172b',
      }}
    >
      <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600, color: '#9fb3ff' }}>{title}</p>
      {children}
    </div>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px dashed #2a3658',
        padding: compact ? '10px 12px' : '16px 18px',
        color: '#6b7ca8',
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      {text}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
  sub,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sub?: string;
}) {
  const pct = Math.max((value / max) * 100, 2);
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}
      >
        <span style={{ color: '#c8d0e5' }}>{label}</span>
        <span style={{ color: '#9fb3ff' }}>
          {value}
          {sub ? ` · ${sub}` : ''}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#1d2746' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%` }} />
      </div>
    </div>
  );
}
