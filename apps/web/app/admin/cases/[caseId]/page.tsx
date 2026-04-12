import type { CSSProperties } from 'react';
import Link from 'next/link';
import { pickSearchParam } from '@/lib/searchParams';
import { addCaseEvidence, addCaseFailureFactor } from '../attachmentActions';

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

const card: CSSProperties = {
  marginTop: 28,
  padding: 20,
  borderRadius: 16,
  border: '1px solid #1d2746',
  background: '#10172b',
};

export default async function AdminCaseAttachmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { caseId } = await params;
  const raw = await searchParams;
  const ok = pickSearchParam(raw.ok);
  const err = pickSearchParam(raw.err);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <Link href="/admin/cases" style={{ color: '#9fb3ff', fontSize: 14 }}>
          ← 案例 UUID 入口
        </Link>
        <Link href="/admin/reviews" style={{ color: '#9fb3ff', fontSize: 14 }}>
          运营台
        </Link>
      </div>

      <h1 style={{ fontSize: 26, marginBottom: 6 }}>案例附件</h1>
      <p style={{ color: '#8a96b0', fontSize: 13, wordBreak: 'break-all', marginBottom: 20 }}>
        <code style={{ color: '#9fb3ff' }}>{caseId}</code>
      </p>

      {ok === 'evidence' ? (
        <p style={{ color: '#7dffb3', marginBottom: 16 }}>已添加证据来源。</p>
      ) : null}
      {ok === 'factor' ? (
        <p style={{ color: '#7dffb3', marginBottom: 16 }}>已添加失败因子。</p>
      ) : null}
      {err === 'config' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>Web 未配置 ADMIN_API_KEY。</p>
      ) : null}
      {err === 'notfound' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>案例不存在（UUID 无效或未入库）。</p>
      ) : null}
      {err === 'evidence_fields' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>证据：请填写来源类型、标题、URL。</p>
      ) : null}
      {err === 'evidence_validation' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>证据字段未通过 API 校验。</p>
      ) : null}
      {err === 'evidence_failed' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>添加证据请求失败。</p>
      ) : null}
      {err === 'factor_fields' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>因子：请填写 level1Key、level2Key。</p>
      ) : null}
      {err === 'factor_validation' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>
          因子校验失败（权重须为 0–100 的数字等）。
        </p>
      ) : null}
      {err === 'factor_failed' ? (
        <p style={{ color: '#ff8a8a', marginBottom: 16 }}>添加因子请求失败。</p>
      ) : null}

      <section style={card}>
        <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>证据来源</h2>
        <form action={addCaseEvidence.bind(null, caseId)} style={{ display: 'grid', gap: 12 }}>
          <label style={fieldStyle}>
            sourceType
            <input name="sourceType" required placeholder="如 news / filing" style={inputLike} />
          </label>
          <label style={fieldStyle}>
            title
            <input name="title" required style={inputLike} />
          </label>
          <label style={fieldStyle}>
            url
            <input name="url" required placeholder="https://..." style={inputLike} />
          </label>
          <label style={fieldStyle}>
            publisher（可选）
            <input name="publisher" style={inputLike} />
          </label>
          <label style={fieldStyle}>
            publishedAt（可选，可解析日期字符串）
            <input name="publishedAt" placeholder="2024-01-15" style={inputLike} />
          </label>
          <label style={fieldStyle}>
            credibilityLevel
            <select name="credibilityLevel" defaultValue="medium" style={inputLike}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label style={fieldStyle}>
            excerpt（可选）
            <textarea name="excerpt" rows={3} style={{ ...inputLike, resize: 'vertical' }} />
          </label>
          <button
            type="submit"
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: '#3d5cff',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              justifySelf: 'start',
            }}
          >
            提交证据
          </button>
        </form>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>失败因子</h2>
        <form action={addCaseFailureFactor.bind(null, caseId)} style={{ display: 'grid', gap: 12 }}>
          <label style={fieldStyle}>
            level1Key
            <input name="level1Key" required style={inputLike} />
          </label>
          <label style={fieldStyle}>
            level2Key
            <input name="level2Key" required style={inputLike} />
          </label>
          <label style={fieldStyle}>
            level3Key（可选）
            <input name="level3Key" style={inputLike} />
          </label>
          <label style={fieldStyle}>
            weight（0–100，默认 1）
            <input
              name="weight"
              type="number"
              min={0}
              max={100}
              defaultValue={1}
              style={inputLike}
            />
          </label>
          <label style={fieldStyle}>
            explanation（可选）
            <textarea name="explanation" rows={3} style={{ ...inputLike, resize: 'vertical' }} />
          </label>
          <button
            type="submit"
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: '#2a6b4a',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              justifySelf: 'start',
            }}
          >
            提交因子
          </button>
        </form>
      </section>
    </main>
  );
}
