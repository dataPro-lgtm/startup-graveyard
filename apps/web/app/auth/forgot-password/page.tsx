'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiForgotPassword, isApiError } from '@/lib/authApi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await apiForgotPassword(email.trim().toLowerCase());
    setSubmitting(false);
    if (isApiError(res)) {
      setError('请求过于频繁或邮箱格式有误，请稍后重试。');
      return;
    }
    setSubmitted(true);
  }

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
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>找回密码</h1>
        <p style={{ color: '#9fb3ff', fontSize: 14, margin: '0 0 28px' }}>
          输入注册邮箱，我们会发送重置链接。想起密码了？{' '}
          <Link href="/auth/login" style={{ color: '#5b7cff' }}>
            返回登录
          </Link>
        </p>

        {submitted ? (
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
            如果该邮箱已注册，我们已发送密码重置邮件。请在 30 分钟内点击邮件中的链接设置新密码；
            若未收到，请检查垃圾邮件目录后再试。
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <span style={{ color: '#9fb3ff' }}>邮箱</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
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
              disabled={submitting || !email}
              style={buttonStyle(submitting || !email)}
            >
              {submitting ? '发送中…' : '发送重置邮件'}
            </button>
          </form>
        )}
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
