import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { fetchCaseBySlug } from '@/lib/casesApi';

export const runtime = 'edge';

const INDUSTRY_EMOJI: Record<string, string> = {
  fintech: '💳',
  healthtech: '🏥',
  edtech: '📚',
  ecommerce: '🛒',
  saas: '☁️',
  social: '💬',
  mobility: '🚗',
  real_estate: '🏠',
  media: '📺',
  gaming: '🎮',
  logistics: '📦',
  foodtech: '🍔',
  cleantech: '🌱',
  crypto: '₿',
  ai: '🤖',
};

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');

  let companyName = 'Unknown';
  let summary = '失败案例分析';
  let industry = '';
  let totalFunding: number | null = null;

  if (slug) {
    const item = await fetchCaseBySlug(slug).catch(() => null);
    if (item) {
      companyName = item.companyName;
      summary = item.summary.length > 120 ? item.summary.slice(0, 117) + '…' : item.summary;
      industry = item.industry ?? '';
      totalFunding = item.totalFundingUsd ?? null;
    }
  }

  const emoji = INDUSTRY_EMOJI[industry] ?? '⚰️';
  const fundingLabel = totalFunding
    ? `融资蒸发 $${(totalFunding / 1_000_000).toFixed(0)}M`
    : '失败复盘';

  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: 'linear-gradient(135deg, #0b1020 0%, #111827 60%, #1a0a2e 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '60px 72px',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#f5f7fb',
      }}
    >
      {/* Top: site name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28, color: '#9fb3ff' }}>⚰️ 创业坟场</span>
        <span
          style={{
            fontSize: 14,
            color: '#4a5568',
            background: '#1d2746',
            padding: '4px 12px',
            borderRadius: 20,
          }}
        >
          Startup Graveyard
        </span>
      </div>

      {/* Middle: company + summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 56 }}>{emoji}</span>
          <span
            style={{
              fontSize: 62,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: '#ffffff',
            }}
          >
            {companyName}
          </span>
        </div>
        <p
          style={{
            fontSize: 24,
            color: '#9fb3ff',
            lineHeight: 1.5,
            margin: 0,
            maxWidth: 900,
          }}
        >
          {summary}
        </p>
      </div>

      {/* Bottom: tags */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span
          style={{
            fontSize: 18,
            color: '#ff6b6b',
            background: 'rgba(255,107,107,0.15)',
            padding: '6px 16px',
            borderRadius: 8,
            border: '1px solid rgba(255,107,107,0.3)',
          }}
        >
          {fundingLabel}
        </span>
        {industry && (
          <span
            style={{
              fontSize: 18,
              color: '#7ed321',
              background: 'rgba(126,211,33,0.1)',
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px solid rgba(126,211,33,0.3)',
            }}
          >
            {industry}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 16, color: '#4a5568' }}>
          startup-graveyard.io
        </span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
