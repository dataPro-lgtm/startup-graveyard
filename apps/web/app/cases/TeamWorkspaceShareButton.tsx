'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/components/AuthProvider';
import { getAccessToken } from '@/lib/authApi';
import {
  TEAM_WORKSPACE_REFRESH_EVENT,
  fetchTeamWorkspaceContext,
  isApiError,
  notifyTeamWorkspaceUpdated,
  shareCaseToWorkspace,
} from '@/lib/teamWorkspaceApi';
import type { TeamWorkspaceContextResponse } from '@sg/shared/schemas/teamWorkspace';

function apiErrorMessage(error: { error: string }) {
  if (error.error === 'workspace_not_found') return '请先创建或接受一个团队工作区。';
  if (error.error === 'case_not_found') return '当前案例暂时还不能被共享。';
  return `共享失败：${error.error}`;
}

export function TeamWorkspaceShareButton({ caseId }: { caseId: string }) {
  const { user, loading } = useAuth();
  const [context, setContext] = useState<TeamWorkspaceContextResponse | null>(null);
  const [fetching, setFetching] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      if (!user) {
        setContext(null);
        return;
      }
      const token = getAccessToken();
      if (!token) return;
      setFetching(true);
      const res = await fetchTeamWorkspaceContext(token);
      if (cancelled) return;
      if (isApiError(res)) {
        setError(apiErrorMessage(res));
      } else {
        setContext(res);
        setError(null);
      }
      setFetching(false);
    }

    void loadContext();
    const onRefresh = () => {
      void loadContext();
    };
    window.addEventListener(TEAM_WORKSPACE_REFRESH_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(TEAM_WORKSPACE_REFRESH_EVENT, onRefresh);
    };
  }, [user]);

  async function handleShare() {
    const token = getAccessToken();
    if (!token) return;
    setSharing(true);
    setMessage(null);
    setError(null);
    const res = await shareCaseToWorkspace(token, caseId);
    setSharing(false);
    if (isApiError(res)) {
      setError(apiErrorMessage(res));
      return;
    }
    setContext((prev) =>
      prev
        ? {
            ...prev,
            hasWorkspace: true,
            workspace: res.workspace,
          }
        : {
            canCreateWorkspace: false,
            hasWorkspace: true,
            pendingInvites: [],
            workspace: res.workspace,
          },
    );
    setMessage(res.added ? '已共享到团队工作区。' : '这个案例已经在团队工作区里。');
    notifyTeamWorkspaceUpdated();
  }

  if (loading || !user) return null;

  const workspace = context?.workspace ?? null;

  if (fetching) {
    return (
      <button disabled style={buttonStyle('#1d2746', '#7e8fb3')}>
        同步团队…
      </button>
    );
  }

  if (!workspace) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link
          href="/auth/account"
          style={{
            ...buttonStyle('#152238', '#9fb3ff'),
            textDecoration: 'none',
          }}
        >
          {context?.pendingInvites.length ? '去接受团队邀请' : '开启团队协作'}
        </Link>
        <div style={{ color: '#8a96b0', fontSize: 12 }}>
          {context?.pendingInvites.length
            ? '你有待接受的团队邀请。'
            : '创建或加入工作区后，可以把案例共享给团队。'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={() => void handleShare()}
        disabled={sharing}
        style={buttonStyle('#152238', '#9fb3ff')}
      >
        {sharing ? '共享中…' : `共享到 ${workspace.name}`}
      </button>
      <div style={{ color: '#8a96b0', fontSize: 12 }}>
        {message ?? '把这个案例同步到团队工作区。'}
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
