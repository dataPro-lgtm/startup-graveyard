import type { Metadata } from 'next';
import { pickSearchParam } from '@/lib/searchParams';
import { loginAdmin } from './actions';

export const metadata: Metadata = { title: 'Admin sign in' };

const REASON_MESSAGE: Record<string, string> = {
  invalid_credentials: '邮箱或密码不正确。',
  admin_access_required: '该账号没有管理后台权限。',
  session_required: '请使用具名管理员账号登录。',
  session_expired: '管理会话已过期或被撤销，请重新登录。',
  signed_out: '管理会话已安全退出。',
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const reason = pickSearchParam((await searchParams).reason);
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background:
          'radial-gradient(circle at 15% 10%, rgba(37,99,235,.22), transparent 34%), linear-gradient(145deg, #07111f 0%, #0b1627 55%, #111827 100%)',
      }}
    >
      <section
        style={{
          width: 'min(100%, 430px)',
          padding: '36px 34px',
          border: '1px solid rgba(148,163,184,.22)',
          borderRadius: 22,
          background: 'rgba(8,18,33,.9)',
          boxShadow: '0 30px 80px rgba(0,0,0,.42)',
        }}
      >
        <p style={{ color: '#60a5fa', letterSpacing: '.16em', fontSize: 12, fontWeight: 700 }}>
          STARTUP GRAVEYARD / CONTROL ROOM
        </p>
        <h1 style={{ margin: '12px 0 8px', fontSize: 32, color: '#f8fafc' }}>具名管理登录</h1>
        <p style={{ margin: '0 0 28px', color: '#94a3b8', lineHeight: 1.65, fontSize: 14 }}>
          权限按 Viewer、Editor、Operator、Owner 分离，所有管理写操作进入审计流水。
        </p>
        {reason && REASON_MESSAGE[reason] ? (
          <p
            role="alert"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: reason === 'signed_out' ? '#0b3b2e' : '#451a24',
              color: reason === 'signed_out' ? '#86efac' : '#fda4af',
              fontSize: 13,
            }}
          >
            {REASON_MESSAGE[reason]}
          </p>
        ) : null}
        <form action={loginAdmin} style={{ display: 'grid', gap: 16, marginTop: 20 }}>
          <label style={{ display: 'grid', gap: 7, color: '#cbd5e1', fontSize: 13 }}>
            管理员邮箱
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              style={{
                padding: '12px 13px',
                border: '1px solid #334155',
                borderRadius: 10,
                background: '#0f1c2e',
                color: '#f8fafc',
                fontSize: 15,
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 7, color: '#cbd5e1', fontSize: 13 }}>
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={{
                padding: '12px 13px',
                border: '1px solid #334155',
                borderRadius: 10,
                background: '#0f1c2e',
                color: '#f8fafc',
                fontSize: 15,
              }}
            />
          </label>
          <button
            type="submit"
            style={{
              marginTop: 4,
              padding: '12px 16px',
              border: 0,
              borderRadius: 10,
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            进入运营控制台
          </button>
        </form>
      </section>
    </main>
  );
}
