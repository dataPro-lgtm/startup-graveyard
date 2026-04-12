'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        maxWidth: 480,
        margin: '80px auto',
        padding: 24,
        textAlign: 'center',
        color: '#f5f7fb',
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>出错了</h1>
      <p style={{ color: '#c8d0e5', lineHeight: 1.6, marginBottom: 24 }}>
        {error.message || '页面渲染失败，请重试。'}
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
  );
}
