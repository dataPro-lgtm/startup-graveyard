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
  return parts.length > 0 ? parts.slice(0, 3).join(' · ') : 'All Cases';
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
  const industryKeySet = new Set(industryEntries.map(([key]) => key));
  const countryKeySet = new Set(countryEntries.map(([key]) => key));
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
  const businessModelKeySet = new Set(businessModelEntries.map(([key]) => key.toLowerCase()));
  const primaryFrKeySet = new Set(primaryFrEntries.map(([key]) => key.toLowerCase()));
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
    (data?.items ?? []).reduce((sum, item) => sum + (item.totalFundingUsd ?? 0), 0);
  const failurePatterns =
    homeSummary?.failurePatterns ??
    new Set((data?.items ?? []).map((item) => item.primaryFailureReasonKey).filter(Boolean)).size;
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
      <section
        style={{
          marginBottom: 32,
          padding: '30px 30px 28px',
          borderRadius: 24,
          border: '1px solid #1d2746',
          background:
            'radial-gradient(circle at top left, rgba(91,124,255,0.18), transparent 34%), linear-gradient(145deg, rgba(16,23,43,0.98), rgba(10,14,28,0.98) 55%, rgba(14,25,48,0.98))',
        }}
      >
        <p
          style={{
            color: '#9fb3ff',
            fontSize: 12,
            letterSpacing: 1.8,
            textTransform: 'uppercase',
            margin: '0 0 12px',
          }}
        >
          Failure Intelligence
        </p>
        <h1
          style={{
            fontSize: 'clamp(34px, 5.8vw, 56px)',
            lineHeight: 1.05,
            margin: '0 0 14px',
            fontWeight: 800,
            maxWidth: 820,
            letterSpacing: '-0.03em',
          }}
        >
          Learn from startup failure like it is a dataset, not a story archive.
        </h1>
        <p
          style={{
            maxWidth: 760,
            color: '#dbe4ff',
            lineHeight: 1.75,
            margin: '0 0 10px',
            fontSize: 17,
          }}
        >
          Startup Graveyard turns startup postmortems into structured cases, comparable failure
          patterns, and grounded research outputs. Explore the archive, open the Research Hub, or
          ask Failure Copilot across the dataset.
        </p>
        <p style={{ maxWidth: 760, color: '#8fa0c9', lineHeight: 1.7, margin: '0 0 20px' }}>
          把创业失败从“故事阅读”升级成“结构化研究资产”，用于比较、推理、复盘和团队协作。
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
          {['Open-source alpha', 'Runnable product', '40+ published seed cases'].map((label) => (
            <span key={label} style={heroBadgeStyle}>
              {label}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="#case-explorer" style={primaryButtonStyle}>
            Explore Cases
          </Link>
          <Link href="/research" style={secondaryButtonStyle}>
            Open Research Hub
          </Link>
          <Link href="/copilot" style={ghostButtonStyle}>
            Ask Failure Copilot
          </Link>
        </div>
      </section>

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
            {
              label: 'Published Cases',
              value: `${totalCases}+`,
              sub: 'Structured failure records',
            },
            {
              label: 'Capital Destroyed',
              value: formatUsd(totalFundingUsd),
              sub: 'Tracked funding loss',
            },
            {
              label: 'Failure Patterns',
              value: `${failurePatterns}`,
              sub: 'Primary failure categories',
            },
            {
              label: 'Failure Copilot',
              value: 'Live',
              sub: 'Grounded cross-case Q&A',
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
              <h2 style={{ margin: '0 0 8px', fontSize: 26 }}>
                Start from a research question, not a random failure story.
              </h2>
              <p style={{ margin: 0, maxWidth: 720, color: '#c8d0e5', lineHeight: 1.7 }}>
                Jump into repeatable themes like overexpansion, regulation shock, marketplace
                breakdown, or business-model fragility through curated research presets.
              </p>
            </div>
            <Link href="/research" style={primaryButtonStyle}>
              Open Research Hub
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
        id="case-explorer"
        style={{
          marginBottom: 28,
          padding: 20,
          borderRadius: 16,
          border: '1px solid #1d2746',
          background: '#10172b',
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <p
            style={{
              margin: '0 0 6px',
              color: '#9fb3ff',
              fontSize: 12,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Case Explorer
          </p>
          <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>Query the failure dataset directly.</h2>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7, maxWidth: 720 }}>
            Filter by industry, geography, business model, failure pattern, or closure year. Save
            the resulting research view and reuse it in exports, brief shares, or team workflows.
          </p>
        </div>
        <form method="get" action="/" style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <label style={fieldLabelStyle}>
              Query
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Company, failure pattern, summary"
                style={inputStyle}
              />
            </label>
            <label style={fieldLabelStyle}>
              Industry
              <select name="industry" defaultValue={params.industry ?? ''} style={inputStyle}>
                <option value="">All</option>
                {industryOrphan ? (
                  <option value={industryOrphan}>{industryOrphan} (from current URL)</option>
                ) : null}
                {industryEntries.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              Country
              <select name="country" defaultValue={params.country ?? ''} style={inputStyle}>
                <option value="">All</option>
                {countryOrphan ? (
                  <option value={countryOrphan}>{countryOrphan} (from current URL)</option>
                ) : null}
                {countryEntries.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label} · {code}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              Closed Year
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
            <label style={fieldLabelStyle}>
              Business Model
              <select
                name="businessModelKey"
                defaultValue={params.businessModelKey ?? ''}
                style={inputStyle}
              >
                <option value="">All</option>
                {businessModelOrphan ? (
                  <option value={businessModelOrphan}>
                    {businessModelOrphan} (from current URL)
                  </option>
                ) : null}
                {businessModelEntries.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              Primary Failure Reason
              <select
                name="primaryFailureReasonKey"
                defaultValue={params.primaryFailureReasonKey ?? ''}
                style={inputStyle}
              >
                <option value="">All</option>
                {primaryFrOrphan ? (
                  <option value={primaryFrOrphan}>{primaryFrOrphan} (from current URL)</option>
                ) : null}
                {primaryFrEntries.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              Per Page
              <select name="limit" defaultValue={params.limit ?? '20'} style={inputStyle}>
                {[10, 20, 50].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              Sort
              <select name="sort" defaultValue={sortFormDefault} style={inputStyle}>
                <option value="relevance">Relevance (when query is present)</option>
                <option value="updated_at">Recently updated</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="submit" style={primaryActionButtonStyle}>
              Apply Filters
            </button>
            <Link href="/" style={clearButtonStyle}>
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section style={{ marginBottom: 28 }}>
        <div style={{ marginBottom: 14 }}>
          <p
            style={{
              margin: '0 0 6px',
              color: '#9fb3ff',
              fontSize: 12,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Research Asset
          </p>
          <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>Save this research view for reuse.</h2>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7, maxWidth: 720 }}>
            Persist the current filter set so the same research angle can feed exports, public brief
            shares, and team collaboration later.
          </p>
        </div>
        <SavedViewsManager
          mode="compact"
          currentFilters={savedViewFilters}
          suggestedName={suggestedViewName}
        />
      </section>

      {loadError ? (
        <p style={{ color: '#ff8a8a', marginBottom: 24 }}>
          Could not reach the cases API. Confirm the API is running and `API_BASE_URL` is correct.
        </p>
      ) : null}

      {!loadError && items.length === 0 ? (
        <p style={{ color: '#c8d0e5', marginBottom: 24 }}>
          No cases matched this filter set. Try broadening the query.
        </p>
      ) : null}

      {!loadError && items.length > 0 ? (
        <section style={{ marginBottom: 16 }}>
          <p
            style={{
              margin: '0 0 6px',
              color: '#9fb3ff',
              fontSize: 12,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Published Dataset
          </p>
          <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>
            {hasFilters ? 'Filtered results' : 'Published failure cases'}
          </h2>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7 }}>
            Each case stays grounded in evidence, normalized taxonomy, and reusable research
            structure.
          </p>
        </section>
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {item.totalFundingUsd != null && item.totalFundingUsd > 0 ? (
                  <span style={chipStyle('#1a2c1e', '#34d399')}>
                    {formatUsd(item.totalFundingUsd)}
                  </span>
                ) : null}
                {item.closedYear != null ? (
                  <span style={chipStyle('#1d1a2e', '#9fb3ff')}>{item.closedYear}</span>
                ) : null}
              </div>
            </div>

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

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {item.industry ? <span style={tagStyle}>{industryLabel(item.industry)}</span> : null}
              {item.country ? <span style={tagStyle}>{countryLabel(item.country)}</span> : null}
              {item.primaryFailureReasonKey ? (
                <span style={chipStyle('#2a1a1a', '#f87171')}>
                  {taxonomy.primaryFailureReasons[item.primaryFailureReasonKey.toLowerCase()] ??
                    item.primaryFailureReasonKey}
                </span>
              ) : null}
              {item.businessModelKey ? (
                <span style={tagStyle}>
                  {taxonomy.businessModels[item.businessModelKey.toLowerCase()] ??
                    item.businessModelKey}
                </span>
              ) : null}
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
            Page {page} of {totalPages}, {total} cases total
          </span>
          {page > 1 ? (
            <Link href={casesListPath(withPage(page - 1))} style={pagerLinkStyle}>
              Previous Page
            </Link>
          ) : (
            <span style={{ opacity: 0.4 }}>Previous Page</span>
          )}
          {page < totalPages ? (
            <Link href={casesListPath(withPage(page + 1))} style={pagerLinkStyle}>
              Next Page
            </Link>
          ) : (
            <span style={{ opacity: 0.4 }}>Next Page</span>
          )}
        </nav>
      ) : null}
    </main>
  );
}

const fieldLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#9fb3ff',
};

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

const heroBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 11px',
  borderRadius: 999,
  border: '1px solid #25345a',
  background: 'rgba(13, 20, 38, 0.88)',
  color: '#c8d0e5',
  fontSize: 12,
  letterSpacing: 0.2,
};

const primaryButtonStyle: CSSProperties = {
  padding: '11px 16px',
  borderRadius: 10,
  background: '#5b7cff',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

const secondaryButtonStyle: CSSProperties = {
  padding: '11px 16px',
  borderRadius: 10,
  border: '1px solid #354b7f',
  color: '#dbe4ff',
  textDecoration: 'none',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const ghostButtonStyle: CSSProperties = {
  padding: '11px 16px',
  borderRadius: 10,
  border: '1px solid #2a3658',
  color: '#c8d0e5',
  textDecoration: 'none',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const primaryActionButtonStyle: CSSProperties = {
  padding: '10px 20px',
  borderRadius: 10,
  border: 'none',
  background: '#5b7cff',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const clearButtonStyle: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #2a3658',
  color: '#c8d0e5',
  textDecoration: 'none',
  alignSelf: 'center',
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
