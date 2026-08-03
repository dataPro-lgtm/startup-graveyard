import { type AdminStats } from '@/lib/statsApi';
import type { DashboardMetrics } from '../metrics';
import { ChartCard, EmptyState } from '../primitives';
import {
  formatDateTime,
  formatMaybeDecimal,
  formatPercent,
  formatSignedDelta,
  formatTimeWindow,
  platformSnapshotTriggerLabel,
  workerStatusLabel,
} from '../formatters';

export function SnapshotOpsSection({ m }: { stats: AdminStats; m: DashboardMetrics }) {
  const { platformStats } = m;
  return (
    <>
      <ChartCard title="Recent Failed Ingestion Jobs">
        {platformStats.ingestion.recentFailed.length === 0 ? (
          <EmptyState text="近期没有失败的 ingestion jobs。" compact />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {platformStats.ingestion.recentFailed.map((job) => (
              <div
                key={job.id}
                style={{
                  border: '1px solid #24314f',
                  borderRadius: 12,
                  background: '#0d1426',
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 700 }}>
                    {job.sourceName} · {job.triggerType}
                  </div>
                  <div style={{ color: '#fb7185', fontSize: 12, fontWeight: 700 }}>failed</div>
                </div>
                <div style={{ color: '#d7deef', fontSize: 13 }}>
                  {job.errorMessage ?? '任务失败，但没有记录错误消息。'}
                </div>
                <div style={{ color: '#8a96b0', fontSize: 12 }}>
                  创建 {formatDateTime(job.createdAt)}
                  {job.startedAt ? ` · 开始 ${formatDateTime(job.startedAt)}` : ''}
                  {job.finishedAt ? ` · 结束 ${formatDateTime(job.finishedAt)}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Platform Snapshot History">
        {platformStats.recentSnapshots.length === 0 ? (
          <EmptyState
            text="当前还没有保存过平台快照。先点击页顶的“捕获 Platform Snapshot”，把当前运行态留痕下来。"
            compact
          />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {platformStats.recentSnapshots.map((snapshot) => (
              <div
                key={`${snapshot.createdAt}-${snapshot.triggerType}`}
                style={{
                  border: '1px solid #24314f',
                  borderRadius: 12,
                  background: '#0d1426',
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 700 }}>
                    {platformSnapshotTriggerLabel(snapshot.triggerType)}
                  </div>
                  <div style={{ color: '#8a96b0', fontSize: 12 }}>
                    {formatDateTime(snapshot.createdAt)}
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 10,
                  }}
                >
                  {[
                    [
                      'Mode',
                      snapshot.mockMode ? 'Mock' : 'Live',
                      snapshot.mockMode ? '#f59e0b' : '#22c55e',
                    ],
                    ['Queued', String(snapshot.queuedCount), '#38bdf8'],
                    ['Running', String(snapshot.runningCount), '#f59e0b'],
                    ['Failed', String(snapshot.failedCount), '#fb7185'],
                    ['Alerts', String(snapshot.alertCount), '#a78bfa'],
                    ['Worker', workerStatusLabel(snapshot.workerStatus), '#cbd5e1'],
                  ].map(([label, value, color]) => (
                    <div
                      key={label}
                      style={{
                        border: '1px solid #24314f',
                        borderRadius: 10,
                        background: '#10192e',
                        padding: '10px 12px',
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <div style={{ color: '#8a96b0', fontSize: 12 }}>{label}</div>
                      <div style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ color: '#8a96b0', fontSize: 12 }}>
                  {snapshot.oldestQueuedAgeMinutes != null
                    ? `最老 queued age ${snapshot.oldestQueuedAgeMinutes} min`
                    : '当时没有 queued backlog'}
                  {' · '}
                  stale running {snapshot.staleRunningCount}
                  {' · '}
                  1h completed {snapshot.completedLastHour}
                  {' · '}
                  critical/warning/info {snapshot.criticalAlertCount}/{snapshot.warningAlertCount}/
                  {snapshot.infoAlertCount}
                </div>
                <div style={{ color: '#8a96b0', fontSize: 12 }}>
                  worker 最近处理 {formatDateTime(snapshot.workerLastProcessedAt)}
                  {snapshot.workerConsecutiveErrors > 0
                    ? ` · 连续错误 ${snapshot.workerConsecutiveErrors}`
                    : ' · 无连续错误'}
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Platform Snapshot Cadence">
        <div style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              border: `1px solid ${platformStats.snapshotCadence.overdue ? '#4b2430' : '#24314f'}`,
              borderRadius: 12,
              background: platformStats.snapshotCadence.overdue ? '#23131a' : '#0d1426',
              color: platformStats.snapshotCadence.overdue ? '#fecdd3' : '#cbd5e1',
              padding: '12px 14px',
              display: 'grid',
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {platformStats.snapshotCadence.status === 'healthy'
                ? 'Scheduled snapshot cadence 正常'
                : platformStats.snapshotCadence.status === 'overdue'
                  ? 'Scheduled snapshot cadence 已断档'
                  : 'Scheduled snapshot cadence 还在建立基线'}
            </div>
            <div style={{ fontSize: 12 }}>
              {platformStats.snapshotCadence.status === 'healthy'
                ? `最近一次 scheduled snapshot 在 ${formatDateTime(platformStats.snapshotCadence.lastScheduledCapturedAt)}，预计每 ${platformStats.snapshotCadence.expectedIntervalMinutes} 分钟一次。`
                : platformStats.snapshotCadence.status === 'overdue'
                  ? `最近一次 scheduled snapshot 在 ${formatDateTime(platformStats.snapshotCadence.lastScheduledCapturedAt)}，距今 ${platformStats.snapshotCadence.minutesSinceLastScheduledSnapshot} 分钟，已错过 ${platformStats.snapshotCadence.missedIntervals} 个窗口。`
                  : '当前还没有足够的 scheduled snapshots 来建立自动 cadence 基线。'}
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            {[
              [
                'Expected interval',
                `${platformStats.snapshotCadence.expectedIntervalMinutes} min`,
                '#38bdf8',
              ],
              [
                'Last snapshot',
                formatDateTime(platformStats.snapshotCadence.lastCapturedAt),
                '#cbd5e1',
              ],
              [
                'Last scheduled',
                formatDateTime(platformStats.snapshotCadence.lastScheduledCapturedAt),
                '#cbd5e1',
              ],
              [
                'Next expected',
                formatDateTime(platformStats.snapshotCadence.expectedNextSnapshotAt),
                '#f59e0b',
              ],
              [
                'Missed intervals',
                String(platformStats.snapshotCadence.missedIntervals),
                platformStats.snapshotCadence.overdue ? '#fb7185' : '#22c55e',
              ],
            ].map(([label, value, color]) => (
              <div
                key={label}
                style={{
                  border: '1px solid #24314f',
                  borderRadius: 10,
                  background: '#10192e',
                  padding: '10px 12px',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ color: '#8a96b0', fontSize: 12 }}>{label}</div>
                <div style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Platform Snapshot Metrics Surface">
        <div style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              border: `1px solid ${
                platformStats.snapshotMetrics.cadenceAdherenceRate != null &&
                platformStats.snapshotMetrics.cadenceAdherenceRate < 0.75
                  ? '#4b2430'
                  : '#24314f'
              }`,
              borderRadius: 12,
              background:
                platformStats.snapshotMetrics.cadenceAdherenceRate != null &&
                platformStats.snapshotMetrics.cadenceAdherenceRate < 0.75
                  ? '#23131a'
                  : '#0d1426',
              color:
                platformStats.snapshotMetrics.cadenceAdherenceRate != null &&
                platformStats.snapshotMetrics.cadenceAdherenceRate < 0.75
                  ? '#fecdd3'
                  : '#cbd5e1',
              padding: '12px 14px',
              display: 'grid',
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              最近 {platformStats.snapshotMetrics.coveredHours} 小时 snapshot coverage
            </div>
            <div style={{ fontSize: 12 }}>
              {platformStats.snapshotMetrics.expectedScheduledSnapshotCount > 0
                ? `scheduled snapshots ${platformStats.snapshotMetrics.scheduledSnapshotCount}/${platformStats.snapshotMetrics.expectedScheduledSnapshotCount}，覆盖率 ${formatPercent(platformStats.snapshotMetrics.cadenceAdherenceRate)}。`
                : '当前 scheduled snapshots 还不足以形成稳定 coverage 基线。'}
            </div>
            <div style={{ fontSize: 12, color: '#8a96b0' }}>
              regression windows {platformStats.snapshotMetrics.regressionWindowCount} · peak queued{' '}
              {platformStats.snapshotMetrics.peakQueuedCount} · peak alerts{' '}
              {platformStats.snapshotMetrics.peakAlertCount}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            {[
              ['Covered hours', `${platformStats.snapshotMetrics.coveredHours} h`, '#cbd5e1'],
              [
                'Scheduled coverage',
                `${platformStats.snapshotMetrics.scheduledSnapshotCount}/${platformStats.snapshotMetrics.expectedScheduledSnapshotCount}`,
                '#38bdf8',
              ],
              [
                'Cadence adherence',
                formatPercent(platformStats.snapshotMetrics.cadenceAdherenceRate),
                platformStats.snapshotMetrics.cadenceAdherenceRate != null &&
                platformStats.snapshotMetrics.cadenceAdherenceRate < 0.75
                  ? '#fb7185'
                  : '#22c55e',
              ],
              [
                'Regression windows',
                String(platformStats.snapshotMetrics.regressionWindowCount),
                platformStats.snapshotMetrics.regressionWindowCount > 0 ? '#f59e0b' : '#22c55e',
              ],
              ['Peak queued', String(platformStats.snapshotMetrics.peakQueuedCount), '#a78bfa'],
              [
                'Peak queued age',
                platformStats.snapshotMetrics.peakOldestQueuedAgeMinutes != null
                  ? `${platformStats.snapshotMetrics.peakOldestQueuedAgeMinutes} min`
                  : 'N/A',
                '#f97316',
              ],
              ['Peak failed', String(platformStats.snapshotMetrics.peakFailedCount), '#fb7185'],
              [
                'Peak worker errors',
                String(platformStats.snapshotMetrics.peakWorkerConsecutiveErrors),
                '#f97316',
              ],
            ].map(([label, value, color]) => (
              <div
                key={label}
                style={{
                  border: '1px solid #24314f',
                  borderRadius: 10,
                  background: '#10192e',
                  padding: '10px 12px',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ color: '#8a96b0', fontSize: 12 }}>{label}</div>
                <div style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Regression Alert Suppression">
        <div style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              border: `1px solid ${
                platformStats.snapshotSuppression.suppressedRegressionCount > 0
                  ? '#24314f'
                  : '#4b2430'
              }`,
              borderRadius: 12,
              background:
                platformStats.snapshotSuppression.suppressedRegressionCount > 0
                  ? '#0d1426'
                  : '#23131a',
              color:
                platformStats.snapshotSuppression.suppressedRegressionCount > 0
                  ? '#cbd5e1'
                  : '#fecdd3',
              padding: '12px 14px',
              display: 'grid',
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {platformStats.snapshotSuppression.suppressedRegressionCount > 0
                ? `最近 ${platformStats.snapshotSuppression.windowHours}h 内已有 ${platformStats.snapshotSuppression.suppressedRegressionCount} 个 regression window 被更具体告警覆盖`
                : `最近 ${platformStats.snapshotSuppression.windowHours}h 内没有被抑制的 regression windows`}
            </div>
            <div style={{ fontSize: 12 }}>
              {platformStats.snapshotSuppression.activeSuppressionReason
                ? `当前最新被抑制的 reason 是 ${platformStats.snapshotSuppression.activeSuppressionReason}。`
                : '当前没有正在被抑制的最新 regression 信号。'}
            </div>
            <div style={{ fontSize: 12, color: '#8a96b0' }}>
              suppressed {platformStats.snapshotSuppression.suppressedRegressionCount} ·
              unsuppressed {platformStats.snapshotSuppression.unsuppressedRegressionCount}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            {[
              [
                'Suppressed windows',
                String(platformStats.snapshotSuppression.suppressedRegressionCount),
                platformStats.snapshotSuppression.suppressedRegressionCount > 0
                  ? '#22c55e'
                  : '#cbd5e1',
              ],
              [
                'Unsuppressed windows',
                String(platformStats.snapshotSuppression.unsuppressedRegressionCount),
                platformStats.snapshotSuppression.unsuppressedRegressionCount > 0
                  ? '#fb7185'
                  : '#22c55e',
              ],
              [
                'Active reason',
                platformStats.snapshotSuppression.activeSuppressionReason ?? 'N/A',
                '#38bdf8',
              ],
              [
                'Last suppressed bucket',
                formatDateTime(platformStats.snapshotSuppression.lastSuppressedBucketStart),
                '#f59e0b',
              ],
            ].map(([label, value, color]) => (
              <div
                key={label}
                style={{
                  border: '1px solid #24314f',
                  borderRadius: 10,
                  background: '#10192e',
                  padding: '10px 12px',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ color: '#8a96b0', fontSize: 12 }}>{label}</div>
                <div style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</div>
              </div>
            ))}
          </div>

          {platformStats.snapshotSuppression.topReasons.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {platformStats.snapshotSuppression.topReasons.map((item) => (
                <div
                  key={item.reason}
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
                  <span style={{ color: '#8a96b0' }}>{item.reason}</span>
                  <span style={{ color: '#eef2ff', fontWeight: 700 }}>{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              text="当前还没有可统计的 suppression reasons。再累计几轮 regressing windows 后，这里会显示最常被更具体告警覆盖的原因。"
              compact
            />
          )}
        </div>
      </ChartCard>

      <ChartCard title="Platform Snapshot Trend">
        {platformStats.snapshotTrend.sampleCount === 0 ? (
          <EmptyState
            text="当前还没有可分析的 snapshot 趋势。先累计几次平台快照，再判断 backlog / alerts / worker errors 是在上升还是回落。"
            compact
          />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
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
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                最近 {platformStats.snapshotTrend.sampleCount} 次快照
              </div>
              <div style={{ color: '#8a96b0', fontSize: 12 }}>
                起点 {formatDateTime(platformStats.snapshotTrend.oldestCapturedAt)} · 最新{' '}
                {formatDateTime(platformStats.snapshotTrend.latestCapturedAt)}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
              }}
            >
              {[
                [
                  'Queued Delta',
                  formatSignedDelta(platformStats.snapshotTrend.queuedCountDelta),
                  '#38bdf8',
                ],
                [
                  'Queued Age Delta',
                  formatSignedDelta(platformStats.snapshotTrend.oldestQueuedAgeDelta, 'm'),
                  '#f59e0b',
                ],
                [
                  'Alert Delta',
                  formatSignedDelta(platformStats.snapshotTrend.alertCountDelta),
                  '#a78bfa',
                ],
                [
                  'Failed Delta',
                  formatSignedDelta(platformStats.snapshotTrend.failedCountDelta),
                  '#fb7185',
                ],
                [
                  'Worker Error Delta',
                  formatSignedDelta(platformStats.snapshotTrend.workerConsecutiveErrorsDelta),
                  '#f97316',
                ],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  style={{
                    border: '1px solid #24314f',
                    borderRadius: 10,
                    background: '#10192e',
                    padding: '10px 12px',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ color: '#8a96b0', fontSize: 12 }}>{label}</div>
                  <div style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {[
                [
                  '峰值 queued',
                  String(platformStats.snapshotTrend.maxQueuedCount),
                  '历史窗口内队列峰值',
                ],
                [
                  '峰值 queued age',
                  platformStats.snapshotTrend.maxOldestQueuedAgeMinutes != null
                    ? `${platformStats.snapshotTrend.maxOldestQueuedAgeMinutes} min`
                    : 'N/A',
                  '历史窗口内最老 queued age',
                ],
                [
                  '峰值 alerts',
                  String(platformStats.snapshotTrend.maxAlertCount),
                  '历史窗口内平台告警峰值',
                ],
                [
                  '峰值 failed',
                  String(platformStats.snapshotTrend.maxFailedCount),
                  '历史窗口内失败任务峰值',
                ],
                [
                  '峰值 worker errors',
                  String(platformStats.snapshotTrend.maxWorkerConsecutiveErrors),
                  '历史窗口内 worker 连续错误峰值',
                ],
              ].map(([label, value, sub]) => (
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
                  <span style={{ color: '#8a96b0' }}>
                    {label}
                    <span style={{ display: 'block', fontSize: 12 }}>{sub}</span>
                  </span>
                  <span style={{ color: '#eef2ff', fontWeight: 700 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Platform Snapshot Rollup">
        {platformStats.snapshotRollup.bucketCount === 0 ? (
          <EmptyState
            text="当前还没有可聚合的 snapshot 窗口。先累计几次平台快照，再看每个时间窗口里的 backlog / alerts / worker errors 峰值。"
            compact
          />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
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
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                最近 {platformStats.snapshotRollup.bucketCount} 个时间窗口
              </div>
              <div style={{ color: '#8a96b0', fontSize: 12 }}>
                每 {platformStats.snapshotRollup.bucketSizeMinutes}{' '}
                分钟聚合一次，用来区分持续退化和单次毛刺。
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${
                  platformStats.snapshotRegression.hasRegression ? '#4b2430' : '#24314f'
                }`,
                borderRadius: 12,
                background: platformStats.snapshotRegression.hasRegression ? '#23131a' : '#0d1426',
                color: platformStats.snapshotRegression.hasRegression ? '#fecdd3' : '#cbd5e1',
                padding: '12px 14px',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {platformStats.snapshotRegression.hasRegression
                  ? platformStats.snapshotRegression.suppressed
                    ? '最近窗口存在退化，但已被更具体告警覆盖'
                    : '最近窗口正在退化'
                  : '最近窗口未出现新的退化信号'}
              </div>
              <div style={{ fontSize: 12 }}>
                {platformStats.snapshotRegression.hasRegression
                  ? `上一窗口 ${formatDateTime(platformStats.snapshotRegression.previousBucketStart)} -> 最新窗口 ${formatDateTime(platformStats.snapshotRegression.latestBucketStart)}：${platformStats.snapshotRegression.reasons.join(' · ')}`
                  : '最近两个可比较窗口之间没有发现 backlog、alerts、failed 或 worker errors 的回升。'}
              </div>
              {platformStats.snapshotRegression.hasRegression ? (
                <div style={{ fontSize: 12, color: '#8a96b0' }}>
                  severity {platformStats.snapshotRegression.severity} · streak{' '}
                  {platformStats.snapshotRegression.regressionStreak}
                  {platformStats.snapshotRegression.suppressed
                    ? ` · suppressed: ${platformStats.snapshotRegression.suppressionReason}`
                    : ''}
                </div>
              ) : null}
              {platformStats.snapshotRegression.recommendedActions.length > 0 ? (
                <div style={{ fontSize: 12, color: '#8a96b0' }}>
                  next: {platformStats.snapshotRegression.recommendedActions.join(' · ')}
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {platformStats.snapshotRollup.buckets.map((bucket) => (
                <div
                  key={bucket.bucketStart}
                  style={{
                    border: '1px solid #24314f',
                    borderRadius: 12,
                    background: '#0d1426',
                    padding: '12px 14px',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 700 }}>
                      {formatTimeWindow(bucket.bucketStart, bucket.bucketEnd)}
                    </div>
                    <div style={{ color: '#8a96b0', fontSize: 12 }}>
                      {bucket.sampleCount} snapshots
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {[
                      ['Avg queued', formatMaybeDecimal(bucket.avgQueuedCount), '#38bdf8'],
                      ['Peak queued', String(bucket.maxQueuedCount), '#0ea5e9'],
                      [
                        'Peak queued age',
                        bucket.maxOldestQueuedAgeMinutes != null
                          ? `${bucket.maxOldestQueuedAgeMinutes} min`
                          : 'N/A',
                        '#f59e0b',
                      ],
                      ['Peak alerts', String(bucket.maxAlertCount), '#a78bfa'],
                      ['Peak failed', String(bucket.maxFailedCount), '#fb7185'],
                      ['Peak worker errors', String(bucket.maxWorkerConsecutiveErrors), '#f97316'],
                    ].map(([label, value, color]) => (
                      <div
                        key={label}
                        style={{
                          border: '1px solid #24314f',
                          borderRadius: 10,
                          background: '#10192e',
                          padding: '10px 12px',
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <div style={{ color: '#8a96b0', fontSize: 12 }}>{label}</div>
                        <div style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Stale Running Ingestion Jobs">
        {platformStats.ingestion.recentStale.length === 0 ? (
          <EmptyState
            text={`当前没有超过 ${platformStats.ingestion.staleThresholdMinutes} 分钟的 running tasks。`}
            compact
          />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {platformStats.ingestion.recentStale.map((job) => (
              <div
                key={job.id}
                style={{
                  border: '1px solid #4b2430',
                  borderRadius: 12,
                  background: '#0d1426',
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 700 }}>
                    {job.sourceName} · {job.triggerType}
                  </div>
                  <div style={{ color: '#fb7185', fontSize: 12, fontWeight: 700 }}>
                    {job.runningMinutes} min
                  </div>
                </div>
                <div style={{ color: '#d7deef', fontSize: 13 }}>
                  任务已连续运行 {job.runningMinutes} 分钟，超过自动诊断阈值，建议先 reclaim 再检查
                  worker / 外部依赖。
                </div>
                <div style={{ color: '#8a96b0', fontSize: 12 }}>
                  创建 {formatDateTime(job.createdAt)} · 开始 {formatDateTime(job.startedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Queued Backlog & Throughput">
        <div style={{ display: 'grid', gap: 12 }}>
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
            <div style={{ fontWeight: 700, fontSize: 13 }}>Queue Snapshot</div>
            <div style={{ color: '#d7deef', fontSize: 13 }}>
              当前 queued {platformStats.ingestion.queuedCount} 条 · 最近 1 小时完成{' '}
              {platformStats.ingestion.completedLastHour} 条
            </div>
            <div style={{ color: '#8a96b0', fontSize: 12 }}>
              {platformStats.ingestion.oldestQueuedAgeMinutes != null
                ? `最老 queued 任务 ${platformStats.ingestion.oldestQueuedSourceName ?? 'unknown'} / ${platformStats.ingestion.oldestQueuedTriggerType ?? 'unknown'} 已等待 ${platformStats.ingestion.oldestQueuedAgeMinutes} 分钟`
                : '当前没有 queued backlog。'}
            </div>
          </div>

          {platformStats.ingestion.recentSucceeded.length === 0 ? (
            <EmptyState
              text="最近没有成功完成的 ingestion jobs，可结合 backlog 一起判断 worker 是否真正消费队列。"
              compact
            />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {platformStats.ingestion.recentSucceeded.map((job) => (
                <div
                  key={job.id}
                  style={{
                    border: '1px solid #24314f',
                    borderRadius: 12,
                    background: '#0d1426',
                    padding: '12px 14px',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 700 }}>
                      {job.sourceName} · {job.triggerType}
                    </div>
                    <div style={{ color: '#22c55e', fontSize: 12, fontWeight: 700 }}>succeeded</div>
                  </div>
                  <div style={{ color: '#8a96b0', fontSize: 12 }}>
                    创建 {formatDateTime(job.createdAt)} · 完成 {formatDateTime(job.finishedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ChartCard>
    </>
  );
}
