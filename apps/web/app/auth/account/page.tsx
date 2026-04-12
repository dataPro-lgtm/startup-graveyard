'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PLAN_LABELS, PLAN_SUMMARIES } from '@sg/shared/billing';
import { industryLabel, primaryFailureReasonLabel } from '@sg/shared/taxonomy';
import { useAuth } from '@/app/components/AuthProvider';
import { SavedViewsManager } from '@/app/components/SavedViewsManager';
import { TeamWorkspacePanel } from '@/app/components/TeamWorkspacePanel';
import { API_BASE_URL } from '@/lib/api';
import { getAccessToken, isApiError } from '@/lib/authApi';
import { caseListHref } from '@/lib/casesApi';
import { fetchMyWatchlist, isApiError as isWatchlistApiError } from '@/lib/watchlistApi';
import type { WatchlistItem, WatchlistSummary } from '@sg/shared/schemas/watchlist';

type PaymentLinkResponse = { url?: string } | { error: string };

function billingStatusLabel(value: string) {
  if (value === 'active') return '正常订阅';
  if (value === 'trialing') return '试用中';
  if (value === 'past_due') return '付款待处理';
  if (value === 'canceled') return '已取消';
  return '未激活';
}

function billingStatusColor(value: string) {
  if (value === 'active' || value === 'trialing') return '#7dffb3';
  if (value === 'past_due') return '#fbbf24';
  if (value === 'canceled') return '#fda4af';
  return '#7e8fb3';
}

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [stripeUnavailable, setStripeUnavailable] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchlistSummary, setWatchlistSummary] = useState<WatchlistSummary | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadWatchlist() {
      if (!user) return;
      const token = getAccessToken();
      if (!token) return;
      setWatchlistLoading(true);
      const res = await fetchMyWatchlist(token);
      if (cancelled) return;
      if (isWatchlistApiError(res)) {
        setWatchlistError(`加载 Watchlist 失败：${res.error}`);
      } else {
        setWatchlistItems(res.items);
        setWatchlistSummary(res.summary);
        setWatchlistError(null);
      }
      setWatchlistLoading(false);
    }

    void loadWatchlist();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const currentPlan = useMemo(() => {
    if (!user) return null;
    return {
      label: PLAN_LABELS[user.effectiveSubscription],
      summary: PLAN_SUMMARIES[user.effectiveSubscription],
    };
  }, [user]);

  const personalPlan = useMemo(() => {
    if (!user) return null;
    return {
      label: PLAN_LABELS[user.subscription],
      summary: PLAN_SUMMARIES[user.subscription],
    };
  }, [user]);

  if (loading || !user || !currentPlan || !personalPlan) {
    return (
      <main style={{ maxWidth: 980, margin: '80px auto', padding: '0 24px' }}>
        <div style={{ height: 40, background: '#1d2746', borderRadius: 8 }} />
      </main>
    );
  }

  async function handleLogout() {
    await logout();
    router.push('/');
  }

  async function handleUpgrade() {
    if (!user) return;
    const token = getAccessToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/payments/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.status === 503) {
        setStripeUnavailable(true);
        return;
      }
      const data = (await res.json()) as PaymentLinkResponse;
      if (isApiError(data) || !('url' in data) || !data.url) {
        return;
      }
      window.location.href = data.url;
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleManageBilling() {
    if (!user) return;
    const token = getAccessToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }
    setPortalLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/payments/portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (res.status === 503) {
        setStripeUnavailable(true);
        return;
      }
      const data = (await res.json()) as PaymentLinkResponse;
      if (isApiError(data) || !('url' in data) || !data.url) return;
      window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  }

  const watchlistState = watchlistSummary ?? {
    watchlistCount: user.entitlements.canUseWatchlist ? watchlistItems.length : 0,
    watchlistLimit: user.entitlements.watchlistLimit,
    remainingSlots: Math.max(0, user.entitlements.watchlistLimit - watchlistItems.length),
    canUseWatchlist: user.entitlements.canUseWatchlist,
  };

  return (
    <main style={{ maxWidth: 1080, margin: '56px auto', padding: '0 24px 96px' }}>
      <Link href="/" style={{ color: '#9fb3ff', fontSize: 13, textDecoration: 'none' }}>
        ← 返回首页
      </Link>

      <section
        style={{
          marginTop: 24,
          marginBottom: 24,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.95fr)',
          gap: 18,
        }}
      >
        <div
          style={{
            background:
              'linear-gradient(135deg, rgba(18,30,56,0.98), rgba(16,23,43,0.98) 58%, rgba(30,18,56,0.96))',
            border: '1px solid #243255',
            borderRadius: 18,
            padding: '26px 28px',
          }}
        >
          <p style={{ margin: '0 0 8px', color: '#9fb3ff', fontSize: 12, letterSpacing: 1.3 }}>
            COMMERCIAL ACCOUNT
          </p>
          <h1 style={{ margin: '0 0 10px', fontSize: 30 }}>我的研究工作台</h1>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.75 }}>
            当前套餐：{currentPlan.label}。{currentPlan.summary}
          </p>
          {user.workspaceAccess.workspaceId ? (
            <p style={{ margin: '10px 0 0', color: '#9fb3ff', lineHeight: 1.75, fontSize: 14 }}>
              {user.workspaceAccess.source === 'team_workspace'
                ? `当前有效权限来自团队工作区 ${user.workspaceAccess.workspaceName}，你的角色是 ${user.workspaceAccess.workspaceRole}。`
                : `你已加入团队工作区 ${user.workspaceAccess.workspaceName}，但当前仍按个人套餐生效。`}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            <Chip
              label={`${currentPlan.label} Plan`}
              color={
                user.effectiveSubscription === 'free'
                  ? '#7e8fb3'
                  : user.effectiveSubscription === 'team'
                    ? '#7dd3fc'
                    : '#fbbf24'
              }
            />
            <Chip
              label={billingStatusLabel(user.effectiveBillingStatus)}
              color={billingStatusColor(user.effectiveBillingStatus)}
            />
            {user.effectiveSubscription !== user.subscription ? (
              <Chip label={`个人账单 ${personalPlan.label}`} color="#6b7ca8" />
            ) : null}
            <Chip label={user.role === 'admin' ? '管理员' : '普通用户'} color="#5b7cff" />
          </div>
        </div>

        <div
          style={{
            background: '#10172b',
            border: '1px solid #1d2746',
            borderRadius: 18,
            padding: '24px 24px 20px',
          }}
        >
          <div style={{ fontSize: 12, color: '#9fb3ff', letterSpacing: 1.2, marginBottom: 8 }}>
            PERSONAL BILLING
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            {user.displayName ?? user.email}
          </div>
          <div style={{ color: '#9fb3ff', fontSize: 14, marginBottom: 14 }}>{user.email}</div>
          <div style={{ color: '#c8d0e5', fontSize: 14, lineHeight: 1.7 }}>
            <div>套餐状态：{billingStatusLabel(user.billingStatus)}</div>
            <div>
              计费周期：
              {user.billingInterval === 'year'
                ? '年付'
                : user.billingInterval === 'month'
                  ? '月付'
                  : '未激活'}
            </div>
            <div>
              当前周期结束：
              {user.currentPeriodEnd
                ? new Date(user.currentPeriodEnd).toLocaleDateString('zh-CN')
                : '—'}
            </div>
            <div>到期后取消：{user.cancelAtPeriodEnd ? '是' : '否'}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            {user.subscription === 'free' ? (
              <button
                onClick={handleUpgrade}
                disabled={checkoutLoading || stripeUnavailable}
                style={primaryButton(checkoutLoading || stripeUnavailable)}
              >
                {stripeUnavailable ? 'Stripe 暂未配置' : checkoutLoading ? '跳转中…' : '升级到 Pro'}
              </button>
            ) : (
              <button
                onClick={handleManageBilling}
                disabled={portalLoading || stripeUnavailable}
                style={primaryButton(portalLoading || stripeUnavailable)}
              >
                {stripeUnavailable ? '账单入口暂不可用' : portalLoading ? '跳转中…' : '管理账单'}
              </button>
            )}
            <button onClick={handleLogout} style={ghostButton}>
              退出登录
            </button>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 14,
          }}
        >
          <MetricCard
            label="Watchlist"
            value={
              user.entitlements.canUseWatchlist
                ? `${watchlistState.watchlistCount}/${watchlistState.watchlistLimit}`
                : 'Pro'
            }
            sub={
              user.entitlements.canUseWatchlist
                ? `剩余 ${watchlistState.remainingSlots}`
                : '升级后解锁'
            }
          />
          <MetricCard
            label="保存视图"
            value={
              user.entitlements.canUseSavedSearches
                ? `${user.entitlements.savedSearchLimit}`
                : 'Pro'
            }
            sub={user.entitlements.canUseSavedSearches ? '研究专题 / saved filters' : '升级后解锁'}
          />
          <MetricCard
            label="导出报告"
            value={user.entitlements.canExportReports ? '已解锁' : '未解锁'}
            sub="PDF / 分享材料 / 客户交付"
          />
          <MetricCard
            label="团队工作区"
            value={
              user.workspaceAccess.workspaceId
                ? user.workspaceAccess.workspaceRole === 'owner'
                  ? 'Owner'
                  : user.workspaceAccess.workspaceRole === 'admin'
                    ? 'Admin'
                    : 'Member'
                : user.entitlements.canUseTeamWorkspace
                  ? '可创建'
                  : '邀请加入'
            }
            sub={
              user.workspaceAccess.workspaceId
                ? (user.workspaceAccess.workspaceName ?? '团队协作中')
                : '成员 / 共享视图 / 共享案例'
            }
          />
        </div>
      </section>

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
          style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
        >
          <div>
            <p style={{ margin: '0 0 6px', color: '#9fb3ff', fontSize: 12, letterSpacing: 1.2 }}>
              ENTITLEMENTS
            </p>
            <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>你的可用商业化能力</h2>
            <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7 }}>
              商业化不是“加一个支付按钮”，而是让研究资产、导出交付和持续追踪真正沉淀到账号里。
            </p>
          </div>
          {user.effectiveSubscription === 'free' ? (
            <button
              onClick={handleUpgrade}
              disabled={checkoutLoading || stripeUnavailable}
              style={primaryButton(checkoutLoading || stripeUnavailable)}
            >
              {checkoutLoading ? '跳转中…' : '解锁 Pro 研究流'}
            </button>
          ) : null}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginTop: 18,
          }}
        >
          <EntitlementCard
            title="个人 Watchlist"
            body="把高价值失败案例沉淀成自己的长期观察清单。"
            status={
              user.entitlements.canUseWatchlist
                ? `${user.entitlements.watchlistLimit} 条额度`
                : 'Pro / Team'
            }
            active={user.entitlements.canUseWatchlist}
          />
          <EntitlementCard
            title="Saved Research Views"
            body="保存筛选条件和研究角度，形成复用分析入口。"
            status={
              user.entitlements.canUseSavedSearches
                ? `${user.entitlements.savedSearchLimit} 个保存位`
                : 'Pro / Team'
            }
            active={user.entitlements.canUseSavedSearches}
          />
          <EntitlementCard
            title="导出与交付"
            body="面向投委会、founder update 和内部复盘的可交付材料。"
            status={user.entitlements.canExportReports ? '已启用' : 'Pro / Team'}
            active={user.entitlements.canExportReports}
          />
          <EntitlementCard
            title="团队工作区"
            body="共享 watchlist、协作研究和更高的 Copilot/导出配额。"
            status={user.entitlements.canUseTeamWorkspace ? 'Team' : '未启用'}
            active={user.entitlements.canUseTeamWorkspace}
          />
        </div>
      </section>

      <TeamWorkspacePanel />

      <section
        style={{
          background: '#10172b',
          border: '1px solid #1d2746',
          borderRadius: 18,
          padding: '22px 24px',
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 6px', color: '#9fb3ff', fontSize: 12, letterSpacing: 1.2 }}>
            WATCHLIST
          </p>
          <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>已保存案例</h2>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7 }}>
            这里会沉淀你长期跟踪的失败模式样本，和下方的 Saved Views 一起构成个人研究资产层。
          </p>
        </div>

        {watchlistLoading ? <p style={{ color: '#8a96b0' }}>正在同步 watchlist…</p> : null}
        {watchlistError ? <p style={{ color: '#fda4af' }}>{watchlistError}</p> : null}
        {!watchlistLoading && !watchlistError && !user.entitlements.canUseWatchlist ? (
          <div
            style={{
              borderRadius: 14,
              border: '1px dashed #2a3658',
              background: '#0d1428',
              padding: '18px 18px',
              color: '#9fb3ff',
            }}
          >
            Free 版不保存个人 watchlist。升级后可把关键案例沉淀成自己的长期研究清单。
          </div>
        ) : null}
        {!watchlistLoading &&
        !watchlistError &&
        user.entitlements.canUseWatchlist &&
        watchlistItems.length === 0 ? (
          <div
            style={{
              borderRadius: 14,
              border: '1px dashed #2a3658',
              background: '#0d1428',
              padding: '18px 18px',
              color: '#9fb3ff',
            }}
          >
            你的 watchlist 还是空的。去任意案例详情页点击“加入 Watchlist”，开始沉淀长期观察样本。
          </div>
        ) : null}

        {watchlistItems.length > 0 ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {watchlistItems.map((item) => (
              <div
                key={item.id}
                style={{
                  border: '1px solid #1d2746',
                  borderRadius: 14,
                  padding: '16px 18px',
                  background: '#0d1428',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={caseListHref(item)}
                      style={{
                        color: '#9fb3ff',
                        fontSize: 18,
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
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
                  <div style={{ color: '#6b7ca8', fontSize: 12 }}>
                    保存于 {new Date(item.addedAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                <p style={{ margin: '10px 0 0', color: '#c8d0e5', lineHeight: 1.7 }}>
                  {item.summary}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: 24 }}>
        <SavedViewsManager mode="full" />
      </section>
    </main>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        padding: '4px 12px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {label}
    </span>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        border: '1px solid #1d2746',
        borderRadius: 16,
        padding: '18px 18px',
        background: '#10172b',
      }}
    >
      <div style={{ fontSize: 11, color: '#6b7fa8', letterSpacing: 1, marginBottom: 8 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: '#8a96b0' }}>{sub}</div>
    </div>
  );
}

function EntitlementCard({
  title,
  body,
  status,
  active,
}: {
  title: string;
  body: string;
  status: string;
  active: boolean;
}) {
  return (
    <div
      style={{
        border: `1px solid ${active ? '#2b5bd7' : '#25314f'}`,
        borderRadius: 14,
        padding: '16px 16px',
        background: active
          ? 'linear-gradient(180deg, rgba(20,36,72,0.92), rgba(15,22,42,0.96))'
          : '#0d1428',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <span style={{ color: active ? '#7dffb3' : '#7e8fb3', fontSize: 12, fontWeight: 700 }}>
          {status}
        </span>
      </div>
      <div style={{ color: '#c8d0e5', lineHeight: 1.65, fontSize: 14 }}>{body}</div>
    </div>
  );
}

function primaryButton(disabled: boolean) {
  return {
    padding: '10px 18px',
    borderRadius: 10,
    border: 'none',
    background: disabled ? '#35446b' : '#5b7cff',
    color: '#fff',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14,
  } as const;
}

const ghostButton = {
  padding: '10px 18px',
  borderRadius: 10,
  border: '1px solid #2a3658',
  background: 'transparent',
  color: '#f5f7fb',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
} as const;
