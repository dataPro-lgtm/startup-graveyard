'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  apiRevokeOtherSessions,
  apiRevokeSession,
  apiSessions,
  isApiError,
  type UserSession,
} from '@/lib/authApi';
import { useAuth } from './AuthProvider';

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return '未知设备';
  const browser = userAgent.includes('Edg/')
    ? 'Edge'
    : userAgent.includes('Chrome/')
      ? 'Chrome'
      : userAgent.includes('Firefox/')
        ? 'Firefox'
        : userAgent.includes('Safari/')
          ? 'Safari'
          : '浏览器';
  const system = userAgent.includes('Mac OS X')
    ? 'macOS'
    : userAgent.includes('Windows')
      ? 'Windows'
      : userAgent.includes('Android')
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : userAgent.includes('Linux')
            ? 'Linux'
            : '未知系统';
  return `${browser} · ${system}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionManager() {
  const { logout } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiSessions().then((result) => {
      if (!active) return;
      if (isApiError(result)) {
        setError(`加载设备会话失败：${result.error}`);
      } else {
        setSessions(result.items);
        setError(null);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function revokeSession(session: UserSession) {
    setBusyId(session.id);
    setMessage(null);
    setError(null);
    const result = await apiRevokeSession(session.id);
    if (isApiError(result)) {
      setError(`设备退出失败：${result.error}`);
      setBusyId(null);
      return;
    }
    if (result.currentSessionRevoked) {
      await logout();
      router.replace('/auth/login');
      return;
    }
    setSessions((items) => items.filter((item) => item.id !== session.id));
    setMessage('该设备会话已撤销。');
    setBusyId(null);
  }

  async function revokeOthers() {
    setBusyId('others');
    setMessage(null);
    setError(null);
    const result = await apiRevokeOtherSessions();
    if (isApiError(result)) {
      setError(`批量退出失败：${result.error}`);
    } else {
      setSessions((items) => items.filter((item) => item.current));
      setMessage(`已退出 ${result.revokedCount} 个其他设备。`);
    }
    setBusyId(null);
  }

  const otherSessionCount = sessions.filter((session) => !session.current).length;

  return (
    <section
      style={{
        background: 'linear-gradient(135deg, #10172b 0%, #111d2d 100%)',
        border: '1px solid #244057',
        borderRadius: 18,
        padding: '22px 24px',
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p style={{ margin: '0 0 6px', color: '#7dd3fc', fontSize: 12, letterSpacing: 1.2 }}>
            ACCOUNT SECURITY
          </p>
          <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>登录设备与会话</h2>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7 }}>
            最多保留 10 个活跃设备。撤销后，该设备的访问与刷新凭据会立即失效。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void revokeOthers()}
          disabled={otherSessionCount === 0 || busyId !== null}
          style={{
            border: '1px solid #35556f',
            background: otherSessionCount === 0 ? '#15202d' : '#142c3d',
            color: otherSessionCount === 0 ? '#65758b' : '#a8dcf8',
            borderRadius: 10,
            padding: '10px 14px',
            cursor: otherSessionCount === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {busyId === 'others' ? '正在退出…' : `退出其他设备 (${otherSessionCount})`}
        </button>
      </div>

      {loading ? <p style={{ color: '#8a96b0', marginTop: 18 }}>正在读取活跃会话…</p> : null}
      {error ? <p style={{ color: '#fda4af', marginTop: 14 }}>{error}</p> : null}
      {message ? <p style={{ color: '#9ef0c2', marginTop: 14 }}>{message}</p> : null}

      {!loading ? (
        <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
          {sessions.map((session) => (
            <article
              key={session.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
                border: session.current ? '1px solid #28705e' : '1px solid #24334c',
                background: session.current ? '#10251f' : '#0d1422',
                borderRadius: 13,
                padding: '14px 16px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ color: '#edf5ff' }}>{deviceLabel(session.userAgent)}</strong>
                  {session.current ? (
                    <span
                      style={{
                        color: '#9ef0c2',
                        background: '#17372d',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 11,
                      }}
                    >
                      当前设备
                    </span>
                  ) : null}
                </div>
                <div style={{ color: '#8fa1ba', fontSize: 12, lineHeight: 1.7, marginTop: 4 }}>
                  IP {session.ipAddress ?? '未知'} · 最近活跃 {formatDate(session.lastSeenAt)} ·
                  首次登录 {formatDate(session.createdAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void revokeSession(session)}
                disabled={busyId !== null}
                style={{
                  border: '1px solid #5b3340',
                  background: '#28151c',
                  color: '#fbc5cf',
                  borderRadius: 9,
                  padding: '8px 12px',
                  cursor: busyId === null ? 'pointer' : 'not-allowed',
                }}
              >
                {busyId === session.id
                  ? '正在退出…'
                  : session.current
                    ? '退出当前设备'
                    : '退出该设备'}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
