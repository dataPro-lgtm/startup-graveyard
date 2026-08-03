import { type AdminStats } from '@/lib/statsApi';
import type { DashboardMetrics } from '../metrics';
import { BarRow, ChartCard, EmptyState } from '../primitives';
import {
  commercialEventLabel,
  followUpStateLabel,
  formatCompactUsd,
  formatDateTime,
  formatPercent,
  outreachStatusLabel,
  playbookFailedSteps,
  playbookRunStatusLabel,
  playbookStepLabel,
  playbookTriggerLabel,
  recoveryStageLabel,
} from '../formatters';

export function TeamRecoverySection({ stats, m }: { stats: AdminStats; m: DashboardMetrics }) {
  const {
    subscriptionStats,
    billingFunnelStats,
    teamStats,
    playbookStats,
    maxPromptRuns,
    maxFallbackReason,
    maxTeamMetric,
    maxSubscriptionMetric,
    maxRecoveryActionMetric,
    maxRecoveryStageMetric,
    maxFollowUpStateMetric,
    maxRecoveryOutreachMetric,
    maxRecoveryPlaybookMetric,
    maxBillingFunnelMetric,
  } = m;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <ChartCard title="订阅转化结构">
          {subscriptionStats.totalUsers === 0 ? (
            <EmptyState text="当前还没有注册用户数据。" />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <BarRow
                label="Free 用户"
                value={subscriptionStats.freeUsers}
                max={maxSubscriptionMetric}
                color="#94a3b8"
                sub={`总用户 ${subscriptionStats.totalUsers}`}
              />
              <BarRow
                label="Pro 用户"
                value={subscriptionStats.proUsers}
                max={maxSubscriptionMetric}
                color="#38bdf8"
                sub={`past due ${subscriptionStats.pastDueUsers}`}
              />
              <BarRow
                label="Team 用户"
                value={subscriptionStats.teamUsers}
                max={maxSubscriptionMetric}
                color="#22c55e"
                sub={`到期取消 ${subscriptionStats.cancelingUsers}`}
              />
              <BarRow
                label="活跃付费用户"
                value={subscriptionStats.activePaidUsers}
                max={maxSubscriptionMetric}
                color="#f59e0b"
                sub={`付费转化 ${formatPercent(subscriptionStats.paidConversionRate)}`}
              />
            </div>
          )}
        </ChartCard>

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
                label="自动撤销邀请"
                value={teamStats.revokedInvites}
                max={maxTeamMetric}
                color="#ef4444"
                sub={`回退成员 ${teamStats.fallbackMembers}`}
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

        <ChartCard title="Workspace 恢复动作建议">
          {teamStats.recoveryActions.length === 0 ? (
            <EmptyState text="当前没有需要处理的 workspace 账单恢复动作。" compact />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {teamStats.recoveryActions.map((item) => (
                <BarRow
                  key={item.code}
                  label={item.title}
                  value={item.count}
                  max={maxRecoveryActionMetric}
                  color="#fb7185"
                  sub={item.code}
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Workspace 恢复阶段">
          {teamStats.recoveryStages.length === 0 ? (
            <EmptyState text="当前没有需要分配恢复阶段的 workspace。" compact />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {teamStats.recoveryStages.map((item) => (
                <BarRow
                  key={item.stage}
                  label={item.title}
                  value={item.count}
                  max={maxRecoveryStageMetric}
                  color="#7c93ff"
                  sub={item.stage}
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Workspace 触达自动化">
          {teamStats.recoveryOutreach.recent.length === 0 &&
          teamStats.recoveryOutreach.pendingOwner === 0 &&
          teamStats.recoveryOutreach.pendingAdmin === 0 &&
          teamStats.recoveryOutreach.pendingMemberEmail === 0 &&
          teamStats.recoveryOutreach.deliveredMemberEmail === 0 &&
          teamStats.recoveryOutreach.failedMemberEmail === 0 &&
          teamStats.recoveryOutreach.handedOff === 0 &&
          teamStats.recoveryOutreach.resolved === 0 ? (
            <EmptyState text="当前还没有触达自动化记录。" compact />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <BarRow
                label="Owner 待触达"
                value={teamStats.recoveryOutreach.pendingOwner}
                max={maxRecoveryOutreachMetric}
                color="#38bdf8"
                sub="系统待向 owner 展示恢复提示"
              />
              <BarRow
                label="运营待跟进"
                value={teamStats.recoveryOutreach.pendingAdmin}
                max={maxRecoveryOutreachMetric}
                color="#f97316"
                sub="仍需运营队列推进的 workspace"
              />
              <BarRow
                label="待发 Owner 邮件"
                value={teamStats.recoveryOutreach.pendingEmail}
                max={maxRecoveryOutreachMetric}
                color="#8b5cf6"
                sub="owner 待恢复触达里还没成功发出的邮件"
              />
              <BarRow
                label="Owner 邮件重试中"
                value={teamStats.recoveryOutreach.retryingEmail}
                max={maxRecoveryOutreachMetric}
                color="#a855f7"
                sub="最近一次 SMTP 失败，系统会在下个窗口自动再发"
              />
              <BarRow
                label="Owner 邮件已送达"
                value={teamStats.recoveryOutreach.deliveredEmail}
                max={maxRecoveryOutreachMetric}
                color="#22c55e"
                sub="本轮恢复触达的 owner 邮件已经成功发出"
              />
              <BarRow
                label="Owner 邮件失败"
                value={teamStats.recoveryOutreach.failedEmail}
                max={maxRecoveryOutreachMetric}
                color="#ef4444"
                sub="owner 邮件最近一次失败且没有自动重试窗口"
              />
              <BarRow
                label="待发成员邮件"
                value={teamStats.recoveryOutreach.pendingMemberEmail}
                max={maxRecoveryOutreachMetric}
                color="#60a5fa"
                sub="已回退成员里还没成功发出的通知邮件"
              />
              <BarRow
                label="成员邮件重试中"
                value={teamStats.recoveryOutreach.retryingMemberEmail}
                max={maxRecoveryOutreachMetric}
                color="#3b82f6"
                sub="最近一次成员通知 SMTP 失败，系统会自动补发"
              />
              <BarRow
                label="成员邮件已送达"
                value={teamStats.recoveryOutreach.deliveredMemberEmail}
                max={maxRecoveryOutreachMetric}
                color="#10b981"
                sub="本轮成员回退通知已经成功发出"
              />
              <BarRow
                label="成员邮件失败"
                value={teamStats.recoveryOutreach.failedMemberEmail}
                max={maxRecoveryOutreachMetric}
                color="#dc2626"
                sub="成员通知最近一次失败且没有自动重试窗口"
              />
              <BarRow
                label="多次跟进中"
                value={teamStats.recoveryOutreach.multiTouchPending}
                max={maxRecoveryOutreachMetric}
                color="#facc15"
                sub="至少已自动重试过一次的 pending 触达"
              />
              <BarRow
                label="已移交外部跟进"
                value={teamStats.recoveryOutreach.handedOff}
                max={maxRecoveryOutreachMetric}
                color="#a78bfa"
                sub="当前已交给 CRM / 人工跟进并暂停自动入队"
              />
              <BarRow
                label="待导出外部交接"
                value={teamStats.recoveryOutreach.pendingExport}
                max={maxRecoveryOutreachMetric}
                color="#60a5fa"
                sub="已 handoff 但还没导出到 CRM / 外部工作流"
              />
              <BarRow
                label="待同步 CRM"
                value={teamStats.recoveryOutreach.pendingCrmSync}
                max={maxRecoveryOutreachMetric}
                color="#2dd4bf"
                sub="已 handoff 到 CRM，但还没有生成外部 case / ticket"
              />
              <BarRow
                label="CRM 重试中"
                value={teamStats.recoveryOutreach.retryingCrmSync}
                max={maxRecoveryOutreachMetric}
                color="#14b8a6"
                sub="最近一次 CRM API 下发失败，系统会在下个窗口自动重试"
              />
              <BarRow
                label="CRM 已同步"
                value={teamStats.recoveryOutreach.syncedCrm}
                max={maxRecoveryOutreachMetric}
                color="#10b981"
                sub="已经在外部 CRM 创建了可跟进的恢复 case"
              />
              <BarRow
                label="CRM 同步失败"
                value={teamStats.recoveryOutreach.failedCrmSync}
                max={maxRecoveryOutreachMetric}
                color="#f97316"
                sub="CRM API 最近一次下发失败，仍需要自动或人工重试"
              />
              <BarRow
                label="待推送 Webhook"
                value={teamStats.recoveryOutreach.pendingWebhook}
                max={maxRecoveryOutreachMetric}
                color="#34d399"
                sub="已 handoff，但还没完成外部 webhook 投递"
              />
              <BarRow
                label="Webhook 重试中"
                value={teamStats.recoveryOutreach.retryingWebhook}
                max={maxRecoveryOutreachMetric}
                color="#f59e0b"
                sub="最近一次失败，系统将在下个窗口自动重试"
              />
              <BarRow
                label="Webhook 需人工接管"
                value={teamStats.recoveryOutreach.deadLetteredWebhook}
                max={maxRecoveryOutreachMetric}
                color="#fb7185"
                sub="已达到自动重试上限，必须人工强制重推或修复外部通道"
              />
              <BarRow
                label="待通知 Ops Slack"
                value={teamStats.recoveryOutreach.pendingSlackAlert}
                max={maxRecoveryOutreachMetric}
                color="#a855f7"
                sub="dead-letter 已出现，但还没成功告警到内部运维通道"
              />
              <BarRow
                label="Slack 已告警"
                value={teamStats.recoveryOutreach.alertedSlack}
                max={maxRecoveryOutreachMetric}
                color="#8b5cf6"
                sub="已成功把 dead-letter 交给 Ops Slack"
              />
              <BarRow
                label="Slack 告警失败"
                value={teamStats.recoveryOutreach.failedSlackAlert}
                max={maxRecoveryOutreachMetric}
                color="#ef4444"
                sub="内部运维告警通道本身也需要人工排查"
              />
              <BarRow
                label="Webhook 已投递"
                value={teamStats.recoveryOutreach.deliveredWebhook}
                max={maxRecoveryOutreachMetric}
                color="#22c55e"
                sub="已经完成外部 webhook 交接"
              />
              <BarRow
                label="Webhook 失败"
                value={teamStats.recoveryOutreach.failedWebhook}
                max={maxRecoveryOutreachMetric}
                color="#ef4444"
                sub="最近一次外部 webhook 推送失败"
              />
              <BarRow
                label="已收敛触达"
                value={teamStats.recoveryOutreach.resolved}
                max={maxRecoveryOutreachMetric}
                color="#22c55e"
                sub="风险恢复后已自动关闭的触达"
              />
              {teamStats.recoveryOutreach.recent.slice(0, 4).map((event) => (
                <div
                  key={event.id}
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
                    <div style={{ fontWeight: 700 }}>{event.workspaceName}</div>
                    <div style={{ color: '#9fb3ff', fontSize: 12 }}>
                      {event.audience === 'owner' ? 'Owner' : '运营'} ·{' '}
                      {event.status === 'pending'
                        ? '待处理'
                        : event.status === 'handed_off'
                          ? '已移交外部跟进'
                          : '已收敛'}
                    </div>
                  </div>
                  <div style={{ color: '#d7deef', fontSize: 13 }}>{event.title}</div>
                  <div style={{ color: '#8a96b0', fontSize: 12 }}>
                    第 {event.attemptCount} 次触达 · 最近一次 {formatDateTime(event.lastAttemptAt)}
                    {event.nextAttemptAt
                      ? ` · 下次重试 ${formatDateTime(event.nextAttemptAt)}`
                      : ''}
                    {event.lastEmailDeliveredAt
                      ? ` · owner 邮件已发${
                          event.lastEmailMessageId ? `（${event.lastEmailMessageId}）` : ''
                        }${
                          event.lastEmailAttemptAt
                            ? `（最近 ${formatDateTime(event.lastEmailAttemptAt)}）`
                            : ''
                        }`
                      : event.lastEmailError
                        ? ` · owner 邮件失败：${event.lastEmailError}${
                            event.nextEmailAttemptAt
                              ? ` · 下次自动重试 ${formatDateTime(event.nextEmailAttemptAt)}`
                              : ''
                          }`
                        : event.emailAttemptCount > 0
                          ? ` · owner 邮件已尝试 ${event.emailAttemptCount} 次${
                              event.lastEmailAttemptAt
                                ? `（最近 ${formatDateTime(event.lastEmailAttemptAt)}）`
                                : ''
                            }${
                              event.nextEmailAttemptAt
                                ? ` · 下次自动重试 ${formatDateTime(event.nextEmailAttemptAt)}`
                                : ''
                            }`
                          : ''}
                    {event.exportCount > 0
                      ? ` · 已导出 ${event.exportCount} 次${
                          event.lastExportedAt
                            ? `（最近 ${formatDateTime(event.lastExportedAt)}）`
                            : ''
                        }`
                      : ''}
                    {event.lastCrmSyncedAt
                      ? ` · CRM 已同步${
                          event.crmExternalRecordId ? `（Case ${event.crmExternalRecordId}）` : ''
                        }${
                          event.lastCrmSyncAttemptAt
                            ? `（最近 ${formatDateTime(event.lastCrmSyncAttemptAt)}）`
                            : ''
                        }`
                      : event.crmSyncCount > 0
                        ? ` · CRM 已尝试 ${event.crmSyncCount} 次${
                            event.lastCrmSyncAttemptAt
                              ? `（最近 ${formatDateTime(event.lastCrmSyncAttemptAt)}）`
                              : ''
                          }${
                            event.nextCrmSyncAttemptAt
                              ? ` · 下次自动重试 ${formatDateTime(event.nextCrmSyncAttemptAt)}`
                              : ''
                          }`
                        : event.lastCrmSyncError
                          ? ` · CRM 失败：${event.lastCrmSyncError}`
                          : ''}
                    {event.webhookDeliveryCount > 0
                      ? ` · webhook 已投递 ${event.webhookDeliveryCount} 次${
                          event.lastWebhookDeliveredAt
                            ? `（最近 ${formatDateTime(event.lastWebhookDeliveredAt)}）`
                            : ''
                        }`
                      : event.lastSlackAlertedAt
                        ? ` · Ops Slack 已告警${
                            event.lastSlackAlertAttemptAt
                              ? `（最近 ${formatDateTime(event.lastSlackAlertAttemptAt)}）`
                              : ''
                          }`
                        : event.webhookExhaustedAt
                          ? ` · webhook 已达到自动重试上限${
                              event.lastWebhookAttemptAt
                                ? `（最近 ${formatDateTime(event.lastWebhookAttemptAt)}）`
                                : ''
                            }`
                          : event.webhookAttemptCount > 0
                            ? ` · webhook 已尝试 ${event.webhookAttemptCount} 次${
                                event.lastWebhookAttemptAt
                                  ? `（最近 ${formatDateTime(event.lastWebhookAttemptAt)}）`
                                  : ''
                              }${
                                event.nextWebhookAttemptAt
                                  ? ` · 下次自动重试 ${formatDateTime(event.nextWebhookAttemptAt)}`
                                  : ''
                              }`
                            : event.lastWebhookError
                              ? ` · webhook 失败：${event.lastWebhookError}`
                              : ''}
                    {event.handoffAt ? ` · 已移交 ${formatDateTime(event.handoffAt)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Recovery Playbook 运行记录">
          {playbookStats.totalRuns === 0 ? (
            <EmptyState
              text="当前还没有 playbook 执行记录。定时任务或手动运行后，这里会出现最近编排结果。"
              compact
            />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <BarRow
                label="总执行次数"
                value={playbookStats.totalRuns}
                max={maxRecoveryPlaybookMetric}
                color="#c084fc"
                sub={`最近 ${formatDateTime(playbookStats.lastRunAt)}`}
              />
              <BarRow
                label="成功执行"
                value={playbookStats.successfulRuns}
                max={maxRecoveryPlaybookMetric}
                color="#22c55e"
                sub={playbookStats.lastRunOk === true ? '最近一次执行成功' : '历史成功 run'}
              />
              <BarRow
                label="失败执行"
                value={playbookStats.failedRuns}
                max={maxRecoveryPlaybookMetric}
                color="#ef4444"
                sub={playbookStats.lastRunOk === false ? '最近一次执行失败' : '待排查失败 run'}
              />
              <BarRow
                label="定时执行"
                value={playbookStats.scheduledRuns}
                max={maxRecoveryPlaybookMetric}
                color="#60a5fa"
                sub="scheduler 自动运行"
              />
              <BarRow
                label="手动执行"
                value={playbookStats.manualRuns}
                max={maxRecoveryPlaybookMetric}
                color="#f59e0b"
                sub="运营台手动触发"
              />
              <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
                {playbookStats.recent.map((run) => {
                  const failedSteps = playbookFailedSteps(run);
                  return (
                    <div
                      key={run.id}
                      style={{
                        border: `1px solid ${run.ok ? '#1f4d38' : '#4b2430'}`,
                        borderRadius: 12,
                        background: run.ok ? '#10251b' : '#23131a',
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
                          flexWrap: 'wrap',
                          fontSize: 12,
                          color: run.ok ? '#a7f3d0' : '#fecdd3',
                        }}
                      >
                        <strong>{playbookRunStatusLabel(run.ok)}</strong>
                        <span>{playbookTriggerLabel(run.triggerType)}</span>
                        <span>{formatDateTime(run.createdAt)}</span>
                      </div>
                      <div style={{ color: '#e5eefb', fontSize: 13 }}>{run.summary}</div>
                      <div style={{ color: '#8aa0c8', fontSize: 12 }}>
                        {failedSteps
                          ? `失败步骤：${failedSteps}`
                          : `retry=${run.retryIntervalHours}h · force=${run.force ? 'true' : 'false'}`}
                        {run.requestedSteps.length > 0
                          ? ` · 本次步骤：${run.requestedSteps.map((step) => playbookStepLabel(step)).join(' / ')}`
                          : ''}
                        {run.rerunOfRunId ? ` · 补跑自 ${run.rerunOfRunId.slice(0, 8)}` : ''}
                      </div>
                      {!run.ok && failedSteps ? (
                        <form
                          action="/admin/recovery-playbook/rerun"
                          method="post"
                          style={{ margin: 0, display: 'flex', justifyContent: 'flex-start' }}
                        >
                          <input type="hidden" name="runId" value={run.id} />
                          <button
                            type="submit"
                            style={{
                              border: '1px solid #7c3aed',
                              background: '#20123d',
                              color: '#ddd6fe',
                              borderRadius: 8,
                              padding: '6px 10px',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            仅补跑失败步骤
                          </button>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Workspace 跟进节奏">
          {teamStats.followUpStates.length === 0 ? (
            <EmptyState text="当前还没有需要跟进节奏判断的 workspace。" compact />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {teamStats.followUpStates.map((item) => (
                <BarRow
                  key={item.state}
                  label={followUpStateLabel(item.state)}
                  value={item.count}
                  max={maxFollowUpStateMetric}
                  color={
                    item.state === 'overdue'
                      ? '#ef4444'
                      : item.state === 'owner_engaged'
                        ? '#22c55e'
                        : item.state === 'recovered_followup'
                          ? '#38bdf8'
                          : '#f59e0b'
                  }
                  sub={item.title}
                />
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Workspace 恢复队列">
          {teamStats.actionableWorkspaces.length === 0 ? (
            <EmptyState text="当前没有需要运营介入的高风险 workspace。" compact />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {teamStats.actionableWorkspaces.map((workspace) => (
                <div
                  key={workspace.workspaceId}
                  style={{
                    border: '1px solid #24314f',
                    borderRadius: 14,
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
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{workspace.workspaceName}</div>
                      <div style={{ color: '#9fb3ff', fontSize: 12 }}>
                        {workspace.ownerDisplayName ?? workspace.ownerEmail} ·{' '}
                        {workspace.subscription.toUpperCase()} · {workspace.billingStatus}
                      </div>
                    </div>
                    <div style={{ color: '#9fb3ff', fontSize: 12 }}>
                      最近事件：{formatDateTime(workspace.lastBillingEventAt)}
                    </div>
                  </div>
                  <div style={{ color: '#d7deef', fontSize: 13, lineHeight: 1.7 }}>
                    席位 {workspace.seatsUsed}/{workspace.seatLimit}，已保留{' '}
                    {workspace.reservedSeats}
                    ，待接受邀请 {workspace.pendingInvites}，已撤销邀请 {workspace.revokedInvites}
                    ，回退成员 {workspace.fallbackMembers}
                  </div>
                  <div style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.7 }}>
                    风险信号：{workspace.warningCodes.join(' / ')}
                  </div>
                  <div style={{ color: '#c4d2ff', fontSize: 12, lineHeight: 1.7 }}>
                    建议动作：{workspace.recommendedActions.map((item) => item.title).join(' / ')}
                  </div>
                  <div style={{ color: '#c4d2ff', fontSize: 12, lineHeight: 1.7 }}>
                    恢复阶段：{recoveryStageLabel(workspace.recoveryStage)}
                  </div>
                  <div style={{ color: '#c4d2ff', fontSize: 12, lineHeight: 1.7 }}>
                    跟进状态：{followUpStateLabel(workspace.followUpState)}
                    {workspace.nextFollowUpAt
                      ? ` · 下次跟进 ${formatDateTime(workspace.nextFollowUpAt)}`
                      : ''}
                  </div>
                  <div style={{ color: '#9fb3ff', fontSize: 12, lineHeight: 1.7 }}>
                    最近商业化动作：{commercialEventLabel(workspace.lastCommercialEventType)} ·{' '}
                    {formatDateTime(workspace.lastCommercialEventAt)}
                    {workspace.lastCommercialEventSource
                      ? ` · 来源 ${workspace.lastCommercialEventSource}`
                      : ''}
                  </div>
                  <div style={{ color: '#9fb3ff', fontSize: 12, lineHeight: 1.7 }}>
                    最近触达：
                    {workspace.lastOutreachTitle
                      ? ` ${workspace.lastOutreachTitle} · ${formatDateTime(workspace.lastOutreachAt)}`
                      : ' 暂无'}
                    {workspace.lastOutreachAudience
                      ? ` · ${workspace.lastOutreachAudience === 'owner' ? 'Owner' : '运营'}`
                      : ''}
                    {workspace.lastOutreachStatus
                      ? ` · ${outreachStatusLabel(workspace.lastOutreachStatus)}`
                      : ''}
                    {workspace.lastOutreachAttemptCount
                      ? ` · 第 ${workspace.lastOutreachAttemptCount} 次`
                      : ''}
                    {workspace.lastOutreachEmailDeliveredAt
                      ? ` · owner 邮件已发${
                          workspace.lastOutreachEmailMessageId
                            ? `（${workspace.lastOutreachEmailMessageId}）`
                            : ''
                        }`
                      : workspace.lastOutreachEmailError
                        ? ` · owner 邮件失败：${workspace.lastOutreachEmailError}${
                            workspace.nextOutreachEmailAttemptAt
                              ? ` · 下次自动重试 ${formatDateTime(workspace.nextOutreachEmailAttemptAt)}`
                              : ''
                          }`
                        : workspace.lastOutreachEmailAttemptCount
                          ? ` · owner 邮件已尝试 ${workspace.lastOutreachEmailAttemptCount} 次${
                              workspace.nextOutreachEmailAttemptAt
                                ? ` · 下次自动重试 ${formatDateTime(workspace.nextOutreachEmailAttemptAt)}`
                                : ''
                            }`
                          : ''}
                    {workspace.nextOutreachAttemptAt
                      ? ` · 下次自动重试 ${formatDateTime(workspace.nextOutreachAttemptAt)}`
                      : ''}
                    {workspace.lastOutreachHandoffAt
                      ? ` · 已移交 ${formatDateTime(workspace.lastOutreachHandoffAt)}`
                      : ''}
                    {workspace.lastOutreachExportCount
                      ? ` · 已导出 ${workspace.lastOutreachExportCount} 次`
                      : ''}
                    {workspace.lastOutreachExportedAt
                      ? ` · 最近导出 ${formatDateTime(workspace.lastOutreachExportedAt)}`
                      : ''}
                    {workspace.lastOutreachCrmSyncedAt
                      ? ` · CRM 已同步 ${formatDateTime(workspace.lastOutreachCrmSyncedAt)}`
                      : ''}
                    {workspace.lastOutreachCrmExternalRecordId
                      ? ` · CRM Case ${workspace.lastOutreachCrmExternalRecordId}`
                      : ''}
                    {workspace.lastOutreachCrmSyncCount
                      ? ` · CRM 已尝试 ${workspace.lastOutreachCrmSyncCount} 次`
                      : ''}
                    {workspace.lastOutreachCrmSyncAttemptAt
                      ? ` · 最近 CRM 尝试 ${formatDateTime(workspace.lastOutreachCrmSyncAttemptAt)}`
                      : ''}
                    {workspace.nextOutreachCrmSyncAttemptAt
                      ? ` · 下次 CRM 重试 ${formatDateTime(workspace.nextOutreachCrmSyncAttemptAt)}`
                      : ''}
                    {workspace.lastOutreachWebhookDeliveryCount
                      ? ` · webhook 已投递 ${workspace.lastOutreachWebhookDeliveryCount} 次`
                      : ''}
                    {workspace.lastOutreachWebhookAttemptCount
                      ? ` · webhook 已尝试 ${workspace.lastOutreachWebhookAttemptCount} 次`
                      : ''}
                    {workspace.lastOutreachWebhookAttemptAt
                      ? ` · 最近 webhook 尝试 ${formatDateTime(workspace.lastOutreachWebhookAttemptAt)}`
                      : ''}
                    {workspace.nextOutreachWebhookAttemptAt
                      ? ` · 下次 webhook 重试 ${formatDateTime(workspace.nextOutreachWebhookAttemptAt)}`
                      : ''}
                    {workspace.lastOutreachWebhookExhaustedAt
                      ? ` · 已于 ${formatDateTime(workspace.lastOutreachWebhookExhaustedAt)} 停止自动重试`
                      : ''}
                    {workspace.lastOutreachWebhookDeliveredAt
                      ? ` · 最近 webhook ${formatDateTime(workspace.lastOutreachWebhookDeliveredAt)}`
                      : ''}
                    {workspace.lastOutreachSlackAlertedAt
                      ? ` · Ops Slack 已告警 ${formatDateTime(workspace.lastOutreachSlackAlertedAt)}`
                      : ''}
                  </div>
                  <div style={{ color: '#93c5fd', fontSize: 12, lineHeight: 1.7 }}>
                    成员回退通知：
                    {` 待发 ${workspace.memberRecoveryPendingCount} / 重试中 ${workspace.memberRecoveryRetryingCount} / 已送达 ${workspace.memberRecoveryDeliveredCount} / 失败 ${workspace.memberRecoveryFailedCount}`}
                    {workspace.memberRecoveryNextEmailAttemptAt
                      ? ` · 下次自动重试 ${formatDateTime(workspace.memberRecoveryNextEmailAttemptAt)}`
                      : ''}
                    {workspace.memberRecoveryLastEmailDeliveredAt
                      ? ` · 最近送达 ${formatDateTime(workspace.memberRecoveryLastEmailDeliveredAt)}`
                      : ''}
                  </div>
                  {workspace.lastOutreachWebhookError ? (
                    <div style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.7 }}>
                      最近 webhook 失败：{workspace.lastOutreachWebhookError}
                      {workspace.lastOutreachWebhookStatusCode
                        ? ` · HTTP ${workspace.lastOutreachWebhookStatusCode}`
                        : ''}
                    </div>
                  ) : null}
                  {workspace.lastOutreachCrmSyncError ? (
                    <div style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.7 }}>
                      最近 CRM API 失败：{workspace.lastOutreachCrmSyncError}
                      {workspace.lastOutreachCrmSyncStatusCode
                        ? ` · HTTP ${workspace.lastOutreachCrmSyncStatusCode}`
                        : ''}
                    </div>
                  ) : null}
                  {workspace.lastOutreachSlackAlertError ? (
                    <div style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.7 }}>
                      最近 Ops Slack 告警失败：{workspace.lastOutreachSlackAlertError}
                      {workspace.lastOutreachSlackAlertStatusCode
                        ? ` · HTTP ${workspace.lastOutreachSlackAlertStatusCode}`
                        : ''}
                    </div>
                  ) : null}
                  {workspace.memberRecoveryLastEmailError ? (
                    <div style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.7 }}>
                      最近成员回退邮件失败：{workspace.memberRecoveryLastEmailError}
                    </div>
                  ) : null}
                  {workspace.lastOutreachHandoffChannel || workspace.lastOutreachHandoffNote ? (
                    <div style={{ color: '#8a96b0', fontSize: 12, lineHeight: 1.7 }}>
                      外部跟进：
                      {workspace.lastOutreachHandoffChannel
                        ? ` ${workspace.lastOutreachHandoffChannel === 'crm' ? 'CRM' : '人工跟进'}`
                        : ''}
                      {workspace.lastOutreachHandoffNote
                        ? ` · ${workspace.lastOutreachHandoffNote}`
                        : ''}
                    </div>
                  ) : null}
                  {workspace.lastOutreachStatus !== 'handed_off' ? (
                    <form
                      action="/admin/recovery-outreach/handoff"
                      method="post"
                      style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
                    >
                      <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                      <input type="hidden" name="channel" value="crm" />
                      <input type="hidden" name="snoozeHours" value="48" />
                      <input
                        type="hidden"
                        name="note"
                        value="已从运营台移交到 CRM 跟进，48 小时后若未恢复则重新回到队列。"
                      />
                      <button
                        type="submit"
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid #5b4fd1',
                          background: '#171433',
                          color: '#d8ccff',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        移交到 CRM 并暂停 48h
                      </button>
                    </form>
                  ) : null}
                  {workspace.lastOutreachStatus === 'handed_off' &&
                  workspace.lastOutreachHandoffChannel === 'crm' &&
                  !workspace.lastOutreachCrmSyncedAt ? (
                    <div style={{ color: '#99f6e4', fontSize: 12 }}>
                      {workspace.nextOutreachCrmSyncAttemptAt
                        ? `这条 handoff 还没完成 CRM case 同步，系统会在 ${formatDateTime(workspace.nextOutreachCrmSyncAttemptAt)} 自动重试；若要立即重推，可直接用页顶的 CRM Case 入口。`
                        : '这条 handoff 还没完成 CRM case 同步，可直接用页顶的 CRM Case 入口立即下发。'}
                    </div>
                  ) : null}
                  {workspace.lastOutreachStatus === 'handed_off' &&
                  !workspace.lastOutreachExportedAt ? (
                    <div style={{ color: '#bfdbfe', fontSize: 12 }}>
                      这条 handoff 还没导出到外部系统，可用页顶的 CRM CSV 导出入口统一交付。
                    </div>
                  ) : null}
                  {workspace.lastOutreachStatus === 'handed_off' &&
                  !workspace.lastOutreachWebhookDeliveredAt ? (
                    <div style={{ color: '#a7f3d0', fontSize: 12 }}>
                      {workspace.lastOutreachWebhookExhaustedAt
                        ? workspace.lastOutreachSlackAlertedAt
                          ? '这条 handoff 已达到 webhook 自动重试上限，Ops Slack 已收到告警；接下来需要人工强制重推或先处理 CRM endpoint。'
                          : '这条 handoff 已达到 webhook 自动重试上限，不会再自动外推；建议先通知 Ops Slack，再决定是否人工强制重推。'
                        : workspace.nextOutreachWebhookAttemptAt
                          ? `这条 handoff 还没完成 webhook 推送，系统会在 ${formatDateTime(workspace.nextOutreachWebhookAttemptAt)} 自动重试；若要立即重推，可直接用页顶的 CRM Webhook 入口。`
                          : '这条 handoff 还没完成 webhook 推送，可用页顶的 CRM Webhook 入口直接投递。'}
                    </div>
                  ) : null}
                  {workspace.lastBillingEventTitle ? (
                    <div style={{ color: '#8a96b0', fontSize: 12 }}>
                      最新事件：{workspace.lastBillingEventTitle}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Billing 转化与恢复">
          {billingFunnelStats.checkoutStarts === 0 &&
          billingFunnelStats.portalStarts === 0 &&
          billingFunnelStats.recoveredSubscriptions === 0 ? (
            <EmptyState text="当前还没有商业化漏斗动作数据。首次发起 checkout 或 billing portal 后，这里会出现转化与恢复指标。" />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <BarRow
                label="Checkout 发起"
                value={billingFunnelStats.checkoutStarts}
                max={maxBillingFunnelMetric}
                color="#6366f1"
                sub={`Team ${billingFunnelStats.teamCheckoutStarts} / Pro ${billingFunnelStats.proCheckoutStarts}`}
              />
              <BarRow
                label="Checkout 完成"
                value={billingFunnelStats.checkoutCompletions}
                max={maxBillingFunnelMetric}
                color="#14b8a6"
                sub={`完成率 ${formatPercent(billingFunnelStats.checkoutCompletionRate)}`}
              />
              <BarRow
                label="Billing Portal"
                value={billingFunnelStats.portalStarts}
                max={maxBillingFunnelMetric}
                color="#38bdf8"
                sub="账单修改与恢复入口"
              />
              <BarRow
                label="订阅恢复"
                value={billingFunnelStats.recoveredSubscriptions}
                max={maxBillingFunnelMetric}
                color="#f97316"
                sub="从 past due / canceling 恢复到健康状态"
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
    </>
  );
}
