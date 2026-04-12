'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          fontFamily: 'Inter, ui-sans-serif, system-ui',
          margin: 0,
          minHeight: '100vh',
          background: '#0b1020',
          color: '#f5f7fb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <main style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>应用级错误</h1>
          <p style={{ color: '#c8d0e5', lineHeight: 1.6, marginBottom: 24 }}>
            {error.message || '根布局渲染失败。'}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              border: 'none',
              background: '#5b7cff',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </main>
      </body>
    </html>
  );
}
