import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requeueIngestionJob } from '@/app/admin/reviews/actions';
import { fetchAdminIngestionJobById } from '@/lib/adminIngestionServer';
import { pickSearchParam } from '@/lib/searchParams';

export default async function AdminIngestionJobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const ok = pickSearchParam(raw.ok);
  const err = pickSearchParam(raw.err);

  const res = await fetchAdminIngestionJobById(id);
  if (res.ok === false && res.reason === 'not_found') notFound();
  if (res.ok === false) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
        <Link href="/admin/reviews#ingestion" style={{ color: '#9fb3ff' }}>
          ← 返回运营台
        </Link>
        <p style={{ color: '#ff8a8a', marginTop: 24 }}>
          {res.reason === 'no_key'
            ? '未配置 ADMIN_API_KEY'
            : res.reason === 'unauthorized'
              ? '401 密钥不一致'
              : '无法加载任务'}
        </p>
      </main>
    );
  }

  const j = res.data;

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/reviews#ingestion" style={{ color: '#9fb3ff', fontSize: 14 }}>
          ← 返回运营台 · 入库任务
        </Link>
      </div>

      <h1 style={{ fontSize: 26, marginBottom: 8 }}>Ingestion 任务</h1>
      <p style={{ color: '#8a96b0', fontSize: 13, wordBreak: 'break-all' }}>
        <code>{j.id}</code>
      </p>

      {ok === 'requeued' ? (
        <p style={{ color: '#7dffb3', marginTop: 16 }}>已重新入队（queued）。</p>
      ) : null}
      {err === 'requeue_notfound' ? (
        <p style={{ color: '#ff8a8a', marginTop: 16 }}>重新入队失败：任务不存在或非 failed。</p>
      ) : null}
      {err === 'requeue_failed' ? (
        <p style={{ color: '#ff8a8a', marginTop: 16 }}>重新入队请求失败。</p>
      ) : null}

      <section
        style={{
          marginTop: 24,
          padding: 20,
          borderRadius: 16,
          border: '1px solid #1d2746',
          background: '#10172b',
          display: 'grid',
          gap: 14,
          fontSize: 14,
          color: '#c8d0e5',
        }}
      >
        <div>
          <span style={{ color: '#9fb3ff' }}>status</span> · <strong>{j.status}</strong>
        </div>
        <div>
          <span style={{ color: '#9fb3ff' }}>source</span> · {j.sourceName}
        </div>
        <div>
          <span style={{ color: '#9fb3ff' }}>trigger</span> · {j.triggerType}
        </div>
        <div>
          <span style={{ color: '#9fb3ff' }}>createdAt</span> · {j.createdAt}
        </div>
        <div>
          <span style={{ color: '#9fb3ff' }}>startedAt</span> · {j.startedAt ?? '—'}
        </div>
        <div>
          <span style={{ color: '#9fb3ff' }}>finishedAt</span> · {j.finishedAt ?? '—'}
        </div>
        {j.errorMessage ? (
          <div style={{ color: '#ff9f9f', wordBreak: 'break-word' }}>
            <span style={{ color: '#9fb3ff' }}>error</span> · {j.errorMessage}
          </div>
        ) : null}
        <div>
          <div style={{ color: '#9fb3ff', marginBottom: 8 }}>payload</div>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 10,
              background: '#0b1020',
              border: '1px solid #1d2746',
              fontSize: 12,
              overflow: 'auto',
              maxHeight: 360,
            }}
          >
            {JSON.stringify(j.payload, null, 2)}
          </pre>
        </div>
      </section>

      {j.status === 'failed' ? (
        <form action={requeueIngestionJob} style={{ marginTop: 20 }}>
          <input type="hidden" name="jobId" value={j.id} />
          <input type="hidden" name="stayOnDetail" value="1" />
          <button
            type="submit"
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid #3d5a8a',
              background: '#152238',
              color: '#9fb3ff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            重新入队
          </button>
        </form>
      ) : null}
    </main>
  );
}
