'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/components/AuthProvider';
import { getAccessToken } from '@/lib/authApi';
import {
  addToWatchlist,
  fetchWatchlistStatus,
  isApiError,
  removeFromWatchlist,
  type ApiError,
} from '@/lib/watchlistApi';
import type { WatchlistSummary } from '@sg/shared/schemas/watchlist';

function errorMessage(error: ApiError): string {
  if (error.error === 'entitlement_required') return 'Watchlist 仅对 Pro / Team 开放。';
  if (error.error === 'watchlist_limit_reached') return '已达到当前套餐的 watchlist 上限。';
  if (error.error === 'unauthorized') return '请先登录。';
  return '操作失败，请稍后重试。';
}

export function WatchlistButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [saved, setSaved] = useState(false);
  const [summary, setSummary] = useState<WatchlistSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) {
        setSaved(false);
        setSummary(null);
        return;
      }
      const token = getAccessToken();
      if (!token) return;
      const res = await fetchWatchlistStatus(token, caseId);
      if (cancelled) return;
      if (isApiError(res)) {
        setError(errorMessage(res));
        return;
      }
      setSaved(res.saved);
      setSummary(res.summary);
      setError(null);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [caseId, user]);

  async function handleToggle() {
    const token = getAccessToken();
    if (!user || !token) {
      router.push('/auth/login');
      return;
    }
    setPending(true);
    setError(null);
    const res = saved
      ? await removeFromWatchlist(token, caseId)
      : await addToWatchlist(token, caseId);
    if (isApiError(res)) {
      setError(errorMessage(res));
      if (res.error === 'entitlement_required') router.push('/auth/account');
      setPending(false);
      return;
    }
    setSaved(res.saved);
    setSummary(res.summary);
    setPending(false);
  }

  if (loading) {
    return (
      <button disabled style={buttonStyle('#24304f', '#6b7ca8')}>
        同步中…
      </button>
    );
  }

  if (!user) {
    return (
      <Link
        href="/auth/login"
        style={{ ...buttonStyle('#16213c', '#9fb3ff'), textDecoration: 'none' }}
      >
        登录后保存到 Watchlist
      </Link>
    );
  }

  const gateLocked = !user.entitlements.canUseWatchlist;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {gateLocked ? (
        <Link
          href="/auth/account"
          style={{ ...buttonStyle('#1d2746', '#9fb3ff'), textDecoration: 'none' }}
        >
          升级后解锁 Watchlist
        </Link>
      ) : (
        <button
          onClick={handleToggle}
          disabled={pending}
          style={buttonStyle(saved ? '#1b3d2e' : '#20315e', saved ? '#7dffb3' : '#e8ecff')}
        >
          {pending ? '处理中…' : saved ? '已加入 Watchlist' : '加入 Watchlist'}
        </button>
      )}
      <div style={{ color: '#8a96b0', fontSize: 12 }}>
        {gateLocked
          ? '先去账户页升级，再把关键案例沉淀成自己的研究列表。'
          : summary
            ? `已保存 ${summary.watchlistCount}/${summary.watchlistLimit}，剩余 ${summary.remainingSlots}`
            : '把这个案例保存到你的研究清单。'}
      </div>
      {error ? <div style={{ color: '#fda4af', fontSize: 12 }}>{error}</div> : null}
    </div>
  );
}

function buttonStyle(background: string, color: string) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #2a3658',
    background,
    color,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    minWidth: 168,
  } as const;
}
