import Link from 'next/link';
import { fetchAdminAudit } from '@/lib/adminAuditServer';
import { pickSearchParam } from '@/lib/searchParams';

function auditLimit(raw: Record<string, string | string[] | undefined>): number {
  const s = pickSearchParam(raw.limit);
  if (s === '25') return 25;
  if (s === '50') return 50;
  if (s === '200') return 200;
  return 100;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const limit = auditLimit(raw);
  const audit = await fetchAdminAudit(limit);

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/" style={{ color: '#9fb3ff', fontSize: 14 }}>
          ← 首页
        </Link>
        {' · '}
        <Link href="/admin/reviews" style={{ color: '#9fb3ff', fontSize: 14 }}>
          运营台
        </Link>
      </div>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>审计流水</h1>
      <p style={{ color: '#8a96b0', fontSize: 13, marginBottom: 12 }}>
        最近 {limit} 条 <code style={{ color: '#9fb3ff' }}>admin_audit_events</code>。
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24, fontSize: 13 }}>
        <span style={{ color: '#8a96b0' }}>条数：</span>
        {([25, 50, 100, 200] as const).map((n) => (
          <Link
            key={n}
            href={n === 100 ? '/admin/audit' : `/admin/audit?limit=${n}`}
            style={{
              color: '#9fb3ff',
              fontWeight: limit === n ? 700 : 400,
            }}
          >
            {n}
          </Link>
        ))}
      </div>

      {audit.ok === false && audit.reason === 'no_key' ? (
        <p style={{ color: '#ffb47d' }}>未设置 ADMIN_API_KEY。</p>
      ) : null}
      {audit.ok === false && audit.reason === 'unauthorized' ? (
        <p style={{ color: '#ff8a8a' }}>401：密钥与 API 不一致。</p>
      ) : null}
      {audit.ok === false && audit.reason === 'bad_response' ? (
        <p style={{ color: '#c8d0e5' }}>无法拉取审计（表未迁移或 API 异常）。</p>
      ) : null}

      {audit.ok && audit.data.items.length === 0 ? (
        <p style={{ color: '#c8d0e5' }}>尚无事件。</p>
      ) : null}

      {audit.ok && audit.data.items.length > 0 ? (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gap: 10,
            fontSize: 13,
            color: '#c8d0e5',
          }}
        >
          {audit.data.items.map((row) => (
            <li
              key={row.id}
              style={{
                padding: 14,
                borderRadius: 12,
                border: '1px solid #1d2746',
                background: '#10172b',
              }}
            >
              <span style={{ color: '#9fb3ff' }}>{row.action}</span>
              <span style={{ marginLeft: 12, opacity: 0.85 }}>
                {new Date(row.createdAt).toLocaleString('zh-CN')}
              </span>
              <div style={{ marginTop: 8, wordBreak: 'break-all', opacity: 0.9 }}>
                review {row.reviewId ?? '—'} · case {row.caseId ?? '—'}
              </div>
              {Object.keys(row.metadata).length > 0 ? (
                <pre
                  style={{
                    margin: '10px 0 0',
                    fontSize: 11,
                    overflow: 'auto',
                    opacity: 0.8,
                    padding: 10,
                    borderRadius: 8,
                    background: '#0b1020',
                  }}
                >
                  {JSON.stringify(row.metadata, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
