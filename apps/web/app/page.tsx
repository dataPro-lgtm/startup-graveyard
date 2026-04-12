import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  type CasesSearchParams,
  caseListHref,
  casesListPath,
  fetchCasesList,
} from '@/lib/casesApi';
import { formatUsd } from '@/lib/formatUsd';
import { fetchTaxonomy } from '@/lib/metaApi';
import { countryLabel, industryLabel } from '@sg/shared/taxonomy';
import { pickSearchParam } from '@/lib/searchParams';

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

  const [data, taxonomy] = await Promise.all([
    fetchCasesList(params),
    fetchTaxonomy(),
  ]);

  const industryEntries = Object.entries(taxonomy.industries).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const countryEntries = Object.entries(taxonomy.countries).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const industryKeySet = new Set(industryEntries.map(([k]) => k));
  const countryKeySet = new Set(countryEntries.map(([k]) => k));
  const industryOrphan =
    params.industry && !industryKeySet.has(params.industry)
      ? params.industry
      : null;
  const countryOrphan =
    params.country && !countryKeySet.has(params.country)
      ? params.country
      : null;
  const businessModelEntries = Object.entries(taxonomy.businessModels).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const primaryFrEntries = Object.entries(
    taxonomy.primaryFailureReasons,
  ).sort(([a], [b]) => a.localeCompare(b));
  const businessModelKeySet = new Set(
    businessModelEntries.map(([k]) => k.toLowerCase()),
  );
  const primaryFrKeySet = new Set(primaryFrEntries.map(([k]) => k.toLowerCase()));
  const bmNorm = params.businessModelKey?.toLowerCase();
  const pfrNorm = params.primaryFailureReasonKey?.toLowerCase();
  const businessModelOrphan =
    bmNorm && !businessModelKeySet.has(bmNorm)
      ? params.businessModelKey
      : null;
  const primaryFrOrphan =
    pfrNorm && !primaryFrKeySet.has(pfrNorm)
      ? params.primaryFailureReasonKey
      : null;
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

  const totalCases = data?.total ?? 0;
  const totalFundingUsd = (data?.items ?? []).reduce(
    (sum, it) => sum + (it.totalFundingUsd ?? 0),
    0,
  );
  // Count distinct failure reason keys
  const failurePatterns = new Set(
    (data?.items ?? [])
      .map((it) => it.primaryFailureReasonKey)
      .filter(Boolean),
  ).size;

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 80px' }}>
      <section style={{ marginBottom: 32 }}>
        <p style={{ color: '#9fb3ff', fontSize: 14, letterSpacing: 1.2 }}>FAILURE INTELLIGENCE</p>
        <h1 style={{ fontSize: 42, lineHeight: 1.15, margin: '8px 0 12px' }}>
          Startup Graveyard
        </h1>
        <p style={{ maxWidth: 720, color: '#c8d0e5', lineHeight: 1.7 }}>
          把失败案例从内容库升级为结构化、可检索、可解释的决策知识系统。
        </p>
      </section>

      {/* 统计横幅 */}
      {!params.q && !params.industry && !params.country && (
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
                  <div style={{ fontSize: 11, color: '#6b7fa8', letterSpacing: 1, marginBottom: 6 }}>
                    {stat.label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#5b7cff', lineHeight: 1.15 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7fa8', marginTop: 4 }}>{stat.sub}</div>
                </Link>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#6b7fa8', letterSpacing: 1, marginBottom: 6 }}>
                    {stat.label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#f5f7fb', lineHeight: 1.15 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7fa8', marginTop: 4 }}>{stat.sub}</div>
                </>
              )}
            </div>
          ))}
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#9fb3ff' }}>
              关键词
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="公司名 / 摘要"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#9fb3ff' }}>
              行业
              <select
                name="industry"
                defaultValue={params.industry ?? ''}
                style={inputStyle}
              >
                <option value="">全部</option>
                {industryOrphan ? (
                  <option value={industryOrphan}>
                    {industryOrphan}（当前 URL）
                  </option>
                ) : null}
                {industryEntries.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#9fb3ff' }}>
              国家
              <select
                name="country"
                defaultValue={params.country ?? ''}
                style={inputStyle}
              >
                <option value="">全部</option>
                {countryOrphan ? (
                  <option value={countryOrphan}>
                    {countryOrphan}（当前 URL）
                  </option>
                ) : null}
                {countryEntries.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label} · {code}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#9fb3ff' }}>
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#9fb3ff' }}>
              商业模式
              <select
                name="businessModelKey"
                defaultValue={params.businessModelKey ?? ''}
                style={inputStyle}
              >
                <option value="">全部</option>
                {businessModelOrphan ? (
                  <option value={businessModelOrphan}>
                    {businessModelOrphan}（当前 URL）
                  </option>
                ) : null}
                {businessModelEntries.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#9fb3ff' }}>
              主失败原因
              <select
                name="primaryFailureReasonKey"
                defaultValue={params.primaryFailureReasonKey ?? ''}
                style={inputStyle}
              >
                <option value="">全部</option>
                {primaryFrOrphan ? (
                  <option value={primaryFrOrphan}>
                    {primaryFrOrphan}（当前 URL）
                  </option>
                ) : null}
                {primaryFrEntries.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} · {key}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#9fb3ff' }}>
              每页
              <select
                name="limit"
                defaultValue={params.limit ?? '20'}
                style={inputStyle}
              >
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#9fb3ff' }}>
              排序
              <select
                name="sort"
                defaultValue={sortFormDefault}
                style={inputStyle}
              >
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

      {loadError ? (
        <p style={{ color: '#ff8a8a', marginBottom: 24 }}>
          无法连接案例接口（请确认 API 已启动且 API_BASE_URL 正确）。
        </p>
      ) : null}

      {!loadError && items.length === 0 ? (
        <p style={{ color: '#c8d0e5', marginBottom: 24 }}>
          没有匹配的案例，试试放宽筛选条件。
        </p>
      ) : null}

      <section style={{ display: 'grid', gap: 16 }}>
        {items.map((item) => (
          <article
            key={item.id}
            style={{
              border: '1px solid #1d2746',
              borderRadius: 16,
              padding: 20,
              background: '#10172b',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>
                  <Link
                    href={caseListHref(item)}
                    style={{ color: '#f5f7fb', textDecoration: 'none' }}
                  >
                    {item.companyName}
                  </Link>
                </h2>
                <p style={{ margin: 0, color: '#c8d0e5' }}>{item.summary}</p>
              </div>
              <div style={{ minWidth: 200, color: '#9fb3ff', fontSize: 14 }}>
                <div title={item.industry}>{industryLabel(item.industry)}</div>
                {industryLabel(item.industry) !== item.industry ? (
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                    {item.industry}
                  </div>
                ) : null}
                <div style={{ marginTop: 8 }} title={item.country ?? ''}>
                  {countryLabel(item.country)}
                </div>
                {item.country && countryLabel(item.country) !== item.country ? (
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                    {item.country}
                  </div>
                ) : null}
                <div style={{ marginTop: 8 }}>关闭年 {item.closedYear ?? '—'}</div>
                {item.foundedYear != null ? (
                  <div style={{ marginTop: 8 }}>成立 {item.foundedYear}</div>
                ) : null}
                {item.businessModelKey ? (
                  <div style={{ marginTop: 8 }} title={item.businessModelKey}>
                    {taxonomy.businessModels[item.businessModelKey.toLowerCase()] ??
                      item.businessModelKey}
                  </div>
                ) : null}
                {item.totalFundingUsd != null ? (
                  <div style={{ marginTop: 8 }}>{formatUsd(item.totalFundingUsd)}</div>
                ) : null}
                {item.primaryFailureReasonKey ? (
                  <div
                    style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}
                    title={item.primaryFailureReasonKey}
                  >
                    {taxonomy.primaryFailureReasons[
                      item.primaryFailureReasonKey.toLowerCase()
                    ] ?? item.primaryFailureReasonKey}
                  </div>
                ) : null}
              </div>
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
            <Link
              href={casesListPath(withPage(page - 1))}
              style={pagerLinkStyle}
            >
              上一页
            </Link>
          ) : (
            <span style={{ opacity: 0.4 }}>上一页</span>
          )}
          {page < totalPages ? (
            <Link
              href={casesListPath(withPage(page + 1))}
              style={pagerLinkStyle}
            >
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
