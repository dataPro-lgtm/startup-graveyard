import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PLAN_LABELS,
  PLAN_SUMMARIES,
  TEAM_PLAN_SEAT_LIMIT,
  resolveEntitlements,
  type SubscriptionTier,
} from '@sg/shared/billing';

export const metadata: Metadata = {
  title: '定价',
  description:
    'Startup Graveyard 定价：免费探索失败案例库，Pro 解锁完整个人研究工作流，Team 支持团队协作研究。',
  alternates: { canonical: '/pricing' },
};

const PRICE_LABELS: Record<SubscriptionTier, string> = {
  free: 'US$0',
  pro: process.env.NEXT_PUBLIC_PRO_PRICE_LABEL ?? 'US$19',
  team: process.env.NEXT_PUBLIC_TEAM_PRICE_LABEL ?? 'US$99',
};

type PlanCard = {
  tier: SubscriptionTier;
  highlight: boolean;
  cta: { label: string; href: string };
  features: string[];
};

function planFeatures(tier: SubscriptionTier): string[] {
  const entitlements = resolveEntitlements({ subscription: tier, billingStatus: 'active' });
  const features: string[] = [];

  features.push('公开案例库检索与案例详情');
  features.push(
    entitlements.monthlyCopilotQuestions == null
      ? 'Failure Copilot 不限次提问'
      : `Failure Copilot 每月 ${entitlements.monthlyCopilotQuestions} 次提问`,
  );
  if (entitlements.canUseWatchlist) {
    features.push(`Watchlist 关注 ${entitlements.watchlistLimit} 个案例`);
  }
  if (entitlements.canUseSavedSearches) {
    features.push(`保存 ${entitlements.savedSearchLimit} 个研究视图`);
  }
  if (entitlements.canExportReports) {
    features.push('导出 Markdown / PDF 研究简报与公开分享链接');
  }
  if (entitlements.canUseApiAccess) {
    features.push('API 访问权限');
  }
  if (entitlements.canUseTeamWorkspace) {
    features.push(`Team Workspace：最多 ${TEAM_PLAN_SEAT_LIMIT} 个席位共享研究资产`);
  }
  return features;
}

const PLANS: PlanCard[] = [
  {
    tier: 'free',
    highlight: false,
    cta: { label: '免费开始', href: '/auth/register' },
    features: planFeatures('free'),
  },
  {
    tier: 'pro',
    highlight: true,
    cta: { label: '升级 Pro', href: '/auth/account' },
    features: planFeatures('pro'),
  },
  {
    tier: 'team',
    highlight: false,
    cta: { label: '组建团队', href: '/auth/account' },
    features: planFeatures('team'),
  },
];

export default function PricingPage() {
  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px 72px' }}>
      <header style={{ textAlign: 'center', marginBottom: 44 }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
          为每一次严肃的失败研究定价
        </h1>
        <p style={{ color: '#9fb3ff', fontSize: 16, margin: 0, lineHeight: 1.7 }}>
          免费探索案例库，付费解锁完整研究工作流与团队协作。
          <br />
          订阅通过 Stripe 安全结算，可随时在账户页取消。
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          alignItems: 'stretch',
        }}
      >
        {PLANS.map((plan) => (
          <section
            key={plan.tier}
            aria-label={`${PLAN_LABELS[plan.tier]} 套餐`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: plan.highlight ? '#131d3d' : '#10172b',
              border: plan.highlight ? '1px solid #3c5fc9' : '1px solid #1d2746',
              borderRadius: 20,
              padding: '30px 28px',
              position: 'relative',
            }}
          >
            {plan.highlight && (
              <span
                style={{
                  position: 'absolute',
                  top: -12,
                  right: 24,
                  background: '#5b7cff',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '4px 12px',
                  borderRadius: 999,
                }}
              >
                最受欢迎
              </span>
            )}
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
              {PLAN_LABELS[plan.tier]}
            </h2>
            <p style={{ color: '#9fb3ff', fontSize: 13, margin: '0 0 18px', lineHeight: 1.6 }}>
              {PLAN_SUMMARIES[plan.tier]}
            </p>
            <p style={{ margin: '0 0 20px' }}>
              <span style={{ fontSize: 32, fontWeight: 800 }}>{PRICE_LABELS[plan.tier]}</span>
              {plan.tier !== 'free' && (
                <span style={{ color: '#6b7ca8', fontSize: 14 }}> / 月</span>
              )}
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 26px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                flexGrow: 1,
              }}
            >
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  style={{ display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.5 }}
                >
                  <span aria-hidden style={{ color: '#5b7cff', fontWeight: 700 }}>
                    ✓
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              href={plan.cta.href}
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '12px 16px',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 15,
                textDecoration: 'none',
                background: plan.highlight ? '#5b7cff' : 'transparent',
                color: plan.highlight ? '#fff' : '#9fb3ff',
                border: plan.highlight ? 'none' : '1px solid #2a3658',
              }}
            >
              {plan.cta.label}
            </Link>
          </section>
        ))}
      </div>

      <section
        style={{
          marginTop: 44,
          background: '#10172b',
          border: '1px solid #1d2746',
          borderRadius: 16,
          padding: '24px 26px',
          fontSize: 14,
          lineHeight: 1.8,
          color: '#c7d3f5',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px', color: '#f5f7fb' }}>
          常见问题
        </h2>
        <p style={{ margin: '0 0 10px' }}>
          <strong>如何升级或取消？</strong> 注册后在账户页发起升级，结账与账单管理均通过 Stripe
          完成；取消后权益保留到当前计费周期结束。
        </p>
        <p style={{ margin: '0 0 10px' }}>
          <strong>实际扣款金额以哪里为准？</strong> 以 Stripe
          结账页展示的价格与币种为准，页面价格仅供参考。
        </p>
        <p style={{ margin: 0 }}>
          <strong>Team 席位如何计算？</strong> Team 订阅包含 {TEAM_PLAN_SEAT_LIMIT}{' '}
          个席位，成员通过邀请加入并自动继承工作区权益；席位与账单状态变化会实时同步到成员权限。
        </p>
      </section>
    </main>
  );
}
