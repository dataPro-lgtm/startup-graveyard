'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiResetPassword, isApiError } from '@/lib/authApi';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await apiResetPassword(token, password);
    setSubmitting(false);
    if (isApiError(res)) {
      setError(
        res.error === 'invalid_or_expired_token'
          ? '重置链接无效或已过期，请重新发起找回密码。'
          : '密码重置失败，请确认新密码至少 8 位后重试。',
      );
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/auth/login'), 1800);
  }

  if (!token) {
    return (
      <p style={{ color: '#f87171', fontSize: 14, lineHeight: 1.7 }}>
        缺少重置令牌。请从邮件中的链接进入本页，或{' '}
        <Link href="/auth/forgot-password" style={{ color: '#5b7cff' }}>
          重新发起找回密码
        </Link>
        。
      </p>
    );
  }

  if (done) {
    return (
      <p
        style={{
          color: '#8fe3b4',
          fontSize: 14,
          margin: 0,
          padding: '12px 14px',
          background: 'rgba(52,211,153,0.08)',
          border: '1px solid rgba(52,211,153,0.35)',
          borderRadius: 10,
          lineHeight: 1.7,
        }}
      >
        密码已重置，所有设备会话已退出。正在跳转到登录页…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        <span style={{ color: '#9fb3ff' }}>新密码（至少 8 位）</span>
        <input
          type="password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="••••••••"
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        <span style={{ color: '#9fb3ff' }}>确认新密码</span>
        <input
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
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
        disabled={submitting || !password || !confirmPassword}
        style={buttonStyle(submitting || !password || !confirmPassword)}
      >
        {submitting ? '重置中…' : '重置密码'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>设置新密码</h1>
        <p style={{ color: '#9fb3ff', fontSize: 14, margin: '0 0 28px' }}>
          重置成功后需要用新密码重新登录所有设备。
        </p>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
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
