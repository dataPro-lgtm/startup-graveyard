import Link from 'next/link';
import { type CSSProperties } from 'react';
import { fetchCasesList, caseListHref, casesListPath } from '@/lib/casesApi';
import { formatUsd } from '@/lib/formatUsd';
import { fetchResearchOverview } from '@/lib/metaApi';
import { RESEARCH_PRESETS } from '@/lib/researchPresets';
import type { ResearchBucket, ResearchTimelinePoint } from '@sg/shared/schemas/meta';
import {
  businessModelLabel,
  countryLabel,
  industryLabel,
  primaryFailureReasonLabel,
} from '@sg/shared/taxonomy';

const cardStyle: CSSProperties = {
  borderRadius: 18,
  border: '1px solid #1d2746',
  background: '#10172b',
};

function presetFilterBadges(filters: {
  industry?: string;
  country?: string;
  businessModelKey?: string;
  primaryFailureReasonKey?: string;
}): string[] {
  const badges: string[] = [];
  if (filters.industry) badges.push(industryLabel(filters.industry));
  if (filters.country) badges.push(countryLabel(filters.country));
  if (filters.businessModelKey) badges.push(businessModelLabel(filters.businessModelKey));
  if (filters.primaryFailureReasonKey) {
    badges.push(primaryFailureReasonLabel(filters.primaryFailureReasonKey));
  }
  return badges;
}

export default async function ResearchPage() {
  const [overview, latestCases] = await Promise.all([
    fetchResearchOverview(),
    fetchCasesList({ sort: 'updated_at', limit: '6', page: '1' }),
  ]);

  const latest = latestCases?.items ?? [];
  const topIndustries: ResearchBucket[] = overview?.topIndustries ?? [];
  const topFailureReasons: ResearchBucket[] = overview?.topFailureReasons ?? [];
  const topCountries: ResearchBucket[] = overview?.topCountries ?? [];
  const closureTimeline: ResearchTimelinePoint[] = overview?.closureTimeline ?? [];
  const topIndustryMax = Math.max(...topIndustries.map((item) => item.caseCount), 1);
  const topReasonMax = Math.max(...topFailureReasons.map((item) => item.caseCount), 1);
  const topCountryMax = Math.max(...topCountries.map((item) => item.caseCount), 1);
  const timelineMax = Math.max(...closureTimeline.map((item) => item.caseCount), 1);

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 24px 88px' }}>
      <section
        style={{
          ...cardStyle,
          padding: '32px clamp(22px, 5vw, 36px)',
          marginBottom: 28,
          background:
            'radial-gradient(circle at top left, rgba(91,124,255,0.22), transparent 34%), #10172b',
        }}
      >
        <p
          style={{
            margin: '0 0 10px',
            color: '#9fb3ff',
            fontSize: 12,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          Research Hub
        </p>
        <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(30px, 5vw, 46px)', lineHeight: 1.08 }}>
          用专题和趋势，而不是孤立案例，去研究失败。
        </h1>
        <p style={{ margin: 0, maxWidth: 760, color: '#c8d0e5', lineHeight: 1.8, fontSize: 16 }}>
          这个页面把案例库里的样本压缩成更适合研究的入口：预设专题、核心聚合、年度波段和
          Copilot 问题模板。目标不是“看更多案例”，而是更快找到可以比较、可以复盘、可以提问的研究切口。
        </p>
        {overview ? (
          <div
            style={{
              marginTop: 22,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            {[
              { label: '已发布案例', value: `${overview.summary.totalCases}` },
              { label: '蒸发融资', value: formatUsd(overview.summary.totalFundingUsd) },
              { label: '失败主因', value: `${overview.summary.failurePatterns} 种` },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 14,
                  border: '1px solid #233255',
                  background: 'rgba(12,18,33,0.72)',
                  padding: '16px 18px',
                }}
              >
                <div style={{ color: '#6b7fa8', fontSize: 12, marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{item.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section style={{ marginBottom: 30 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'end',
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p style={{ margin: '0 0 6px', color: '#9fb3ff', fontSize: 12, letterSpacing: 1 }}>
              PRESET TOPICS
            </p>
            <h2 style={{ margin: 0, fontSize: 24 }}>预设研究专题</h2>
          </div>
          <Link href="/" style={{ color: '#9fb3ff', textDecoration: 'none', fontSize: 14 }}>
            返回案例库 →
          </Link>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {RESEARCH_PRESETS.map((preset) => {
            const badges = presetFilterBadges(preset.filters);
            return (
              <article
                key={preset.slug}
                id={preset.slug}
                style={{
                  ...cardStyle,
                  padding: 18,
                  display: 'grid',
                  gap: 14,
                  borderColor: `${preset.accent}44`,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 6,
                    borderRadius: 999,
                    background: preset.accent,
                  }}
                />
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>{preset.title}</h3>
                  <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7 }}>{preset.description}</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {badges.map((badge) => (
                    <span
                      key={`${preset.slug}-${badge}`}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        border: '1px solid #2a3658',
                        color: '#9fb3ff',
                      }}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link
                    href={casesListPath(preset.filters)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: '#152238',
                      color: '#f5f7fb',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    查看案例
                  </Link>
                  <Link
                    href={`/copilot?q=${encodeURIComponent(preset.copilotQuestion)}&run=1`}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid #2a3658',
                      color: '#9fb3ff',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    问 Copilot
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 30,
        }}
      >
        <div style={{ ...cardStyle, padding: 18 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>高频行业</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {topIndustries.map((item) => (
              <div key={item.key}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}
                >
                  <Link
                    href={casesListPath({ industry: item.key })}
                    style={{ color: '#f5f7fb', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {industryLabel(item.key)}
                  </Link>
                  <span style={{ color: '#9fb3ff', fontSize: 13 }}>{item.caseCount} 个案例</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#0b1020', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(12, (item.caseCount / topIndustryMax) * 100)}%`,
                      background: '#5b7cff',
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, color: '#6b7fa8', fontSize: 12 }}>
                  融资规模 {formatUsd(item.totalFundingUsd)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 18 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>高频失败主因</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {topFailureReasons.map((item) => (
              <div key={item.key}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}
                >
                  <Link
                    href={casesListPath({ primaryFailureReasonKey: item.key })}
                    style={{ color: '#f5f7fb', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {primaryFailureReasonLabel(item.key)}
                  </Link>
                  <span style={{ color: '#9fb3ff', fontSize: 13 }}>{item.caseCount} 个案例</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#0b1020', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(12, (item.caseCount / topReasonMax) * 100)}%`,
                      background: '#ff8a65',
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, color: '#6b7fa8', fontSize: 12 }}>
                  对应融资 {formatUsd(item.totalFundingUsd)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 18 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>案例集中地区</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {topCountries.map((item) => (
              <div key={item.key}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}
                >
                  <Link
                    href={casesListPath({ country: item.key })}
                    style={{ color: '#f5f7fb', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {countryLabel(item.key)}
                  </Link>
                  <span style={{ color: '#9fb3ff', fontSize: 13 }}>{item.caseCount} 个案例</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#0b1020', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(12, (item.caseCount / topCountryMax) * 100)}%`,
                      background: '#18b981',
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, color: '#6b7fa8', fontSize: 12 }}>
                  对应融资 {formatUsd(item.totalFundingUsd)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 0.9fr)',
          gap: 16,
        }}
      >
        <div style={{ ...cardStyle, padding: 18 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>关闭年份波段</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {closureTimeline.map((point) => (
              <div key={point.year}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}
                >
                  <span style={{ fontWeight: 600 }}>{point.year}</span>
                  <span style={{ color: '#9fb3ff', fontSize: 13 }}>
                    {point.caseCount} 个案例 · {formatUsd(point.totalFundingUsd)}
                  </span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: '#0b1020', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(10, (point.caseCount / timelineMax) * 100)}%`,
                      background: 'linear-gradient(90deg, #5b7cff, #8aa2ff)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 18 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>最近可研究案例</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {latest.map((item) => (
              <Link
                key={item.id}
                href={caseListHref(item)}
                style={{
                  textDecoration: 'none',
                  color: '#f5f7fb',
                  borderRadius: 14,
                  border: '1px solid #1d2746',
                  background: '#0d1426',
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 700 }}>{item.companyName}</div>
                <div style={{ color: '#9fb3ff', fontSize: 12 }}>
                  {industryLabel(item.industry)} · {countryLabel(item.country)}
                  {item.closedYear ? ` · ${item.closedYear}` : ''}
                </div>
                <div style={{ color: '#c8d0e5', fontSize: 13, lineHeight: 1.6 }}>{item.summary}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
