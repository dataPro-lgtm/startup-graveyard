import type { AdminStats } from '@/lib/statsApi';

export function formatPercent(rate: number | null): string {
  if (rate == null) return 'N/A';
  return `${(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%`;
}

export function formatCompactUsd(value: number | null): string {
  if (value == null) return 'N/A';
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return '$0';
}

export function formatSignedDelta(value: number | null, suffix = ''): string {
  if (value == null) return 'N/A';
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? '+' : ''}${value}${suffix}`;
}

export function formatMaybeDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatDateTime(value: string | null): string {
  if (!value) return '暂无';
  return new Date(value).toLocaleString('zh-CN');
}

export function formatTimeWindow(start: string, end: string): string {
  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

export function platformSnapshotTriggerLabel(
  triggerType: AdminStats['platform']['recentSnapshots'][number]['triggerType'],
): string {
  return triggerType === 'manual' ? '手动捕获' : '定时捕获';
}

export function platformAlertSeverityLabel(
  severity: AdminStats['platform']['alerts'][number]['severity'],
): string {
  if (severity === 'critical') return 'Critical';
  if (severity === 'warning') return 'Warning';
  return 'Info';
}

export function platformAlertSeverityColor(
  severity: AdminStats['platform']['alerts'][number]['severity'],
): string {
  if (severity === 'critical') return '#fb7185';
  if (severity === 'warning') return '#f59e0b';
  return '#38bdf8';
}

export function workerStatusLabel(status: AdminStats['platform']['worker']['status']): string {
  if (status === 'disabled') return 'Disabled';
  if (status === 'starting') return 'Starting';
  if (status === 'idle') return 'Idle';
  if (status === 'processing') return 'Processing';
  if (status === 'error') return 'Error';
  return 'Stopped';
}

export function workerTickOutcomeLabel(
  outcome: AdminStats['platform']['worker']['recentTicks'][number]['outcome'],
): string {
  if (outcome === 'processed') return 'Processed';
  if (outcome === 'empty_queue') return 'Empty Queue';
  return 'Error';
}

export function commercialEventLabel(
  type: AdminStats['commercial']['billingFunnel']['recentEvents'][number]['type'] | null,
): string {
  if (type === 'checkout_started') return '已发起 checkout';
  if (type === 'checkout_completed') return '已完成 checkout';
  if (type === 'portal_started') return '已打开 billing portal';
  if (type === 'subscription_recovered') return '订阅已恢复';
  return '暂无商业化动作';
}

export function recoveryStageLabel(
  stage: AdminStats['commercial']['teamWorkspaces']['actionableWorkspaces'][number]['recoveryStage'],
): string {
  if (stage === 'needs_outreach') return '尚未触达';
  if (stage === 'owner_engaged') return 'Owner 已开始恢复';
  return '已恢复待收尾';
}

export function followUpStateLabel(
  state: AdminStats['commercial']['teamWorkspaces']['actionableWorkspaces'][number]['followUpState'],
): string {
  if (state === 'needs_initial_touch') return '待首次触达';
  if (state === 'awaiting_owner') return '等待 Owner 响应';
  if (state === 'overdue') return '已逾期待跟进';
  if (state === 'owner_engaged') return 'Owner 已响应';
  return '恢复待收尾';
}

export function outreachStatusLabel(
  status: AdminStats['commercial']['teamWorkspaces']['actionableWorkspaces'][number]['lastOutreachStatus'],
): string {
  if (status === 'pending') return '待处理';
  if (status === 'handed_off') return '已移交外部跟进';
  if (status === 'resolved') return '已收敛';
  return '暂无';
}

export function playbookStepLabel(
  step: AdminStats['commercial']['teamWorkspaces']['recoveryPlaybook']['recent'][number]['requestedSteps'][number],
): string {
  if (step === 'outreach') return 'outreach';
  if (step === 'ownerEmail') return 'owner email';
  if (step === 'memberEmail') return 'member email';
  if (step === 'crmSync') return 'crm';
  if (step === 'webhook') return 'webhook';
  return 'slack';
}

export function playbookTriggerLabel(triggerType: string): string {
  if (triggerType === 'scheduled') return '定时执行';
  if (triggerType === 'manual') return '手动执行';
  if (triggerType === 'manual_rerun') return '失败步骤补跑';
  return triggerType;
}

export function playbookRunStatusLabel(ok: boolean): string {
  return ok ? '成功' : '失败';
}

export function playbookFailedSteps(
  run: AdminStats['commercial']['teamWorkspaces']['recoveryPlaybook']['recent'][number],
): string {
  return run.requestedSteps
    .filter((key) => run.steps[key].status === 'failed')
    .map((key) => playbookStepLabel(key))
    .join(' / ');
}
