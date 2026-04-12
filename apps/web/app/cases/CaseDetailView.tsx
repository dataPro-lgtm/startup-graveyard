import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  type CaseDetail,
  type CaseListItem,
  type TimelineEvent,
  caseListHref,
} from '@/lib/casesApi';
import { formatUsd } from '@/lib/formatUsd';
import { fetchTaxonomy } from '@/lib/metaApi';
import {
  businessModelLabel,
  countryLabel,
  failureFactorLevel1Label,
  failureFactorLevel2Label,
  industryLabel,
  primaryFailureReasonLabel,
  timelineEventTypeLabel,
} from '@sg/shared/taxonomy';
import { WatchlistButton } from './WatchlistButton';

const sectionTitle = {
  fontSize: 13,
  letterSpacing: 1.1,
  color: '#9fb3ff',
  margin: '0 0 12px',
} as const;

const card = {
  border: '1px solid #1d2746',
  borderRadius: 16,
  padding: 20,
  background: '#10172b',
} as const;

const EVENT_TYPE_META: Record<string, { label: string; color: string; dot: string }> = {
  // canonical keys
  founded: { label: '成立', color: '#5b7cff', dot: '#5b7cff' },
  founding: { label: '成立', color: '#5b7cff', dot: '#5b7cff' },
  funding: { label: '融资', color: '#34d399', dot: '#34d399' },
  product_launch: { label: '产品上线', color: '#60a5fa', dot: '#60a5fa' },
  milestone: { label: '里程碑', color: '#60a5fa', dot: '#60a5fa' },
  pivot: { label: '战略转型', color: '#fbbf24', dot: '#fbbf24' },
  problem: { label: '问题暴露', color: '#f97316', dot: '#f97316' },
  layoff: { label: '裁员', color: '#f97316', dot: '#f97316' },
  shutdown: { label: '关闭', color: '#f87171', dot: '#f87171' },
  acquisition: { label: '收购', color: '#a78bfa', dot: '#a78bfa' },
  regulatory: { label: '监管事件', color: '#fb923c', dot: '#fb923c' },
  competition: { label: '竞争压力', color: '#f59e0b', dot: '#f59e0b' },
  other: { label: '其他', color: '#6b7280', dot: '#6b7280' },
};

function TimelineEventCard({
  evt,
  isLast,
  label,
}: {
  evt: TimelineEvent;
  isLast: boolean;
  label: string;
}) {
  const meta = EVENT_TYPE_META[evt.eventType] ?? EVENT_TYPE_META.other;
  const dotStyle: CSSProperties = {
    position: 'absolute',
    left: -20,
    top: 6,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: meta.dot,
    border: '2px solid #0b1020',
    flexShrink: 0,
  };
  return (
    <div
      style={{
        position: 'relative',
        marginBottom: isLast ? 0 : 16,
        paddingBottom: isLast ? 0 : 4,
      }}
    >
      <div style={dotStyle} />
      <div
        style={{
          border: '1px solid #1d2746',
          borderRadius: 12,
          padding: '12px 16px',
          background: '#10172b',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 999,
              background: '#1d2746',
              color: meta.color,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {label}
          </span>
          <span style={{ color: '#9fb3ff', fontSize: 13 }}>{evt.eventDate}</span>
          {evt.amountUsd != null && (
            <span style={{ color: '#34d399', fontSize: 13 }}>{formatUsd(evt.amountUsd)}</span>
          )}
        </div>
        <div style={{ color: '#f5f7fb', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
          {evt.title}
        </div>
        {evt.description && (
          <div style={{ color: '#c8d0e5', fontSize: 14, lineHeight: 1.6 }}>{evt.description}</div>
        )}
      </div>
    </div>
  );
}

function pickLabel(
  map: Record<string, string>,
  key: string | null,
  fallback: (k: string) => string,
): string {
  if (!key) return '—';
  const k = key.toLowerCase();
  return map[k] ?? fallback(key);
}

/** Handles both JSON array strings and plain newline-separated text. */
function parseKeyLessons(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // fall through
    }
  }
  return trimmed
    .split('\n')
    .map((l) => l.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

export async function CaseDetailView({
  item,
  similar,
}: {
  item: CaseDetail;
  similar: CaseListItem[];
}) {
  const tax = await fetchTaxonomy();
  const bm = (k: string | null) => pickLabel(tax.businessModels, k, businessModelLabel);
  const pfr = (k: string | null) =>
    pickLabel(tax.primaryFailureReasons, k, primaryFailureReasonLabel);
  const factorLevel1 = (k: string | null) =>
    pickLabel(tax.failureFactorLevel1, k, failureFactorLevel1Label);
  const factorLevel2 = (k: string | null) =>
    pickLabel(tax.failureFactorLevel2, k, failureFactorLevel2Label);
  const timelineLabel = (k: string | null) =>
    pickLabel(tax.timelineEventTypes, k, timelineEventTypeLabel);

  const topFactor =
    item.failureFactors.length > 0
      ? [...item.failureFactors].sort((a, b) => b.weight - a.weight)[0]
      : null;

  const explainSnippet = (s: string | null, max: number) => {
    if (!s) return '';
    const t = s.trim();
    return t.length <= max ? t : `${t.slice(0, max)}…`;
  };

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 80px' }}>
      <Link href="/" style={{ color: '#9fb3ff', textDecoration: 'none', fontSize: 14 }}>
        ← 返回列表
      </Link>
      <article style={{ ...card, marginTop: 24, padding: 28 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            gap: 20,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 36 }}>{item.companyName}</h1>
          <WatchlistButton caseId={item.id} />
        </div>
        <div
          style={{
            display: 'flex',
            gap: 20,
            marginBottom: 20,
            color: '#9fb3ff',
            fontSize: 14,
            flexWrap: 'wrap',
          }}
        >
          <span>
            行业 {industryLabel(item.industry)}
            {industryLabel(item.industry) !== item.industry ? ` (${item.industry})` : ''}
          </span>
          <span>
            国家 {countryLabel(item.country)}
            {item.country && countryLabel(item.country) !== item.country
              ? ` (${item.country})`
              : ''}
          </span>
          <span>关闭年 {item.closedYear ?? '—'}</span>
          <span>成立年 {item.foundedYear ?? '—'}</span>
          <span>商业模式 {bm(item.businessModelKey)}</span>
          <span>总融资 {formatUsd(item.totalFundingUsd)}</span>
          <span>主失败原因 {pfr(item.primaryFailureReasonKey)}</span>
        </div>
        {item.primaryFailureReasonKey || topFactor ? (
          <div
            style={{
              marginBottom: 20,
              padding: '14px 18px',
              borderRadius: 14,
              border: '1px solid #2a3658',
              background: '#0d1428',
            }}
          >
            <div style={{ ...sectionTitle, marginBottom: 10 }}>失败要点</div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                alignItems: 'baseline',
              }}
            >
              {item.primaryFailureReasonKey ? (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: 999,
                    background: '#1d2746',
                    color: '#b8c8ff',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  主因 · {pfr(item.primaryFailureReasonKey)}
                </span>
              ) : null}
              {topFactor ? (
                <span
                  style={{ color: '#c8d0e5', fontSize: 15, lineHeight: 1.55, flex: '1 1 240px' }}
                >
                  最高权重因子 · {factorLevel1(topFactor.level1Key)} →{' '}
                  {factorLevel2(topFactor.level2Key)}
                  {topFactor.level3Key ? ` → ${factorLevel2(topFactor.level3Key)}` : ''}
                  <span style={{ color: '#9fb3ff', marginLeft: 8 }}>权重 {topFactor.weight}</span>
                  {topFactor.explanation ? ` — ${explainSnippet(topFactor.explanation, 160)}` : ''}
                </span>
              ) : item.primaryFailureReasonKey ? (
                <span style={{ color: '#8a96b0', fontSize: 14 }}>暂无结构化因子明细</span>
              ) : null}
            </div>
          </div>
        ) : null}
        <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.75, fontSize: 17 }}>
          {item.summary}
        </p>
      </article>

      {item.keyLessons && (
        <section style={{ marginTop: 28 }}>
          <h2 style={sectionTitle}>核心教训</h2>
          <div
            style={{
              ...card,
              background: '#0a1428',
              border: '1px solid #2a3a5e',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {parseKeyLessons(item.keyLessons).map((lesson, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#1d3060',
                    color: '#9fb3ff',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {i + 1}
                </span>
                <p style={{ margin: 0, color: '#c8d0e5', fontSize: 15, lineHeight: 1.7, flex: 1 }}>
                  {lesson}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {similar.length > 0 ? (
        <section style={{ marginTop: 28 }}>
          <h2 style={sectionTitle}>相似案例（向量近邻）</h2>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 12,
            }}
          >
            {similar.map((s) => (
              <li key={s.id} style={card}>
                <Link
                  href={caseListHref(s)}
                  style={{ color: '#7d9cff', fontSize: 17, fontWeight: 600 }}
                >
                  {s.companyName}
                </Link>
                <div style={{ marginTop: 8, fontSize: 13, color: '#9fb3ff' }}>
                  {industryLabel(s.industry)}
                  {s.country ? ` · ${countryLabel(s.country)}` : ''}
                  {s.closedYear != null ? ` · ${s.closedYear}` : ''}
                  {s.foundedYear != null ? ` · 成立 ${s.foundedYear}` : ''}
                  {s.totalFundingUsd != null ? ` · ${formatUsd(s.totalFundingUsd)}` : ''}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, color: '#c8d0e5', lineHeight: 1.55 }}>
                  {s.summary}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {item.timelineEvents.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 style={sectionTitle}>发展时间线</h2>
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            {/* 竖线 */}
            <div
              style={{
                position: 'absolute',
                left: 8,
                top: 0,
                bottom: 0,
                width: 2,
                background: '#1d2746',
                borderRadius: 1,
              }}
            />
            {item.timelineEvents.map((evt, idx) => (
              <TimelineEventCard
                key={evt.id}
                evt={evt}
                isLast={idx === item.timelineEvents.length - 1}
                label={timelineLabel(evt.eventType)}
              />
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionTitle}>失败因子（结构化归因）</h2>
        {item.failureFactors.length === 0 ? (
          <p style={{ color: '#8a96b0', fontSize: 14 }}>暂无因子数据。</p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 12,
            }}
          >
            {item.failureFactors.map((f) => (
              <li key={f.id} style={card}>
                <div style={{ color: '#c8d0e5', fontSize: 15, marginBottom: 6 }}>
                  <strong style={{ color: '#f5f7fb' }}>
                    {factorLevel1(f.level1Key)} → {factorLevel2(f.level2Key)}
                    {f.level3Key ? ` → ${factorLevel2(f.level3Key)}` : ''}
                  </strong>
                  <span style={{ marginLeft: 12, color: '#9fb3ff' }}>权重 {f.weight}</span>
                </div>
                {f.explanation ? (
                  <p style={{ margin: 0, color: '#b8c0d8', lineHeight: 1.6, fontSize: 14 }}>
                    {f.explanation}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={sectionTitle}>证据来源</h2>
        {item.evidenceSources.length === 0 ? (
          <p style={{ color: '#8a96b0', fontSize: 14 }}>暂无引用来源。</p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 12,
            }}
          >
            {item.evidenceSources.map((e) => (
              <li key={e.id} style={card}>
                <div style={{ marginBottom: 6 }}>
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#7d9cff', fontSize: 16, fontWeight: 600 }}
                  >
                    {e.title}
                  </a>
                  <span
                    style={{
                      marginLeft: 10,
                      fontSize: 12,
                      color: '#8a96b0',
                      textTransform: 'uppercase',
                    }}
                  >
                    {e.sourceType} · {e.credibilityLevel}
                  </span>
                </div>
                {e.publisher ? (
                  <div style={{ fontSize: 13, color: '#9fb3ff' }}>{e.publisher}</div>
                ) : null}
                {e.excerpt ? (
                  <p style={{ margin: '8px 0 0', fontSize: 14, color: '#c8d0e5' }}>{e.excerpt}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
