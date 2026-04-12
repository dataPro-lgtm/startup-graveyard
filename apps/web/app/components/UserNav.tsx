'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';

export function UserNav() {
  const { user, loading } = useAuth();
  if (loading) return null;

  if (user) {
    return (
      <Link
        href="/auth/account"
        style={{
          color: user.subscription === 'pro' ? '#fbbf24' : '#9fb3ff',
          textDecoration: 'none',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {user.subscription === 'pro' && <span>🌟</span>}
        {user.displayName ?? user.email.split('@')[0]}
      </Link>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Link href="/auth/login" style={{ color: '#9fb3ff', textDecoration: 'none', fontSize: 13 }}>
        登录
      </Link>
      <Link
        href="/auth/register"
        style={{
          color: '#fff',
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 600,
          padding: '5px 14px',
          borderRadius: 8,
          background: '#5b7cff',
        }}
      >
        注册
      </Link>
    </div>
  );
}
