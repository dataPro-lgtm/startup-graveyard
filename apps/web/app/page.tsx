import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  type CasesSearchParams,
  caseListHref,
  casesListPath,
  fetchCasesList,
} from '@/lib/casesApi';
import { formatUsd } from '@/lib/formatUsd';
import { fetchHomeSummary, fetchTaxonomy } from '@/lib/metaApi';
import { RESEARCH_PRESETS } from '@/lib/researchPresets';
import { countryLabel, industryLabel } from '@sg/shared/taxonomy';
import { pickSearchParam } from '@/lib/searchParams';
import type { SavedViewFilters } from '@sg/shared/schemas/savedViews';
import { SavedViewsManager } from './components/SavedViewsManager';

function buildSuggestedViewName(params: SavedViewFilters): string {
  const parts: string[] = [];
  if (params.q) parts.push(params.q);
  if (params.industry) parts.push(industryLabel(params.industry));
  if (params.country) parts.push(countryLabel(params.country));
  if (params.closedYear) parts.push(`${params.closedYear}`);
  if (params.businessModelKey) parts.push(params.businessModelKey.replaceAll('_', ' '));
  if (params.primaryFailureReasonKey) {
    parts.push(params.primaryFailureReasonKey.replaceAll('_', ' '));
  }
  return parts.length > 0 ? parts.slice(0, 3).join(' · ') : '全部案例';
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params: CasesSearchParams = {
    q: pickSearchParam(raw.q),
    industry: pickSearchParam(raw.industry),
    country: pickSearchParam(raw.country),
    closedYear: pickSearchParam(raw.closedYear),
    businessModelKey: pickSearchParam(raw.businessModelKey),
    primaryFailureReasonKey: pickSearchParam(raw.primaryFailureReasonKey),
    sort: pickSearchParam(raw.sort),
    page: pickSearchParam(raw.page),
    limit: pickSearchParam(raw.limit),
  };

  const sortFormDefault =
    params.sort === 'updated_at'
      ? 'updated_at'
      : params.sort === 'relevance' || params.q
        ? 'relevance'
        : 'updated_at';

  const hasFilters = Boolean(
    params.q ||
    params.industry ||
    params.country ||
    params.closedYear ||
    params.businessModelKey ||
    params.primaryFailureReasonKey,
  );

  const [data, taxonomy, homeSummary] = await Promise.all([
    fetchCasesList(params),
    fetchTaxonomy(),
    hasFilters ? Promise.resolve(null) : fetchHomeSummary(),
  ]);

  const industryEntries = Object.entries(taxonomy.industries).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const countryEntries = Object.entries(taxonomy.countries).sort(([a], [b]) => a.localeCompare(b));
  const industryKeySet = new Set(industryEntries.map(([k]) => k));
  const countryKeySet = new Set(countryEntries.map(([k]) => k));
  const industryOrphan =
    params.industry && !industryKeySet.has(params.industry) ? params.industry : null;
  const countryOrphan =
    params.country && !countryKeySet.has(params.country) ? params.country : null;
  const businessModelEntries = Object.entries(taxonomy.businessModels).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const primaryFrEntries = Object.entries(taxonomy.primaryFailureReasons).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const businessModelKeySet = new Set(businessModelEntries.map(([k]) => k.toLowerCase()));
  const primaryFrKeySet = new Set(primaryFrEntries.map(([k]) => k.toLowerCase()));
  const bmNorm = params.businessModelKey?.toLowerCase();
  const pfrNorm = params.primaryFailureReasonKey?.toLowerCase();
  const businessModelOrphan =
    bmNorm && !businessModelKeySet.has(bmNorm) ? params.businessModelKey : null;
  const primaryFrOrphan =
    pfrNorm && !primaryFrKeySet.has(pfrNorm) ? params.primaryFailureReasonKey : null;
  const loadError = data === null;
  const items = data?.items ?? [];
  const page = data?.page ?? Math.max(1, Number(params.page) || 1);
  const pageSize = data?.pageSize ?? (Number(params.limit) || 20);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const withPage = (nextPage: number): CasesSearchParams => ({
    ...params,
    page: String(nextPage),
  });

  const totalCases = homeSummary?.totalCases ?? data?.total ?? 0;
  const totalFundingUsd =
    homeSummary?.totalFundingUsd ??
    (data?.items ?? []).reduce((sum, it) => sum + (it.totalFundingUsd ?? 0), 0);
  const failurePatterns =
    homeSummary?.failurePatterns ??
    new Set((data?.items ?? []).map((it) => it.primaryFailureReasonKey).filter(Boolean)).size;
  const featuredResearchPresets = RESEARCH_PRESETS.slice(0, 3);
  const savedViewFilters: SavedViewFilters = {
    q: params.q,
    industry: params.industry,
    country: params.country,
    closedYear: params.closedYear,
    businessModelKey: params.businessModelKey,
    primaryFailureReasonKey: params.primaryFailureReasonKey,
    sort: params.sort === 'relevance' || params.sort === 'updated_at' ? params.sort : undefined,
  };
  const suggestedViewName = buildSuggestedViewName(savedViewFilters);

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 80px' }}>
      <section style={{ marginBottom: 36 }}>
        <p
          style={{
            color: '#9fb3ff',
            fontSize: 12,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            margin: '0 0 10px',
          }}
        >
          Failure Intelligence
        </p>
        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 48px)',
            lineHeight: 1.12,
            margin: '0 0 14px',
            fontWeight: 800,
          }}
        >
          Startup Graveyard
        </h1>
        <p style={{ maxWidth: 680, color: '#c8d0e5', lineHeight: 1.75, margin: 0, fontSize: 16 }}>
          结构化的创业失败档案库——每一个案例都是可检索、可对比、可深度问答的决策参考。
          不只看热闹，更看懂规律。
        </p>
      </section>

      {/* 统计横幅 */}
      {!hasFilters && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginBottom: 32,
          }}
        >
          {[
            { label: '收录案例', value: `${totalCases} 个`, sub: '结构化失败档案' },
            {
              label: '总融资蒸发',
              value: formatUsd(totalFundingUsd),
              sub: '现金已烧完',
            },
            {
              label: '失败模式',
              value: `${failurePatterns} 种`,
              sub: '主要归因类别',
            },
            {
              label: 'AI Copilot',
              value: '已上线',
              sub: '跨案例深度问答',
              href: '/copilot',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                border: '1px solid #1d2746',
                borderRadius: 16,
                padding: '20px 24px',
                background: '#10172b',
              }}
            >
              {stat.href ? (
                <Link href={stat.href} style={{ textDecoration: 'none' }}>
                  <div
                    style={{ fontSize: 11, color: '#6b7fa8', letterSpacing: 1, marginBottom: 6 }}
                  >
                    {stat.label.toUpperCase()}
                  </div>
                  <div
                    style={{ fontSize: 28, fontWeight: 700, color: '#5b7cff', lineHeight: 1.15 }}
                  >
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7fa8', marginTop: 4 }}>{stat.sub}</div>
                </Link>
              ) : (
                <>
                  <div
                    style={{ fontSize: 11, color: '#6b7fa8', letterSpacing: 1, marginBottom: 6 }}
                  >
                    {stat.label.toUpperCase()}
                  </div>
                  <div
                    style={{ fontSize: 28, fontWeight: 700, color: '#f5f7fb', lineHeight: 1.15 }}
                  >
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7fa8', marginTop: 4 }}>{stat.sub}</div>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {!hasFilters && (
        <section
          style={{
            marginBottom: 28,
            padding: 22,
            borderRadius: 16,
            border: '1px solid #1d2746',
            background:
              'linear-gradient(135deg, rgba(20,34,56,0.95), rgba(12,18,33,0.98) 58%, rgba(18,40,57,0.95))',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 18,
              alignItems: 'end',
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            <div>
              <p style={{ margin: '0 0 6px', color: '#9fb3ff', fontSize: 12, letterSpacing: 1 }}>
                RESEARCH HUB
              </p>
              <h2 style={{ margin: '0 0 8px', fontSize: 26 }}>不要只刷案例，直接切进研究视角。</h2>
              <p style={{ margin: 0, maxWidth: 720, color: '#c8d0e5', lineHeight: 1.7 }}>
                用预设专题和趋势入口，快速切入“过早扩张”“监管击穿”“平台模式失速”这类高复用研究问题。
              </p>
            </div>
            <Link
              href="/research"
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                background: '#5b7cff',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              打开 Research Hub
            </Link>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 12,
            }}
          >
            {featuredResearchPresets.map((preset) => (
              <Link
                key={preset.slug}
                href={`/research#${preset.slug}`}
                style={{
                  textDecoration: 'none',
                  color: '#f5f7fb',
                  borderRadius: 14,
                  border: '1px solid #24345b',
                  background: '#0d1426',
                  padding: '14px 16px',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 5,
                    borderRadius: 999,
                    background: preset.accent,
                  }}
                />
                <div style={{ fontWeight: 700, fontSize: 16 }}>{preset.title}</div>
                <div style={{ color: '#c8d0e5', lineHeight: 1.6, fontSize: 13 }}>
                  {preset.description}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section
        style={{
          marginBottom: 28,
          padding: 20,
          borderRadius: 16,
          border: '1px solid #1d2746',
          background: '#10172b',
        }}
      >
        <form method="get" action="/" style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                color: '#9fb3ff',
              }}
            >
              关键词
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="公司名 / 摘要"
                style={inputStyle}
              />
            </label>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                color: '#9fb3ff',
              }}
            >
              行业
              <select name="industry" defaultValue={params.industry ?? ''} style={inputStyle}>
                <option value="">全部</option>
                {industryOrphan ? (
                  <option value={industryOrphan}>{industryOrphan}（当前 URL）</option>
                ) : null}
                {industryEntries.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                color: '#9fb3ff',
              }}
            >
              国家
              <select name="country" defaultValue={params.country ?? ''} style={inputStyle}>
                <option value="">全部</option>
                {countryOrphan ? (
                  <option value={countryOrphan}>{countryOrphan}（当前 URL）</option>
                ) : null}
                {countryEntries.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label} · {code}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                color: '#9fb3ff',
              }}
            >
              关闭年
              <input
                name="closedYear"
                type="number"
                defaultValue={params.closedYear ?? ''}
                placeholder="2022"
                min={1800}
                max={2100}
                style={inputStyle}
              />
            </label>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                color: '#9fb3ff',
              }}
            >
              商业模式
              <select
                name="businessModelKey"
                defaultValue={params.businessModelKey ?? ''}
                style={inputStyle}
              >
                <option value="">全部</option>
                {businessModelOrphan ? (
                  <option value={businessModelOrphan}>{businessModelOrphan}（当前 URL）</option>
                ) : null}
                {businessModelEntries.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                color: '#9fb3ff',
              }}
            >
              主失败原因
              <select
                name="primaryFailureReasonKey"
                defaultValue={params.primaryFailureReasonKey ?? ''}
                style={inputStyle}
              >
                <option value="">全部</option>
                {primaryFrOrphan ? (
                  <option value={primaryFrOrphan}>{primaryFrOrphan}（当前 URL）</option>
                ) : null}
                {primaryFrEntries.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                color: '#9fb3ff',
              }}
            >
              每页
              <select name="limit" defaultValue={params.limit ?? '20'} style={inputStyle}>
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                color: '#9fb3ff',
              }}
            >
              排序
              <select name="sort" defaultValue={sortFormDefault} style={inputStyle}>
                <option value="relevance">相关度（有关键词时）</option>
                <option value="updated_at">更新时间</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: 'none',
                background: '#5b7cff',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              筛选
            </button>
            <Link
              href="/"
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid #2a3658',
                color: '#c8d0e5',
                textDecoration: 'none',
                alignSelf: 'center',
              }}
            >
              清除
            </Link>
          </div>
        </form>
      </section>

      <section style={{ marginBottom: 28 }}>
        <SavedViewsManager
          mode="compact"
          currentFilters={savedViewFilters}
          suggestedName={suggestedViewName}
        />
      </section>

      {loadError ? (
        <p style={{ color: '#ff8a8a', marginBottom: 24 }}>
          无法连接案例接口（请确认 API 已启动且 API_BASE_URL 正确）。
        </p>
      ) : null}

      {!loadError && items.length === 0 ? (
        <p style={{ color: '#c8d0e5', marginBottom: 24 }}>没有匹配的案例，试试放宽筛选条件。</p>
      ) : null}

      <section style={{ display: 'grid', gap: 12 }}>
        {items.map((item) => (
          <article
            key={item.id}
            style={{
              border: '1px solid #1d2746',
              borderRadius: 16,
              padding: '18px 20px',
              background: '#10172b',
              transition: 'border-color 0.15s',
            }}
          >
            {/* top row: name + meta badges */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>
                <Link
                  href={caseListHref(item)}
                  style={{ color: '#f5f7fb', textDecoration: 'none' }}
                >
                  {item.companyName}
                </Link>
              </h2>
              {/* right-side chips */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {item.totalFundingUsd != null && item.totalFundingUsd > 0 && (
                  <span style={chipStyle('#1a2c1e', '#34d399')}>
                    {formatUsd(item.totalFundingUsd)}
                  </span>
                )}
                {item.closedYear != null && (
                  <span style={chipStyle('#1d1a2e', '#9fb3ff')}>†{item.closedYear}</span>
                )}
              </div>
            </div>

            {/* summary */}
            <p
              style={{
                margin: '0 0 10px',
                color: '#c8d0e5',
                fontSize: 14,
                lineHeight: 1.65,
              }}
            >
              {item.summary}
            </p>

            {/* bottom tag row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {item.industry && <span style={tagStyle}>{industryLabel(item.industry)}</span>}
              {item.country && <span style={tagStyle}>{countryLabel(item.country)}</span>}
              {item.primaryFailureReasonKey && (
                <span style={chipStyle('#2a1a1a', '#f87171')}>
                  {taxonomy.primaryFailureReasons[item.primaryFailureReasonKey.toLowerCase()] ??
                    item.primaryFailureReasonKey}
                </span>
              )}
              {item.businessModelKey && (
                <span style={tagStyle}>
                  {taxonomy.businessModels[item.businessModelKey.toLowerCase()] ??
                    item.businessModelKey}
                </span>
              )}
            </div>
          </article>
        ))}
      </section>

      {!loadError && total > 0 ? (
        <nav
          style={{
            marginTop: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            color: '#c8d0e5',
            fontSize: 14,
          }}
        >
          <span>
            第 {page} / {totalPages} 页，共 {total} 条
          </span>
          {page > 1 ? (
            <Link href={casesListPath(withPage(page - 1))} style={pagerLinkStyle}>
              上一页
            </Link>
          ) : (
            <span style={{ opacity: 0.4 }}>上一页</span>
          )}
          {page < totalPages ? (
            <Link href={casesListPath(withPage(page + 1))} style={pagerLinkStyle}>
              下一页
            </Link>
          ) : (
            <span style={{ opacity: 0.4 }}>下一页</span>
          )}
        </nav>
      ) : null}
    </main>
  );
}

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #2a3658',
  background: '#0b1020',
  color: '#f5f7fb',
  fontSize: 15,
};

const pagerLinkStyle: CSSProperties = {
  color: '#9fb3ff',
  textDecoration: 'none',
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid #2a3658',
};

function chipStyle(bg: string, color: string): CSSProperties {
  return {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 999,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
  };
}

const tagStyle: CSSProperties = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 999,
  background: '#151e35',
  color: '#9fb3ff',
  fontSize: 12,
  letterSpacing: 0.3,
  whiteSpace: 'nowrap',
};
