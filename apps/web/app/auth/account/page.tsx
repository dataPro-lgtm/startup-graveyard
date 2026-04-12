'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/app/components/AuthProvider';

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main style={{ maxWidth: 520, margin: '80px auto', padding: '0 24px' }}>
        <div style={{ height: 40, background: '#1d2746', borderRadius: 8 }} />
      </main>
    );
  }

  async function handleLogout() {
    await logout();
    router.push('/');
  }

  return (
    <main style={{ maxWidth: 520, margin: '60px auto', padding: '0 24px 80px' }}>
      <Link href="/" style={{ color: '#9fb3ff', fontSize: 13, textDecoration: 'none' }}>
        ← 返回首页
      </Link>

      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '24px 0 28px' }}>我的账号</h1>

      {/* Profile card */}
      <div
        style={{
          background: '#10172b',
          border: '1px solid #1d2746',
          borderRadius: 16,
          padding: '24px 28px',
          marginBottom: 20,
        }}
      >
        <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>
          {user.displayName ?? user.email}
        </p>
        <p style={{ margin: '0 0 16px', color: '#9fb3ff', fontSize: 14 }}>{user.email}</p>

        <div style={{ display: 'flex', gap: 10 }}>
          <Chip
            label={user.subscription === 'pro' ? '🌟 Pro 会员' : '免费版'}
            color={user.subscription === 'pro' ? '#fbbf24' : '#6b7ca8'}
          />
          <Chip label={user.role === 'admin' ? '管理员' : '普通用户'} color="#5b7cff" />
        </div>
      </div>

      {/* Pro upsell (free tier only) */}
      {user.subscription === 'free' && (
        <div
          style={{
            background: 'linear-gradient(135deg, #1a1f3a, #1a0a2e)',
            border: '1px solid #5b7cff44',
            borderRadius: 16,
            padding: '24px 28px',
            marginBottom: 20,
          }}
        >
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>🚀 升级到 Pro</p>
          <p style={{ margin: '0 0 16px', color: '#9fb3ff', fontSize: 14, lineHeight: 1.7 }}>
            Pro 会员解锁高级功能：无限 Copilot 问答、案例深度报告、API 访问权限。
          </p>
          <button
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: 'none',
              background: '#5b7cff',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
            onClick={() => alert('支付功能即将上线')}
          >
            了解 Pro 计划
          </button>
        </div>
      )}

      {/* Logout */}
      <button
        onClick={handleLogout}
        style={{
          padding: '10px 22px',
          borderRadius: 10,
          border: '1px solid #2a3658',
          background: 'transparent',
          color: '#f87171',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        退出登录
      </button>
    </main>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        padding: '4px 12px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {label}
    </span>
  );
}
