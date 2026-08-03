import Link from 'next/link';
import { type AdminStats, formatUsd } from '@/lib/statsApi';
import type { DashboardMetrics } from '../metrics';
import { BarRow, ChartCard, EmptyState } from '../primitives';
import { formatCompactUsd } from '../formatters';

export function ContentInsightsSection({ stats, m }: { stats: AdminStats; m: DashboardMetrics }) {
  const { maxIndustry, maxYear, maxReason } = m;
  return (
    <>
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
    </>
  );
}
