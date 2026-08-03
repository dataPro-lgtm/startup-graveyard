import {
  DEFAULT_PLATFORM_SNAPSHOT_INTERVAL_MINUTES,
  PLATFORM_SNAPSHOT_METRICS_WINDOW_HOURS,
} from './shared.js';
import type { ContentStatsResult } from './shared.js';
import type {
  PlatformAdminMetrics,
  PlatformSnapshotCadence,
  PlatformSnapshotMetricsSurface,
  PlatformSnapshot,
  PlatformSnapshotRegression,
  PlatformSnapshotRollup,
  PlatformSnapshotSuppressionSurface,
  PlatformSnapshotTrend,
} from '@sg/shared/schemas/adminStats';
import { platformSnapshotSchema } from '../../../schemas/adminStats.js';

export function emptyContentStats(): ContentStatsResult {
  return {
    totalPublished: 0,
    totalFundingUsd: 0,
    totalDraft: 0,
    avgFundingUsd: 0,
    byIndustry: [],
    byCountry: [],
    byYear: [],
    byFailureReason: [],
    recentlyAdded: [],
    pendingReviews: 0,
    ingestionStats: { pending: 0, running: 0, failed: 0, completed: 0 },
  };
}

export function parsePlatformSnapshotMetadata(
  metadata: Record<string, unknown>,
): PlatformSnapshot | null {
  const candidate =
    metadata.snapshot && typeof metadata.snapshot === 'object' && !Array.isArray(metadata.snapshot)
      ? metadata.snapshot
      : metadata;
  const parsed = platformSnapshotSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function summarizePlatformSnapshotTrend(
  recentSnapshots: PlatformSnapshot[],
): PlatformSnapshotTrend {
  if (recentSnapshots.length === 0) {
    return {
      sampleCount: 0,
      oldestCapturedAt: null,
      latestCapturedAt: null,
      queuedCountDelta: null,
      oldestQueuedAgeDelta: null,
      alertCountDelta: null,
      failedCountDelta: null,
      workerConsecutiveErrorsDelta: null,
      maxQueuedCount: 0,
      maxOldestQueuedAgeMinutes: null,
      maxAlertCount: 0,
      maxFailedCount: 0,
      maxWorkerConsecutiveErrors: 0,
    };
  }

  const latest = recentSnapshots[0]!;
  const oldest = recentSnapshots[recentSnapshots.length - 1]!;
  return {
    sampleCount: recentSnapshots.length,
    oldestCapturedAt: oldest.createdAt,
    latestCapturedAt: latest.createdAt,
    queuedCountDelta: latest.queuedCount - oldest.queuedCount,
    oldestQueuedAgeDelta:
      latest.oldestQueuedAgeMinutes == null || oldest.oldestQueuedAgeMinutes == null
        ? null
        : latest.oldestQueuedAgeMinutes - oldest.oldestQueuedAgeMinutes,
    alertCountDelta: latest.alertCount - oldest.alertCount,
    failedCountDelta: latest.failedCount - oldest.failedCount,
    workerConsecutiveErrorsDelta: latest.workerConsecutiveErrors - oldest.workerConsecutiveErrors,
    maxQueuedCount: Math.max(...recentSnapshots.map((snapshot) => snapshot.queuedCount)),
    maxOldestQueuedAgeMinutes: recentSnapshots
      .map((snapshot) => snapshot.oldestQueuedAgeMinutes)
      .filter((value): value is number => value != null)
      .reduce<number | null>((max, value) => (max == null || value > max ? value : max), null),
    maxAlertCount: Math.max(...recentSnapshots.map((snapshot) => snapshot.alertCount)),
    maxFailedCount: Math.max(...recentSnapshots.map((snapshot) => snapshot.failedCount)),
    maxWorkerConsecutiveErrors: Math.max(
      ...recentSnapshots.map((snapshot) => snapshot.workerConsecutiveErrors),
    ),
  };
}

export function summarizePlatformSnapshotRollup(
  recentSnapshots: PlatformSnapshot[],
  bucketSizeMinutes = 60,
): PlatformSnapshotRollup {
  if (recentSnapshots.length === 0) {
    return {
      bucketSizeMinutes,
      bucketCount: 0,
      buckets: [],
    };
  }

  const bucketSizeMs = bucketSizeMinutes * 60_000;
  const buckets = new Map<number, PlatformSnapshot[]>();

  recentSnapshots.forEach((snapshot) => {
    const capturedAt = new Date(snapshot.createdAt).getTime();
    const bucketStartMs = Math.floor(capturedAt / bucketSizeMs) * bucketSizeMs;
    const bucket = buckets.get(bucketStartMs);
    if (bucket) {
      bucket.push(snapshot);
      return;
    }
    buckets.set(bucketStartMs, [snapshot]);
  });

  const rollupBuckets = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketStartMs, samples]) => {
      const queuedTotal = samples.reduce((sum, snapshot) => sum + snapshot.queuedCount, 0);
      const oldestQueuedAges = samples
        .map((snapshot) => snapshot.oldestQueuedAgeMinutes)
        .filter((value): value is number => value != null);

      return {
        bucketStart: new Date(bucketStartMs).toISOString(),
        bucketEnd: new Date(bucketStartMs + bucketSizeMs).toISOString(),
        sampleCount: samples.length,
        avgQueuedCount:
          samples.length === 0 ? 0 : Number((queuedTotal / samples.length).toFixed(2)),
        maxQueuedCount: Math.max(...samples.map((snapshot) => snapshot.queuedCount)),
        maxOldestQueuedAgeMinutes:
          oldestQueuedAges.length === 0 ? null : Math.max(...oldestQueuedAges),
        maxAlertCount: Math.max(...samples.map((snapshot) => snapshot.alertCount)),
        maxFailedCount: Math.max(...samples.map((snapshot) => snapshot.failedCount)),
        maxWorkerConsecutiveErrors: Math.max(
          ...samples.map((snapshot) => snapshot.workerConsecutiveErrors),
        ),
      };
    });

  return {
    bucketSizeMinutes,
    bucketCount: rollupBuckets.length,
    buckets: rollupBuckets,
  };
}

export function summarizePlatformSnapshotCadence(
  recentSnapshots: PlatformSnapshot[],
  now = Date.now(),
): PlatformSnapshotCadence {
  const scheduledSnapshots = recentSnapshots.filter(
    (snapshot) => snapshot.triggerType === 'scheduled',
  );
  const latestSnapshot = recentSnapshots[0] ?? null;
  const latestScheduledSnapshot = scheduledSnapshots[0] ?? null;
  const observedIntervals = scheduledSnapshots
    .slice(0, -1)
    .map((snapshot, index) => {
      const previous = scheduledSnapshots[index + 1];
      if (!previous) return null;
      const deltaMinutes = Math.round(
        (Date.parse(snapshot.createdAt) - Date.parse(previous.createdAt)) / 60_000,
      );
      return deltaMinutes > 0 ? deltaMinutes : null;
    })
    .filter((value): value is number => value != null);
  const expectedIntervalMinutes =
    observedIntervals.length > 0
      ? Math.min(...observedIntervals)
      : DEFAULT_PLATFORM_SNAPSHOT_INTERVAL_MINUTES;
  const minutesSinceLastSnapshot = latestSnapshot
    ? Math.max(0, Math.floor((now - Date.parse(latestSnapshot.createdAt)) / 60_000))
    : null;
  const minutesSinceLastScheduledSnapshot = latestScheduledSnapshot
    ? Math.max(0, Math.floor((now - Date.parse(latestScheduledSnapshot.createdAt)) / 60_000))
    : null;
  const overdue =
    minutesSinceLastScheduledSnapshot != null &&
    minutesSinceLastScheduledSnapshot > expectedIntervalMinutes * 2;
  const missedIntervals =
    minutesSinceLastScheduledSnapshot == null || !overdue
      ? 0
      : Math.max(1, Math.floor(minutesSinceLastScheduledSnapshot / expectedIntervalMinutes) - 1);

  return {
    status: latestScheduledSnapshot == null ? 'awaiting_baseline' : overdue ? 'overdue' : 'healthy',
    expectedIntervalMinutes,
    lastCapturedAt: latestSnapshot?.createdAt ?? null,
    lastScheduledCapturedAt: latestScheduledSnapshot?.createdAt ?? null,
    expectedNextSnapshotAt: latestScheduledSnapshot
      ? new Date(
          Date.parse(latestScheduledSnapshot.createdAt) + expectedIntervalMinutes * 60_000,
        ).toISOString()
      : null,
    minutesSinceLastSnapshot,
    minutesSinceLastScheduledSnapshot,
    overdue,
    missedIntervals,
  };
}

export function platformSnapshotBucketHasRegression(
  current: PlatformSnapshotRollup['buckets'][number],
  previous: PlatformSnapshotRollup['buckets'][number],
) {
  return (
    current.maxQueuedCount > previous.maxQueuedCount ||
    (current.maxOldestQueuedAgeMinutes ?? 0) > (previous.maxOldestQueuedAgeMinutes ?? 0) ||
    current.maxAlertCount > previous.maxAlertCount ||
    current.maxFailedCount > previous.maxFailedCount ||
    current.maxWorkerConsecutiveErrors > previous.maxWorkerConsecutiveErrors
  );
}

export function summarizePlatformSnapshotRegressionPair(
  latest: PlatformSnapshotRollup['buckets'][number],
  previous: PlatformSnapshotRollup['buckets'][number],
) {
  const queuedDelta = latest.maxQueuedCount - previous.maxQueuedCount;
  const oldestQueuedAgeDelta =
    latest.maxOldestQueuedAgeMinutes == null || previous.maxOldestQueuedAgeMinutes == null
      ? null
      : latest.maxOldestQueuedAgeMinutes - previous.maxOldestQueuedAgeMinutes;
  const alertCountDelta = latest.maxAlertCount - previous.maxAlertCount;
  const failedCountDelta = latest.maxFailedCount - previous.maxFailedCount;
  const workerConsecutiveErrorsDelta =
    latest.maxWorkerConsecutiveErrors - previous.maxWorkerConsecutiveErrors;

  const reasons: string[] = [];
  if (queuedDelta > 0) {
    reasons.push(`queued peak +${queuedDelta}`);
  }
  if (oldestQueuedAgeDelta != null && oldestQueuedAgeDelta > 0) {
    reasons.push(`queued age peak +${oldestQueuedAgeDelta}m`);
  }
  if (alertCountDelta > 0) {
    reasons.push(`alerts peak +${alertCountDelta}`);
  }
  if (failedCountDelta > 0) {
    reasons.push(`failed peak +${failedCountDelta}`);
  }
  if (workerConsecutiveErrorsDelta > 0) {
    reasons.push(`worker errors peak +${workerConsecutiveErrorsDelta}`);
  }

  const recommendedActions = [
    queuedDelta > 0 || (oldestQueuedAgeDelta ?? 0) > 0
      ? 'Review queue backlog and reclaim stale jobs if needed'
      : null,
    alertCountDelta > 0 ? 'Review the Platform Alerts panel for the latest warnings' : null,
    failedCountDelta > 0 ? 'Inspect recent failed ingestion jobs before backlog compounds' : null,
    workerConsecutiveErrorsDelta > 0
      ? 'Inspect worker health, recent ticks, and lastError immediately'
      : null,
  ].filter((item): item is string => item != null);

  const severity: PlatformSnapshotRegression['severity'] =
    failedCountDelta > 0 || workerConsecutiveErrorsDelta >= 2
      ? 'critical'
      : reasons.length > 0
        ? 'warning'
        : 'info';

  return {
    hasRegression: reasons.length > 0,
    severity,
    queuedDelta,
    oldestQueuedAgeDelta,
    alertCountDelta,
    failedCountDelta,
    workerConsecutiveErrorsDelta,
    reasons,
    recommendedActions,
  };
}

export function inferPlatformSnapshotSuppressionReason(
  regression: Pick<
    PlatformSnapshotRegression,
    | 'hasRegression'
    | 'severity'
    | 'queuedDelta'
    | 'oldestQueuedAgeDelta'
    | 'alertCountDelta'
    | 'failedCountDelta'
    | 'workerConsecutiveErrorsDelta'
  >,
): string | null {
  if (!regression.hasRegression || regression.severity === 'critical') {
    return null;
  }

  const queueSignal =
    (regression.queuedDelta ?? 0) > 0 || (regression.oldestQueuedAgeDelta ?? 0) > 0;
  const failedSignal = (regression.failedCountDelta ?? 0) > 0;
  const workerSignal = (regression.workerConsecutiveErrorsDelta ?? 0) > 0;
  const alertSignal = (regression.alertCountDelta ?? 0) > 0;

  if (queueSignal && !failedSignal && !workerSignal) {
    return 'covered_by_queue_backlog_alert';
  }
  if (failedSignal && !queueSignal && !workerSignal && !alertSignal) {
    return 'covered_by_failed_ingestion_alert';
  }
  if (workerSignal && !queueSignal && !failedSignal && !alertSignal) {
    return 'covered_by_worker_error_alert';
  }

  return 'covered_by_mixed_runtime_alerts';
}

export function summarizePlatformSnapshotRegression(
  snapshotRollup: PlatformSnapshotRollup,
): PlatformSnapshotRegression {
  if (snapshotRollup.buckets.length < 2) {
    return {
      hasRegression: false,
      severity: 'info',
      regressionStreak: 0,
      suppressed: false,
      suppressionReason: null,
      latestBucketStart: null,
      previousBucketStart: null,
      queuedDelta: null,
      oldestQueuedAgeDelta: null,
      alertCountDelta: null,
      failedCountDelta: null,
      workerConsecutiveErrorsDelta: null,
      reasons: [],
      recommendedActions: [],
    };
  }

  const latest = snapshotRollup.buckets[snapshotRollup.buckets.length - 1]!;
  const previous = snapshotRollup.buckets[snapshotRollup.buckets.length - 2]!;
  const pairSummary = summarizePlatformSnapshotRegressionPair(latest, previous);

  let regressionStreak = 0;
  for (let index = snapshotRollup.buckets.length - 1; index > 0; index--) {
    const current = snapshotRollup.buckets[index]!;
    const previousBucket = snapshotRollup.buckets[index - 1]!;
    if (!platformSnapshotBucketHasRegression(current, previousBucket)) break;
    regressionStreak += 1;
  }

  return {
    ...pairSummary,
    regressionStreak,
    suppressed: false,
    suppressionReason: null,
    latestBucketStart: latest.bucketStart,
    previousBucketStart: previous.bucketStart,
  };
}

export function summarizePlatformSnapshotMetricsSurface(
  recentSnapshots: PlatformSnapshot[],
  snapshotCadence: PlatformSnapshotCadence,
  snapshotRollup: PlatformSnapshotRollup,
  now = Date.now(),
): PlatformSnapshotMetricsSurface {
  const windowStartMs = now - PLATFORM_SNAPSHOT_METRICS_WINDOW_HOURS * 60 * 60_000;
  const snapshotsInWindow = recentSnapshots.filter(
    (snapshot) => Date.parse(snapshot.createdAt) >= windowStartMs,
  );
  const scheduledSnapshotsInWindow = snapshotsInWindow.filter(
    (snapshot) => snapshot.triggerType === 'scheduled',
  );
  const oldestSnapshotInWindow = snapshotsInWindow[snapshotsInWindow.length - 1] ?? null;
  const oldestScheduledSnapshotInWindow =
    scheduledSnapshotsInWindow[scheduledSnapshotsInWindow.length - 1] ?? null;
  const coveredMinutes = oldestSnapshotInWindow
    ? Math.max(1, Math.ceil((now - Date.parse(oldestSnapshotInWindow.createdAt)) / 60_000))
    : 0;
  const coveredHours = coveredMinutes === 0 ? 0 : Math.max(1, Math.ceil(coveredMinutes / 60));
  const expectedScheduledSnapshotCount =
    oldestScheduledSnapshotInWindow == null || snapshotCadence.status === 'awaiting_baseline'
      ? 0
      : Math.max(
          1,
          Math.ceil(
            Math.max(
              snapshotCadence.expectedIntervalMinutes,
              now - Date.parse(oldestScheduledSnapshotInWindow.createdAt),
            ) /
              (snapshotCadence.expectedIntervalMinutes * 60_000),
          ),
        );
  const cadenceAdherenceRate =
    expectedScheduledSnapshotCount > 0
      ? Math.min(1, scheduledSnapshotsInWindow.length / expectedScheduledSnapshotCount)
      : null;
  const rollupBucketsInWindow = snapshotRollup.buckets.filter(
    (bucket) => Date.parse(bucket.bucketEnd) >= windowStartMs,
  );
  let regressionWindowCount = 0;
  for (let index = 1; index < rollupBucketsInWindow.length; index++) {
    const current = rollupBucketsInWindow[index]!;
    const previous = rollupBucketsInWindow[index - 1]!;
    if (platformSnapshotBucketHasRegression(current, previous)) {
      regressionWindowCount += 1;
    }
  }

  return {
    windowHours: PLATFORM_SNAPSHOT_METRICS_WINDOW_HOURS,
    coveredHours,
    snapshotCount: snapshotsInWindow.length,
    scheduledSnapshotCount: scheduledSnapshotsInWindow.length,
    expectedScheduledSnapshotCount,
    cadenceAdherenceRate,
    regressionWindowCount,
    peakQueuedCount:
      rollupBucketsInWindow.length === 0
        ? 0
        : Math.max(...rollupBucketsInWindow.map((bucket) => bucket.maxQueuedCount)),
    peakOldestQueuedAgeMinutes:
      rollupBucketsInWindow.length === 0
        ? null
        : rollupBucketsInWindow.reduce<number | null>((maxAge, bucket) => {
            if (bucket.maxOldestQueuedAgeMinutes == null) return maxAge;
            return maxAge == null
              ? bucket.maxOldestQueuedAgeMinutes
              : Math.max(maxAge, bucket.maxOldestQueuedAgeMinutes);
          }, null),
    peakAlertCount:
      rollupBucketsInWindow.length === 0
        ? 0
        : Math.max(...rollupBucketsInWindow.map((bucket) => bucket.maxAlertCount)),
    peakFailedCount:
      rollupBucketsInWindow.length === 0
        ? 0
        : Math.max(...rollupBucketsInWindow.map((bucket) => bucket.maxFailedCount)),
    peakWorkerConsecutiveErrors:
      rollupBucketsInWindow.length === 0
        ? 0
        : Math.max(...rollupBucketsInWindow.map((bucket) => bucket.maxWorkerConsecutiveErrors)),
  };
}

export function summarizePlatformSnapshotSuppressionSurface(
  snapshotRollup: PlatformSnapshotRollup,
  now = Date.now(),
): PlatformSnapshotSuppressionSurface {
  const windowStartMs = now - PLATFORM_SNAPSHOT_METRICS_WINDOW_HOURS * 60 * 60_000;
  const rollupBucketsInWindow = snapshotRollup.buckets.filter(
    (bucket) => Date.parse(bucket.bucketEnd) >= windowStartMs,
  );
  const reasonCounts = new Map<string, number>();
  let suppressedRegressionCount = 0;
  let unsuppressedRegressionCount = 0;
  let activeSuppressionReason: string | null = null;
  let lastSuppressedBucketStart: string | null = null;

  for (let index = 1; index < rollupBucketsInWindow.length; index++) {
    const current = rollupBucketsInWindow[index]!;
    const previous = rollupBucketsInWindow[index - 1]!;
    const regression = summarizePlatformSnapshotRegressionPair(current, previous);
    if (!regression.hasRegression) {
      continue;
    }

    const suppressionReason = inferPlatformSnapshotSuppressionReason(regression);
    if (suppressionReason) {
      suppressedRegressionCount += 1;
      lastSuppressedBucketStart = current.bucketStart;
      if (index === rollupBucketsInWindow.length - 1) {
        activeSuppressionReason = suppressionReason;
      }
      reasonCounts.set(suppressionReason, (reasonCounts.get(suppressionReason) ?? 0) + 1);
    } else {
      unsuppressedRegressionCount += 1;
    }
  }

  return {
    windowHours: PLATFORM_SNAPSHOT_METRICS_WINDOW_HOURS,
    suppressedRegressionCount,
    unsuppressedRegressionCount,
    activeSuppressionReason,
    lastSuppressedBucketStart,
    topReasons: [...reasonCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([reason, count]) => ({ reason, count })),
  };
}

export function buildPlatformSnapshot(
  platformStats: PlatformAdminMetrics,
  triggerType: PlatformSnapshot['triggerType'],
): PlatformSnapshot {
  return {
    createdAt: new Date().toISOString(),
    triggerType,
    mockMode: platformStats.runtime.features.mockMode,
    queuedCount: platformStats.ingestion.queuedCount,
    oldestQueuedAgeMinutes: platformStats.ingestion.oldestQueuedAgeMinutes,
    runningCount: platformStats.ingestion.runningCount,
    staleRunningCount: platformStats.ingestion.staleRunningCount,
    failedCount: platformStats.ingestion.recentFailedCount,
    completedLastHour: platformStats.ingestion.completedLastHour,
    alertCount: platformStats.alerts.length,
    criticalAlertCount: platformStats.alertSummary.critical,
    warningAlertCount: platformStats.alertSummary.warning,
    infoAlertCount: platformStats.alertSummary.info,
    workerStatus: platformStats.worker.status,
    workerConsecutiveErrors: platformStats.worker.consecutiveErrors,
    workerLastProcessedAt: platformStats.worker.lastProcessedAt,
  };
}
