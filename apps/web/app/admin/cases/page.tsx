import type { CSSProperties } from 'react';
import Link from 'next/link';
import { pickSearchParam } from '@/lib/searchParams';
import { goToCaseAttachments } from './attachmentActions';

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#9fb3ff',
};

const inputLike: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #2a3658',
  background: '#0b1020',
  color: '#f5f7fb',
  fontSize: 14,
};

export default async function AdminCasesHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const err = pickSearchParam(raw.err);

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/reviews" style={{ color: '#9fb3ff', fontSize: 14 }}>
          ← 运营台
        </Link>
      </div>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>案例录入 / 修正</h1>
      <p style={{ color: '#c8d0e5', marginBottom: 24, fontSize: 14 }}>
        输入已存在案例的 UUID，进入录入页：POST{' '}
        <code style={{ color: '#9fb3ff' }}>/v1/admin/cases/:caseId/evidence</code> 与{' '}
        <code style={{ color: '#9fb3ff' }}>failure-factors</code>，以及时间线 / 分析更新接口。需配置{' '}
        <code style={{ color: '#9fb3ff' }}>ADMIN_API_KEY</code>。
      </p>

      {err === 'invalid_case' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>请输入合法 UUID。</p>
      ) : null}

      <form action={goToCaseAttachments} style={{ display: 'grid', gap: 14, maxWidth: 480 }}>
        <label style={fieldStyle}>
          caseId（UUID）
          <input
            name="caseId"
            required
            placeholder="00000000-0000-4000-8000-000000000000"
            style={inputLike}
          />
        </label>
        <button
          type="submit"
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: '#5b7cff',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            justifySelf: 'start',
          }}
        >
          打开录入页
        </button>
      </form>
    </main>
  );
}
