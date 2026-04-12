'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';

export function UserNav() {
  const { user, loading } = useAuth();
  if (loading) return null;

  if (user) {
    const effectivePlan = user.effectiveSubscription;
    return (
      <Link
        href="/auth/account"
        style={{
          color:
            effectivePlan === 'pro' ? '#fbbf24' : effectivePlan === 'team' ? '#7dd3fc' : '#9fb3ff',
          textDecoration: 'none',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {effectivePlan === 'pro' && <span>PRO</span>}
        {effectivePlan === 'team' && <span>TEAM</span>}
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
