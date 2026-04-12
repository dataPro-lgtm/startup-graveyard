import Link from 'next/link';

export default function CaseNotFound() {
  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 80px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>未找到案例</h1>
      <p style={{ color: '#c8d0e5', marginBottom: 24 }}>该 ID 不存在或未发布。</p>
      <Link href="/" style={{ color: '#9fb3ff' }}>
        返回列表
      </Link>
    </main>
  );
}
