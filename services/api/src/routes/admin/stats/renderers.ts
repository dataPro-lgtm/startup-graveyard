import type { CommercialAdminMetrics, PlatformAdminMetrics } from '@sg/shared/schemas/adminStats';

export function csvCell(value: string | number | null): string {
  if (value == null) return '';
  const raw = String(value);
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

export function renderPlatformSnapshotReportCsv(platform: PlatformAdminMetrics): string {
  const header = [
    'section',
    'generated_at',
    'cadence_status',
    'expected_interval_minutes',
    'last_captured_at',
    'last_scheduled_captured_at',
    'expected_next_snapshot_at',
    'missed_intervals',
    'window_hours',
    'covered_hours',
    'snapshot_count',
    'scheduled_snapshot_count',
    'expected_scheduled_snapshot_count',
    'cadence_adherence_rate',
    'regression_window_count',
    'peak_queued_count',
    'peak_oldest_queued_age_minutes',
    'peak_alert_count',
    'peak_failed_count',
    'peak_worker_consecutive_errors',
    'suppressed_regression_count',
    'unsuppressed_regression_count',
    'active_suppression_reason',
    'last_suppressed_bucket_start',
    'top_suppression_reasons',
    'latest_regression_severity',
    'latest_regression_streak',
    'latest_regression_suppressed',
    'latest_regression_reasons',
    'latest_regression_actions',
    'bucket_start',
    'bucket_end',
    'bucket_sample_count',
    'bucket_avg_queued_count',
    'bucket_max_queued_count',
    'bucket_max_oldest_queued_age_minutes',
    'bucket_max_alert_count',
    'bucket_max_failed_count',
    'bucket_max_worker_consecutive_errors',
  ];
  const lines = [header.join(',')];

  lines.push(
    [
      'summary',
      platform.runtime.generatedAt,
      platform.snapshotCadence.status,
      platform.snapshotCadence.expectedIntervalMinutes,
      platform.snapshotCadence.lastCapturedAt,
      platform.snapshotCadence.lastScheduledCapturedAt,
      platform.snapshotCadence.expectedNextSnapshotAt,
      platform.snapshotCadence.missedIntervals,
      platform.snapshotMetrics.windowHours,
      platform.snapshotMetrics.coveredHours,
      platform.snapshotMetrics.snapshotCount,
      platform.snapshotMetrics.scheduledSnapshotCount,
      platform.snapshotMetrics.expectedScheduledSnapshotCount,
      platform.snapshotMetrics.cadenceAdherenceRate == null
        ? null
        : platform.snapshotMetrics.cadenceAdherenceRate.toFixed(4),
      platform.snapshotMetrics.regressionWindowCount,
      platform.snapshotMetrics.peakQueuedCount,
      platform.snapshotMetrics.peakOldestQueuedAgeMinutes,
      platform.snapshotMetrics.peakAlertCount,
      platform.snapshotMetrics.peakFailedCount,
      platform.snapshotMetrics.peakWorkerConsecutiveErrors,
      platform.snapshotSuppression.suppressedRegressionCount,
      platform.snapshotSuppression.unsuppressedRegressionCount,
      platform.snapshotSuppression.activeSuppressionReason,
      platform.snapshotSuppression.lastSuppressedBucketStart,
      platform.snapshotSuppression.topReasons
        .map((item) => `${item.reason}:${item.count}`)
        .join(' | '),
      platform.snapshotRegression.severity,
      platform.snapshotRegression.regressionStreak,
      platform.snapshotRegression.suppressed ? 'true' : 'false',
      platform.snapshotRegression.reasons.join(' | '),
      platform.snapshotRegression.recommendedActions.join(' | '),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]
      .map(csvCell)
      .join(','),
  );

  for (const bucket of platform.snapshotRollup.buckets) {
    lines.push(
      [
        'rollup',
        platform.runtime.generatedAt,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        bucket.bucketStart,
        bucket.bucketEnd,
        bucket.sampleCount,
        bucket.avgQueuedCount,
        bucket.maxQueuedCount,
        bucket.maxOldestQueuedAgeMinutes,
        bucket.maxAlertCount,
        bucket.maxFailedCount,
        bucket.maxWorkerConsecutiveErrors,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return lines.join('\n');
}

export function renderPlatformSnapshotBriefMarkdown(platform: PlatformAdminMetrics): string {
  const lines = [
    '# Platform Snapshot Incident Brief',
    '',
    `Generated at: ${platform.runtime.generatedAt}`,
    '',
    '## Runtime',
    `- Service: ${platform.runtime.service}`,
    `- Environment: ${platform.runtime.env}`,
    `- Node: ${platform.runtime.nodeVersion}`,
    `- Mock mode: ${platform.runtime.features.mockMode ? 'yes' : 'no'}`,
    `- Uptime seconds: ${platform.runtime.uptimeSeconds}`,
    '',
    '## Queue And Worker',
    `- Queued count: ${platform.ingestion.queuedCount}`,
    `- Oldest queued age minutes: ${platform.ingestion.oldestQueuedAgeMinutes ?? 'N/A'}`,
    `- Completed last hour: ${platform.ingestion.completedLastHour}`,
    `- Worker status: ${platform.worker.status}`,
    `- Worker consecutive errors: ${platform.worker.consecutiveErrors}`,
    `- Worker last processed at: ${platform.worker.lastProcessedAt ?? 'N/A'}`,
    '',
    '## Snapshot Cadence',
    `- Status: ${platform.snapshotCadence.status}`,
    `- Expected interval minutes: ${platform.snapshotCadence.expectedIntervalMinutes}`,
    `- Last scheduled snapshot: ${platform.snapshotCadence.lastScheduledCapturedAt ?? 'N/A'}`,
    `- Expected next snapshot: ${platform.snapshotCadence.expectedNextSnapshotAt ?? 'N/A'}`,
    `- Missed intervals: ${platform.snapshotCadence.missedIntervals}`,
    '',
    '## Snapshot Metrics (24h)',
    `- Covered hours: ${platform.snapshotMetrics.coveredHours}`,
    `- Snapshot count: ${platform.snapshotMetrics.snapshotCount}`,
    `- Scheduled snapshot count: ${platform.snapshotMetrics.scheduledSnapshotCount}/${platform.snapshotMetrics.expectedScheduledSnapshotCount}`,
    `- Cadence adherence: ${
      platform.snapshotMetrics.cadenceAdherenceRate == null
        ? 'N/A'
        : `${Math.round(platform.snapshotMetrics.cadenceAdherenceRate * 100)}%`
    }`,
    `- Regression windows: ${platform.snapshotMetrics.regressionWindowCount}`,
    `- Peak queued count: ${platform.snapshotMetrics.peakQueuedCount}`,
    `- Peak queued age minutes: ${platform.snapshotMetrics.peakOldestQueuedAgeMinutes ?? 'N/A'}`,
    `- Peak alert count: ${platform.snapshotMetrics.peakAlertCount}`,
    `- Peak failed count: ${platform.snapshotMetrics.peakFailedCount}`,
    `- Peak worker consecutive errors: ${platform.snapshotMetrics.peakWorkerConsecutiveErrors}`,
    '',
    '## Regression Alert Suppression',
    `- Suppressed regression windows: ${platform.snapshotSuppression.suppressedRegressionCount}`,
    `- Unsuppressed regression windows: ${platform.snapshotSuppression.unsuppressedRegressionCount}`,
    `- Active suppression reason: ${platform.snapshotSuppression.activeSuppressionReason ?? 'N/A'}`,
    `- Last suppressed bucket start: ${platform.snapshotSuppression.lastSuppressedBucketStart ?? 'N/A'}`,
    ...(platform.snapshotSuppression.topReasons.length > 0
      ? [
          `- Top suppression reasons: ${platform.snapshotSuppression.topReasons
            .map((item) => `${item.reason} (${item.count})`)
            .join(' | ')}`,
        ]
      : ['- Top suppression reasons: none']),
    '',
    '## Latest Regression Signal',
    platform.snapshotRegression.hasRegression
      ? `- Severity ${platform.snapshotRegression.severity}, streak ${platform.snapshotRegression.regressionStreak}, suppressed ${platform.snapshotRegression.suppressed ? 'yes' : 'no'}`
      : '- No active regression signal across the latest comparable buckets',
    platform.snapshotRegression.hasRegression
      ? `- Reasons: ${platform.snapshotRegression.reasons.join(' | ')}`
      : null,
    platform.snapshotRegression.recommendedActions.length > 0
      ? `- Recommended actions: ${platform.snapshotRegression.recommendedActions.join(' | ')}`
      : null,
    '',
    '## Current Alerts',
    ...(platform.alerts.length > 0
      ? platform.alerts.map(
          (alert) => `- [${alert.severity}] ${alert.code}: ${alert.title} — ${alert.detail}`,
        )
      : ['- No active platform alerts']),
    '',
    '## Recent Rollup Buckets',
    '| Window | Samples | Avg queued | Max queued | Max queued age | Max alerts | Max failed | Max worker errors |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...platform.snapshotRollup.buckets.map(
      (bucket) =>
        `| ${bucket.bucketStart} -> ${bucket.bucketEnd} | ${bucket.sampleCount} | ${bucket.avgQueuedCount} | ${bucket.maxQueuedCount} | ${bucket.maxOldestQueuedAgeMinutes ?? 'N/A'} | ${bucket.maxAlertCount} | ${bucket.maxFailedCount} | ${bucket.maxWorkerConsecutiveErrors} |`,
    ),
    '',
    '## Recent Failed Ingestion Jobs',
    ...(platform.ingestion.recentFailed.length > 0
      ? platform.ingestion.recentFailed.map(
          (job) =>
            `- ${job.sourceName} / ${job.triggerType} / ${job.createdAt} / ${job.errorMessage ?? 'no error message'}`,
        )
      : ['- No recent failed ingestion jobs']),
  ].filter((line): line is string => line != null);

  return `${lines.join('\n')}\n`;
}

export function renderRecoveryQueueCsv(
  items: CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'],
): string {
  const header = [
    'workspace_name',
    'owner_email',
    'subscription',
    'billing_status',
    'recovery_stage',
    'follow_up_state',
    'next_follow_up_at',
    'seat_limit',
    'seats_used',
    'reserved_seats',
    'pending_invites',
    'revoked_invites',
    'fallback_members',
    'warning_codes',
    'recommended_actions',
    'last_commercial_event_type',
    'last_commercial_event_at',
    'last_outreach_title',
    'last_outreach_at',
    'last_outreach_attempt_count',
    'next_outreach_attempt_at',
    'last_outreach_email_attempt_count',
    'last_outreach_email_attempt_at',
    'next_outreach_email_attempt_at',
    'last_outreach_email_delivered_at',
    'last_outreach_email_message_id',
    'last_outreach_email_error',
    'last_outreach_export_count',
    'last_outreach_exported_at',
    'last_outreach_crm_sync_count',
    'last_outreach_crm_sync_attempt_at',
    'next_outreach_crm_sync_attempt_at',
    'last_outreach_crm_synced_at',
    'last_outreach_crm_external_record_id',
    'last_outreach_crm_sync_status_code',
    'last_outreach_crm_sync_error',
    'last_outreach_webhook_attempt_count',
    'last_outreach_webhook_attempt_at',
    'next_outreach_webhook_attempt_at',
    'last_outreach_webhook_exhausted_at',
    'last_outreach_webhook_delivery_count',
    'last_outreach_webhook_delivered_at',
    'last_outreach_webhook_status_code',
    'last_outreach_webhook_error',
    'last_outreach_slack_alert_count',
    'last_outreach_slack_alert_attempt_at',
    'last_outreach_slack_alerted_at',
    'last_outreach_slack_alert_status_code',
    'last_outreach_slack_alert_error',
    'last_outreach_handoff_channel',
    'last_outreach_handoff_at',
    'last_outreach_handoff_note',
    'member_recovery_pending_count',
    'member_recovery_retrying_count',
    'member_recovery_delivered_count',
    'member_recovery_failed_count',
    'member_recovery_next_email_attempt_at',
    'member_recovery_last_email_delivered_at',
    'member_recovery_last_email_error',
    'last_outreach_status',
  ];
  const lines = [header.join(',')];
  for (const item of items) {
    lines.push(
      [
        item.workspaceName,
        item.ownerEmail,
        item.subscription,
        item.billingStatus,
        item.recoveryStage,
        item.followUpState,
        item.nextFollowUpAt,
        item.seatLimit,
        item.seatsUsed,
        item.reservedSeats,
        item.pendingInvites,
        item.revokedInvites,
        item.fallbackMembers,
        item.warningCodes.join(' | '),
        item.recommendedActions.map((action) => action.title).join(' | '),
        item.lastCommercialEventType,
        item.lastCommercialEventAt,
        item.lastOutreachTitle,
        item.lastOutreachAt,
        item.lastOutreachAttemptCount,
        item.nextOutreachAttemptAt,
        item.lastOutreachEmailAttemptCount,
        item.lastOutreachEmailAttemptAt,
        item.nextOutreachEmailAttemptAt,
        item.lastOutreachEmailDeliveredAt,
        item.lastOutreachEmailMessageId,
        item.lastOutreachEmailError,
        item.lastOutreachExportCount,
        item.lastOutreachExportedAt,
        item.lastOutreachCrmSyncCount,
        item.lastOutreachCrmSyncAttemptAt,
        item.nextOutreachCrmSyncAttemptAt,
        item.lastOutreachCrmSyncedAt,
        item.lastOutreachCrmExternalRecordId,
        item.lastOutreachCrmSyncStatusCode,
        item.lastOutreachCrmSyncError,
        item.lastOutreachWebhookAttemptCount,
        item.lastOutreachWebhookAttemptAt,
        item.nextOutreachWebhookAttemptAt,
        item.lastOutreachWebhookExhaustedAt,
        item.lastOutreachWebhookDeliveryCount,
        item.lastOutreachWebhookDeliveredAt,
        item.lastOutreachWebhookStatusCode,
        item.lastOutreachWebhookError,
        item.lastOutreachSlackAlertCount,
        item.lastOutreachSlackAlertAttemptAt,
        item.lastOutreachSlackAlertedAt,
        item.lastOutreachSlackAlertStatusCode,
        item.lastOutreachSlackAlertError,
        item.lastOutreachHandoffChannel,
        item.lastOutreachHandoffAt,
        item.lastOutreachHandoffNote,
        item.memberRecoveryPendingCount,
        item.memberRecoveryRetryingCount,
        item.memberRecoveryDeliveredCount,
        item.memberRecoveryFailedCount,
        item.memberRecoveryNextEmailAttemptAt,
        item.memberRecoveryLastEmailDeliveredAt,
        item.memberRecoveryLastEmailError,
        item.lastOutreachStatus,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

export function renderRecoveryHandoffCsv(
  items: CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'],
): string {
  const header = [
    'workspace_name',
    'owner_email',
    'subscription',
    'billing_status',
    'recovery_stage',
    'follow_up_state',
    'warning_codes',
    'recommended_actions',
    'last_outreach_title',
    'last_outreach_handoff_channel',
    'last_outreach_handoff_note',
    'last_outreach_handoff_at',
    'last_outreach_email_attempt_count',
    'last_outreach_email_attempt_at',
    'next_outreach_email_attempt_at',
    'last_outreach_email_delivered_at',
    'last_outreach_email_message_id',
    'last_outreach_email_error',
    'last_outreach_export_count',
    'last_outreach_exported_at',
    'last_outreach_crm_sync_count',
    'last_outreach_crm_sync_attempt_at',
    'next_outreach_crm_sync_attempt_at',
    'last_outreach_crm_synced_at',
    'last_outreach_crm_external_record_id',
    'last_outreach_crm_sync_status_code',
    'last_outreach_crm_sync_error',
    'last_outreach_webhook_attempt_count',
    'last_outreach_webhook_attempt_at',
    'next_outreach_webhook_attempt_at',
    'last_outreach_webhook_exhausted_at',
    'last_outreach_webhook_delivery_count',
    'last_outreach_webhook_delivered_at',
    'last_outreach_webhook_status_code',
    'last_outreach_webhook_error',
    'last_outreach_slack_alert_count',
    'last_outreach_slack_alert_attempt_at',
    'last_outreach_slack_alerted_at',
    'last_outreach_slack_alert_status_code',
    'last_outreach_slack_alert_error',
  ];
  const lines = [header.join(',')];
  for (const item of items) {
    lines.push(
      [
        item.workspaceName,
        item.ownerEmail,
        item.subscription,
        item.billingStatus,
        item.recoveryStage,
        item.followUpState,
        item.warningCodes.join(' | '),
        item.recommendedActions.map((action) => action.title).join(' | '),
        item.lastOutreachTitle,
        item.lastOutreachHandoffChannel,
        item.lastOutreachHandoffNote,
        item.lastOutreachHandoffAt,
        item.lastOutreachEmailAttemptCount,
        item.lastOutreachEmailAttemptAt,
        item.nextOutreachEmailAttemptAt,
        item.lastOutreachEmailDeliveredAt,
        item.lastOutreachEmailMessageId,
        item.lastOutreachEmailError,
        item.lastOutreachExportCount,
        item.lastOutreachExportedAt,
        item.lastOutreachCrmSyncCount,
        item.lastOutreachCrmSyncAttemptAt,
        item.nextOutreachCrmSyncAttemptAt,
        item.lastOutreachCrmSyncedAt,
        item.lastOutreachCrmExternalRecordId,
        item.lastOutreachCrmSyncStatusCode,
        item.lastOutreachCrmSyncError,
        item.lastOutreachWebhookAttemptCount,
        item.lastOutreachWebhookAttemptAt,
        item.nextOutreachWebhookAttemptAt,
        item.lastOutreachWebhookExhaustedAt,
        item.lastOutreachWebhookDeliveryCount,
        item.lastOutreachWebhookDeliveredAt,
        item.lastOutreachWebhookStatusCode,
        item.lastOutreachWebhookError,
        item.lastOutreachSlackAlertCount,
        item.lastOutreachSlackAlertAttemptAt,
        item.lastOutreachSlackAlertedAt,
        item.lastOutreachSlackAlertStatusCode,
        item.lastOutreachSlackAlertError,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}
