'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiResendVerification, apiVerifyEmail, isApiError } from '@/lib/authApi';
import { useAuth } from '@/app/components/AuthProvider';

type VerifyState = 'verifying' | 'success' | 'invalid' | 'missing';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { user } = useAuth();
  const [state, setState] = useState<VerifyState>(token ? 'verifying' : 'missing');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'already'>('idle');
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    void apiVerifyEmail(token).then((res) => {
      setState(isApiError(res) ? 'invalid' : 'success');
    });
  }, [token]);

  async function handleResend() {
    setResendState('sending');
    const res = await apiResendVerification();
    if (isApiError(res)) {
      setResendState('idle');
      return;
    }
    setResendState(res.alreadyVerified ? 'already' : 'sent');
  }

  if (state === 'verifying') {
    return <p style={{ color: '#9fb3ff', fontSize: 14 }}>正在验证邮箱…</p>;
  }

  if (state === 'success') {
    return (
      <p style={noticeStyle('#8fe3b4', 'rgba(52,211,153,0.08)', 'rgba(52,211,153,0.35)')}>
        邮箱验证成功。你可以关闭本页，或{' '}
        <Link href="/" style={{ color: '#5b7cff' }}>
          返回首页
        </Link>
        继续研究。
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={noticeStyle('#f87171', 'rgba(248,113,113,0.1)', 'rgba(248,113,113,0.35)')}>
        {state === 'missing'
          ? '缺少验证令牌。请从注册邮件中的链接进入本页。'
          : '验证链接无效或已过期。'}
      </p>
      {user ? (
        resendState === 'sent' || resendState === 'already' ? (
          <p style={noticeStyle('#8fe3b4', 'rgba(52,211,153,0.08)', 'rgba(52,211,153,0.35)')}>
            {resendState === 'already'
              ? '你的邮箱已经完成验证，无需重复操作。'
              : '新的验证邮件已发送，请查收（含垃圾邮件目录）。'}
          </p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendState === 'sending'}
            style={{
              padding: '12px',
              borderRadius: 10,
              border: 'none',
              background: resendState === 'sending' ? '#2a3658' : '#5b7cff',
              color: resendState === 'sending' ? '#6b7ca8' : '#fff',
              fontWeight: 600,
              fontSize: 15,
              cursor: resendState === 'sending' ? 'not-allowed' : 'pointer',
            }}
          >
            {resendState === 'sending' ? '发送中…' : '重新发送验证邮件'}
          </button>
        )
      ) : (
        <p style={{ color: '#9fb3ff', fontSize: 14, margin: 0 }}>
          <Link href="/auth/login" style={{ color: '#5b7cff' }}>
            登录
          </Link>{' '}
          后可以重新发送验证邮件。
        </p>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
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
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>验证邮箱</h1>
        <p style={{ color: '#9fb3ff', fontSize: 14, margin: '0 0 28px' }}>
          验证后我们才能可靠地向你发送密码重置与账单通知。
        </p>
        <Suspense fallback={null}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </main>
  );
}

const noticeStyle = (
  color: string,
  background: string,
  borderColor: string,
): React.CSSProperties => ({
  color,
  fontSize: 14,
  margin: 0,
  padding: '12px 14px',
  background,
  border: `1px solid ${borderColor}`,
  borderRadius: 10,
  lineHeight: 1.7,
});
