'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/components/AuthProvider';

export default function LoginPage() {
  const { login, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const err = await login(email.trim().toLowerCase(), password);
    if (err) {
      setError(err);
      setSubmitting(false);
    } else {
      router.push('/');
    }
  }

  if (loading) return null;

  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#10172b',
          border: '1px solid #1d2746',
          borderRadius: 20,
          padding: '40px 36px',
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>登录</h1>
        <p style={{ color: '#9fb3ff', fontSize: 14, margin: '0 0 28px' }}>
          没有账号？{' '}
          <Link href="/auth/register" style={{ color: '#5b7cff' }}>
            免费注册
          </Link>
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ color: '#9fb3ff' }}>邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ color: '#9fb3ff' }}>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={inputStyle}
            />
          </label>

          {error && (
            <p
              style={{
                color: '#f87171',
                fontSize: 13,
                margin: 0,
                padding: '8px 12px',
                background: 'rgba(248,113,113,0.1)',
                borderRadius: 8,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            style={buttonStyle(submitting || !email || !password)}
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid #2a3658',
  background: '#0b1020',
  color: '#f5f7fb',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
};

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '12px',
  borderRadius: 10,
  border: 'none',
  background: disabled ? '#2a3658' : '#5b7cff',
  color: disabled ? '#6b7ca8' : '#fff',
  fontWeight: 600,
  fontSize: 15,
  cursor: disabled ? 'not-allowed' : 'pointer',
  marginTop: 4,
  transition: 'background 0.2s',
});
