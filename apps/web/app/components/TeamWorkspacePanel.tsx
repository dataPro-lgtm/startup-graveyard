'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { getAccessToken } from '@/lib/authApi';
import { caseListHref, casesListPath, type CasesSearchParams } from '@/lib/casesApi';
import {
  TEAM_WORKSPACE_REFRESH_EVENT,
  acceptTeamWorkspaceInvite,
  createTeamWorkspace,
  fetchTeamWorkspaceContext,
  inviteTeamWorkspaceMember,
  isApiError,
  notifyTeamWorkspaceUpdated,
} from '@/lib/teamWorkspaceApi';
import { PLAN_LABELS } from '@sg/shared/billing';
import { industryLabel, primaryFailureReasonLabel } from '@sg/shared/taxonomy';
import type {
  TeamWorkspaceBilling,
  TeamWorkspaceBillingWarning,
  TeamWorkspaceContextResponse,
} from '@sg/shared/schemas/teamWorkspace';

function apiErrorMessage(error: { error: string }) {
  if (error.error === 'entitlement_required') return 'Team Workspace 仅对 Team 套餐开放创建。';
  if (error.error === 'already_in_workspace') return '当前账户已经加入了一个团队工作区。';
  if (error.error === 'user_already_in_workspace') return '该邮箱对应用户已经在别的团队工作区中。';
  if (error.error === 'seat_limit_reached') return '当前工作区席位已满，无法继续邀请。';
  if (error.error === 'workspace_plan_inactive') {
    return '当前 Team 工作区账单未处于可用状态，邀请功能已暂停。';
  }
  if (error.error === 'email_mismatch') return '邀请邮箱和当前登录账户不一致。';
  if (error.error === 'workspace_not_found') return '当前还没有可操作的团队工作区。';
  if (error.error === 'forbidden') return '当前角色没有成员管理权限。';
  if (error.error === 'invite_not_found') return '邀请不存在，或已经被处理。';
  return `团队工作区操作失败：${error.error}`;
}

function billingStatusLabel(value: TeamWorkspaceBilling['billingStatus']) {
  if (value === 'active') return '正常订阅';
  if (value === 'trialing') return '试用中';
  if (value === 'past_due') return '付款待处理';
  if (value === 'canceled') return '已取消';
  return '未激活';
}

function warningMessage(code: TeamWorkspaceBillingWarning) {
  if (code === 'workspace_plan_inactive') {
    return '账单所有者当前不在有效 Team 计费状态，工作区已进入降级风险状态。';
  }
  if (code === 'past_due') {
    return '当前订阅处于 past due，若未及时补款，团队能力会被进一步收紧。';
  }
  if (code === 'cancel_at_period_end') {
    return '当前订阅已设置到期取消，请在周期结束前确认是否续费。';
  }
  return '当前席位已经用满，新的成员邀请会被阻止。';
}

export function TeamWorkspacePanel() {
  const { user, loading } = useAuth();
  const [context, setContext] = useState<TeamWorkspaceContextResponse | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const defaultWorkspaceName = user?.displayName ? `${user.displayName} Team` : 'Research Team';

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      if (!user) {
        setContext(null);
        return;
      }
      const token = getAccessToken();
      if (!token) return;
      setFetching(true);
      const res = await fetchTeamWorkspaceContext(token);
      if (cancelled) return;
      if (isApiError(res)) {
        setError(apiErrorMessage(res));
      } else {
        setContext(res);
        setError(null);
      }
      setFetching(false);
    }

    void loadContext();
    const onRefresh = () => {
      void loadContext();
    };
    window.addEventListener(TEAM_WORKSPACE_REFRESH_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(TEAM_WORKSPACE_REFRESH_EVENT, onRefresh);
    };
  }, [user]);

  if (loading || !user) return null;

  async function handleCreateWorkspace() {
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await createTeamWorkspace(token, {
      name: workspaceName.trim() || defaultWorkspaceName,
    });
    setSaving(false);
    if (isApiError(res)) {
      setError(apiErrorMessage(res));
      return;
    }
    setContext({
      canCreateWorkspace: false,
      hasWorkspace: true,
      workspace: res.workspace,
      pendingInvites: [],
    });
    setMessage('团队工作区已创建。现在可以邀请成员并共享案例 / Saved Views。');
    notifyTeamWorkspaceUpdated();
  }

  async function handleInviteMember() {
    const token = getAccessToken();
    if (!token || !inviteEmail.trim()) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await inviteTeamWorkspaceMember(token, {
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
    });
    setSaving(false);
    if (isApiError(res)) {
      setError(apiErrorMessage(res));
      return;
    }
    setContext((prev) =>
      prev
        ? {
            ...prev,
            hasWorkspace: true,
            workspace: res.workspace,
          }
        : {
            canCreateWorkspace: false,
            hasWorkspace: true,
            workspace: res.workspace,
            pendingInvites: [],
          },
    );
    setInviteEmail('');
    setInviteRole('member');
    setMessage('邀请已发送。对方登录同邮箱账户后即可接受。');
    notifyTeamWorkspaceUpdated();
  }

  async function handleAcceptInvite(inviteId: string) {
    const token = getAccessToken();
    if (!token) return;
    setAcceptingInviteId(inviteId);
    setError(null);
    setMessage(null);
    const res = await acceptTeamWorkspaceInvite(token, inviteId);
    setAcceptingInviteId(null);
    if (isApiError(res)) {
      setError(apiErrorMessage(res));
      return;
    }
    setContext({
      canCreateWorkspace: false,
      hasWorkspace: true,
      workspace: res.workspace,
      pendingInvites: [],
    });
    setMessage('你已经加入团队工作区。');
    notifyTeamWorkspaceUpdated();
  }

  const workspace = context?.workspace ?? null;

  return (
    <section
      style={{
        background: '#10172b',
        border: '1px solid #1d2746',
        borderRadius: 18,
        padding: '22px 24px',
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div>
          <p style={{ margin: '0 0 6px', color: '#9fb3ff', fontSize: 12, letterSpacing: 1.2 }}>
            TEAM WORKSPACE
          </p>
          <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>团队研究协作层</h2>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7 }}>
            把个人研究资产升级成团队共享资产。先打通“成员、邀请、共享案例、共享 Saved
            Views”四条主链。
          </p>
        </div>
        {workspace ? (
          <div style={{ color: '#9fb3ff', fontSize: 13, lineHeight: 1.7 }}>
            <div>{workspace.name}</div>
            <div>
              {workspace.billing.seatsUsed}/{workspace.billing.seatLimit} 席位已使用 ·{' '}
              {workspace.sharedSavedViewCount} 个共享视图 · {workspace.sharedCaseCount} 个共享案例
            </div>
          </div>
        ) : null}
      </div>

      {fetching ? <p style={{ color: '#8a96b0' }}>正在同步团队工作区…</p> : null}
      {message ? <p style={{ color: '#7dffb3' }}>{message}</p> : null}
      {error ? <p style={{ color: '#fda4af' }}>{error}</p> : null}

      {!workspace && (context?.pendingInvites.length ?? 0) > 0 ? (
        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          {context!.pendingInvites.map((invite) => (
            <div key={invite.id} style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'start',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{invite.workspaceName}</div>
                  <div style={{ color: '#9fb3ff', fontSize: 13, marginTop: 6 }}>
                    角色：{invite.role} · 邀请于{' '}
                    {new Date(invite.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                <button
                  onClick={() => void handleAcceptInvite(invite.id)}
                  disabled={acceptingInviteId === invite.id}
                  style={primaryButton(acceptingInviteId === invite.id)}
                >
                  {acceptingInviteId === invite.id ? '接受中…' : '接受邀请'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!workspace && context?.canCreateWorkspace ? (
        <div style={{ ...cardStyle, display: 'grid', gap: 12, marginBottom: 16 }}>
          <label style={{ display: 'grid', gap: 6, color: '#9fb3ff', fontSize: 13 }}>
            工作区名称
            <input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              style={inputStyle}
              placeholder={defaultWorkspaceName}
            />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => void handleCreateWorkspace()}
              disabled={saving}
              style={primaryButton(saving)}
            >
              {saving ? '创建中…' : '创建 Team Workspace'}
            </button>
            <span style={{ color: '#6b7fa8', fontSize: 12 }}>
              Team 套餐用户每个账号当前先支持一个工作区。
            </span>
          </div>
        </div>
      ) : null}

      {!workspace && !(context?.pendingInvites.length ?? 0) && !context?.canCreateWorkspace ? (
        <div
          style={{
            borderRadius: 14,
            border: '1px dashed #2a3658',
            background: '#0d1428',
            padding: '18px 18px',
            color: '#9fb3ff',
          }}
        >
          当前账户还没有团队工作区权限，也没有待接受邀请。升级到 Team
          后可创建工作区；被邀请成员也可以直接在这里接受邀请。
        </div>
      ) : null}

      {workspace ? (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ ...cardStyle, display: 'grid', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'start',
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>团队账单与席位</div>
                <div style={{ color: '#9fb3ff', fontSize: 13, lineHeight: 1.7 }}>
                  账单所有者：{workspace.billing.ownerDisplayName ?? workspace.billing.ownerEmail}
                  <br />
                  套餐：{PLAN_LABELS[workspace.billing.subscription]} · 状态：
                  {billingStatusLabel(workspace.billing.billingStatus)}
                  <br />
                  席位占用：{workspace.billing.seatsUsed}/{workspace.billing.seatLimit} 已使用，
                  {workspace.billing.reservedSeats} 已保留
                  <br />
                  剩余可邀请：{workspace.billing.seatsRemaining}
                  {workspace.billing.currentPeriodEnd
                    ? ` · 周期结束 ${new Date(
                        workspace.billing.currentPeriodEnd,
                      ).toLocaleDateString('zh-CN')}`
                    : ''}
                </div>
              </div>
              <div style={{ color: '#9fb3ff', fontSize: 12, textAlign: 'right', lineHeight: 1.7 }}>
                <div>{workspace.billing.canInviteMore ? '可继续邀请' : '邀请已暂停'}</div>
                <div>
                  {workspace.billing.cancelAtPeriodEnd ? '到期后取消已开启' : '续费状态正常'}
                </div>
              </div>
            </div>
            {workspace.billing.warningCodes.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {workspace.billing.warningCodes.map((code) => (
                  <div
                    key={code}
                    style={{
                      borderRadius: 12,
                      border: '1px solid #4b2430',
                      background: '#23131a',
                      color: '#fbc5cf',
                      padding: '10px 12px',
                      fontSize: 13,
                      lineHeight: 1.7,
                    }}
                  >
                    {warningMessage(code)}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#8a96b0', fontSize: 13 }}>
                当前团队工作区账单和席位状态健康，没有待处理的运营告警。
              </div>
            )}
          </div>

          {workspace.canManageMembers ? (
            <div style={{ ...cardStyle, display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>邀请成员</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="teammate@example.com"
                  style={{ ...inputStyle, minWidth: 260, flex: 1 }}
                />
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as 'admin' | 'member')}
                  style={{ ...inputStyle, minWidth: 120 }}
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
                <button
                  onClick={() => void handleInviteMember()}
                  disabled={saving || !inviteEmail.trim() || !workspace.billing.canInviteMore}
                  style={primaryButton(
                    saving || !inviteEmail.trim() || !workspace.billing.canInviteMore,
                  )}
                >
                  {saving ? '发送中…' : '发送邀请'}
                </button>
              </div>
              <div style={{ color: '#8a96b0', fontSize: 12, lineHeight: 1.7 }}>
                {workspace.billing.canInviteMore
                  ? `当前还可保留 ${workspace.billing.seatsRemaining} 个席位（已包含待接受邀请）。`
                  : '当前无法继续邀请，请先释放席位或处理账单状态。'}
              </div>
            </div>
          ) : null}

          <WorkspaceSection title="成员" emptyText="还没有成员。">
            {workspace.members.map((member) => (
              <div key={member.userId} style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 700 }}>{member.displayName ?? member.email}</div>
                  <div style={{ color: '#8a96b0', fontSize: 13 }}>{member.email}</div>
                </div>
                <div style={{ color: '#9fb3ff', fontSize: 12 }}>
                  {member.role} · {new Date(member.joinedAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
            ))}
          </WorkspaceSection>

          <WorkspaceSection title="待接受邀请" emptyText="没有待处理邀请。">
            {workspace.invites.map((invite) => (
              <div key={invite.id} style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 700 }}>{invite.email}</div>
                  <div style={{ color: '#8a96b0', fontSize: 13 }}>
                    {invite.role} · {new Date(invite.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                <div style={{ color: '#9fb3ff', fontSize: 12 }}>pending</div>
              </div>
            ))}
          </WorkspaceSection>

          <WorkspaceSection title="共享 Saved Views" emptyText="还没有共享视图。">
            {workspace.sharedSavedViews.map((item) => (
              <div key={item.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <Link href={casesListPath(item.filters as CasesSearchParams)} style={linkStyle}>
                    {item.name}
                  </Link>
                  <div style={{ color: '#8a96b0', fontSize: 13, marginTop: 6 }}>
                    {item.caseCount} 个案例 · {item.sharedByName ?? item.sharedByUserId} 共享于{' '}
                    {new Date(item.sharedAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
              </div>
            ))}
          </WorkspaceSection>

          <WorkspaceSection title="共享案例" emptyText="还没有共享案例。">
            {workspace.sharedCases.map((item) => (
              <div key={item.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <Link href={caseListHref(item)} style={linkStyle}>
                    {item.companyName}
                  </Link>
                  <div style={{ color: '#8a96b0', fontSize: 13, marginTop: 6 }}>
                    {industryLabel(item.industry)}
                    {item.closedYear ? ` · ${item.closedYear}` : ''}
                    {item.primaryFailureReasonKey
                      ? ` · ${primaryFailureReasonLabel(item.primaryFailureReasonKey)}`
                      : ''}
                  </div>
                </div>
                <div style={{ color: '#9fb3ff', fontSize: 12 }}>
                  {item.sharedByName ?? item.sharedByUserId}
                </div>
              </div>
            ))}
          </WorkspaceSection>
        </div>
      ) : null}
    </section>
  );
}

function WorkspaceSection({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: ReactNode;
}) {
  const content = Array.isArray(children) ? children.filter(Boolean) : children;
  return (
    <div style={{ ...cardStyle, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      {content && (!Array.isArray(content) || content.length > 0) ? (
        content
      ) : (
        <div style={{ color: '#8a96b0' }}>{emptyText}</div>
      )}
    </div>
  );
}

const inputStyle = {
  borderRadius: 10,
  border: '1px solid #243255',
  background: '#0b1020',
  color: '#f5f7fb',
  padding: '10px 12px',
  fontSize: 14,
} as const;

function primaryButton(disabled = false) {
  return {
    border: 0,
    borderRadius: 10,
    background: disabled ? '#243255' : '#5b7cff',
    color: '#fff',
    padding: '10px 14px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  } as const;
}

const cardStyle = {
  border: '1px solid #273655',
  borderRadius: 14,
  padding: '16px 16px',
  background: '#0d1428',
} as const;

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'start',
  flexWrap: 'wrap',
  border: '1px solid #1d2746',
  borderRadius: 12,
  background: '#10172b',
  padding: '14px 14px',
} as const;

const linkStyle = {
  color: '#9fb3ff',
  fontSize: 16,
  fontWeight: 700,
  textDecoration: 'none',
} as const;
