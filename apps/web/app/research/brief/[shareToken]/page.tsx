import Link from 'next/link';
import { notFound } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { fetchPublicReportShare, isApiError } from '@/lib/reportSharesApi';
import { formatUsd } from '@/lib/formatUsd';
import { countryLabel, industryLabel, primaryFailureReasonLabel } from '@sg/shared/taxonomy';

export default async function SharedResearchBriefPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const data = await fetchPublicReportShare(shareToken);
  if (isApiError(data)) {
    notFound();
  }
  const pdfHref = `${API_BASE_URL}/v1/reports/shares/public/${encodeURIComponent(shareToken)}/pdf`;

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px 88px' }}>
      <section
        style={{
          borderRadius: 18,
          border: '1px solid #1d2746',
          background:
            'radial-gradient(circle at top left, rgba(91,124,255,0.22), transparent 34%), #10172b',
          padding: '28px 28px',
          marginBottom: 24,
        }}
      >
        <p style={{ margin: '0 0 8px', color: '#9fb3ff', fontSize: 12, letterSpacing: 1.3 }}>
          SHARED RESEARCH BRIEF
        </p>
        <h1 style={{ margin: '0 0 10px', fontSize: 'clamp(30px, 5vw, 44px)', lineHeight: 1.08 }}>
          {data.brief.title}
        </h1>
        <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.75, maxWidth: 760 }}>
          这是一份从 Startup Graveyard Saved View 生成的公开 research
          brief。它保留筛选摘要、样本快照和代表性案例，适合外发给团队外的合作者、客户或投资委员会。
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          {data.brief.filterSummary.map((item) => (
            <span
              key={item}
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                border: '1px solid #2a3658',
                color: '#9fb3ff',
                fontSize: 12,
              }}
            >
              {item}
            </span>
          ))}
        </div>
        <div style={{ color: '#8a96b0', fontSize: 13, lineHeight: 1.7, marginTop: 14 }}>
          <div>
            共享人：{data.share.ownerDisplayName ?? 'Startup Graveyard 用户'} · 生成于{' '}
            {new Date(data.brief.generatedAt).toLocaleString('zh-CN')}
          </div>
          <div>
            原始视图：
            <Link
              href={data.brief.sourceViewPath}
              style={{ color: '#9fb3ff', textDecoration: 'none' }}
            >
              返回案例库同筛选 →
            </Link>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <a href={pdfHref} style={primaryCtaStyle}>
            下载 PDF Brief
          </a>
          <Link href={data.brief.sourceViewPath} style={secondaryCtaStyle}>
            返回案例库同筛选
          </Link>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <MetricCard
          label="匹配案例"
          value={`${data.brief.totalMatchingCases}`}
          sub="当前筛选总量"
        />
        <MetricCard label="样本快照" value={`${data.brief.sampleSize}`} sub="本页展示样本" />
        <MetricCard
          label="样本融资"
          value={formatUsd(data.brief.sampleFundingUsd)}
          sub="当前快照覆盖资金"
        />
        <MetricCard
          label="分享访问"
          value={data.share.lastAccessedAt ? '已访问' : '首次分享'}
          sub={
            data.share.lastAccessedAt
              ? new Date(data.share.lastAccessedAt).toLocaleString('zh-CN')
              : '等待外部访问'
          }
        />
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <BucketCard title="高频行业" values={data.brief.topIndustries} />
        <BucketCard title="高频失败主因" values={data.brief.topFailureReasons} />
      </section>

      <section
        style={{
          borderRadius: 18,
          border: '1px solid #1d2746',
          background: '#10172b',
          padding: '22px 24px',
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 6px', color: '#9fb3ff', fontSize: 12, letterSpacing: 1.2 }}>
            CASE SNAPSHOT
          </p>
          <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>代表性案例</h2>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7 }}>
            这部分展示当前筛选下的样本案例，用来快速给外部读者建立共同上下文。
          </p>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {data.brief.cases.map((item, index) => (
            <article
              key={item.id}
              style={{
                borderRadius: 14,
                border: '1px solid #223253',
                background: '#0d1428',
                padding: '16px 18px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'start',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#5b7cff', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    #{index + 1}
                  </div>
                  <Link
                    href={`/cases/s/${encodeURIComponent(item.slug)}`}
                    style={{
                      color: '#9fb3ff',
                      textDecoration: 'none',
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    {item.companyName}
                  </Link>
                  <div style={{ color: '#8a96b0', fontSize: 13, marginTop: 6 }}>
                    {industryLabel(item.industry)}
                    {item.country ? ` · ${countryLabel(item.country)}` : ''}
                    {item.closedYear ? ` · ${item.closedYear}` : ''}
                    {item.primaryFailureReasonKey
                      ? ` · ${primaryFailureReasonLabel(item.primaryFailureReasonKey)}`
                      : ''}
                  </div>
                </div>
                <div style={{ color: '#c8d0e5', fontSize: 13 }}>
                  {formatUsd(item.totalFundingUsd)}
                </div>
              </div>
              <p style={{ margin: '10px 0 0', color: '#c8d0e5', lineHeight: 1.7 }}>
                {item.summary}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px solid #1d2746',
        background: '#10172b',
        padding: '18px 18px',
      }}
    >
      <div style={{ color: '#6b7fa8', fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      <div style={{ marginTop: 6, color: '#8a96b0', fontSize: 12 }}>{sub}</div>
    </div>
  );
}

function BucketCard({ title, values }: { title: string; values: string[] }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px solid #1d2746',
        background: '#10172b',
        padding: '18px 18px',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>{title}</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {(values.length > 0 ? values : ['N/A']).map((value) => (
          <div
            key={value}
            style={{
              borderRadius: 12,
              border: '1px solid #223253',
              background: '#0d1428',
              color: '#c8d0e5',
              padding: '10px 12px',
            }}
          >
            {value}
          </div>
        ))}
      </div>
    </div>
  );
}

const primaryCtaStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 999,
  background: '#5b7cff',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
} as const;

const secondaryCtaStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 999,
  border: '1px solid #2a3658',
  color: '#9fb3ff',
  textDecoration: 'none',
  fontWeight: 700,
} as const;
