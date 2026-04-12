'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  createSavedView,
  deleteSavedView,
  fetchMySavedViews,
  isApiError,
  updateSavedView,
} from '@/lib/savedViewsApi';
import { getAccessToken } from '@/lib/authApi';
import { casesListPath, type CasesSearchParams } from '@/lib/casesApi';
import { useAuth } from './AuthProvider';
import type {
  SavedViewFilters,
  SavedViewItem,
  SavedViewSummary,
} from '@sg/shared/schemas/savedViews';
import {
  businessModelLabel,
  countryLabel,
  industryLabel,
  primaryFailureReasonLabel,
} from '@sg/shared/taxonomy';

type SavedViewsManagerProps = {
  mode: 'compact' | 'full';
  currentFilters?: SavedViewFilters;
  suggestedName?: string;
};

function summarizeFilters(filters: SavedViewFilters): string[] {
  const parts: string[] = [];
  if (filters.q) parts.push(`关键词：${filters.q}`);
  if (filters.industry) parts.push(industryLabel(filters.industry));
  if (filters.country) parts.push(countryLabel(filters.country));
  if (filters.closedYear) parts.push(`${filters.closedYear} 关闭`);
  if (filters.businessModelKey) parts.push(businessModelLabel(filters.businessModelKey));
  if (filters.primaryFailureReasonKey) {
    parts.push(primaryFailureReasonLabel(filters.primaryFailureReasonKey));
  }
  if (parts.length === 0) return ['全部案例'];
  return parts;
}

function apiErrorMessage(error: { error: string }) {
  if (error.error === 'entitlement_required') return '当前套餐未解锁保存视图。';
  if (error.error === 'saved_view_limit_reached') return '已达到当前套餐的保存视图上限。';
  if (error.error === 'duplicate_saved_view') return '同一组筛选已存在于你的 Saved Views 中。';
  return `保存视图失败：${error.error}`;
}

function upsertItem(items: SavedViewItem[], nextItem: SavedViewItem): SavedViewItem[] {
  return [nextItem, ...items.filter((item) => item.id !== nextItem.id)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function SavedViewsManager({ mode, currentFilters, suggestedName }: SavedViewsManagerProps) {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<SavedViewItem[]>([]);
  const [summary, setSummary] = useState<SavedViewSummary | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(suggestedName ?? '全部案例');

  useEffect(() => {
    let cancelled = false;

    async function loadSavedViews() {
      if (!user) {
        setItems([]);
        setSummary(null);
        return;
      }
      const token = getAccessToken();
      if (!token) return;
      setFetching(true);
      const res = await fetchMySavedViews(token);
      if (cancelled) return;
      if (isApiError(res)) {
        setError(apiErrorMessage(res));
      } else {
        setItems(res.items);
        setSummary(res.summary);
        setError(null);
      }
      setFetching(false);
    }

    void loadSavedViews();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const displaySummary = useMemo(() => {
    if (summary) return summary;
    if (!user) return null;
    return {
      subscription: user.subscription,
      billingStatus: user.billingStatus,
      savedViewCount: items.length,
      savedViewLimit: user.entitlements.savedSearchLimit,
      remainingSlots: Math.max(0, user.entitlements.savedSearchLimit - items.length),
      canUseSavedViews: user.entitlements.canUseSavedSearches,
      canAddMore:
        user.entitlements.canUseSavedSearches && items.length < user.entitlements.savedSearchLimit,
      requiredTier: user.entitlements.canUseSavedSearches ? null : 'pro',
    } satisfies SavedViewSummary;
  }, [summary, user, items.length]);

  const previewItems = mode === 'compact' ? items.slice(0, 4) : items;
  const canSaveCurrent = currentFilters !== undefined;

  async function handleCreate() {
    if (!user || !currentFilters) return;
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await createSavedView(token, {
      name: name.trim() || suggestedName || '全部案例',
      filters: currentFilters,
    });
    setSaving(false);
    if (isApiError(res)) {
      setError(apiErrorMessage(res));
      return;
    }
    setItems((prev) => upsertItem(prev, res.item));
    setSummary(res.summary);
    setMessage(res.created ? '当前视图已保存。' : '这组筛选已经在你的 Saved Views 中。');
  }

  async function handleRename(savedViewId: string) {
    if (!user || !editName.trim()) return;
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    const res = await updateSavedView(token, savedViewId, { name: editName.trim() });
    setSaving(false);
    if (isApiError(res)) {
      setError(apiErrorMessage(res));
      return;
    }
    setItems((prev) => upsertItem(prev, res.item));
    setSummary(res.summary);
    setEditingId(null);
    setMessage('Saved view 名称已更新。');
  }

  async function handleDelete(savedViewId: string) {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;
    setDeletingId(savedViewId);
    setError(null);
    const res = await deleteSavedView(token, savedViewId);
    setDeletingId(null);
    if (isApiError(res)) {
      setError(apiErrorMessage(res));
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== savedViewId));
    setSummary(res.summary);
    setMessage('Saved view 已删除。');
  }

  if (loading) return null;

  return (
    <section
      style={{
        background: '#10172b',
        border: '1px solid #1d2746',
        borderRadius: 18,
        padding: mode === 'compact' ? '18px 20px' : '22px 24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'start',
          marginBottom: 14,
        }}
      >
        <div>
          <p style={{ margin: '0 0 6px', color: '#9fb3ff', fontSize: 12, letterSpacing: 1.2 }}>
            SAVED VIEWS
          </p>
          <h2 style={{ margin: '0 0 8px', fontSize: mode === 'compact' ? 20 : 22 }}>
            {mode === 'compact' ? '保存当前研究视图' : '已保存研究视图'}
          </h2>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7 }}>
            {mode === 'compact'
              ? '把当前筛选沉淀成可重复访问的研究入口。后续导出、分享和团队协作都会复用这层资产。'
              : '这些 Saved Views 是你沉淀出来的长期研究入口，可以直接回到相同筛选上下文。'}
          </p>
        </div>
        {displaySummary ? (
          <div style={{ color: '#9fb3ff', fontSize: 13, lineHeight: 1.6 }}>
            <div>
              已保存 {displaySummary.savedViewCount}/{displaySummary.savedViewLimit}
            </div>
            <div>剩余 {displaySummary.remainingSlots}</div>
          </div>
        ) : null}
      </div>

      {mode === 'compact' && canSaveCurrent ? (
        <div
          style={{
            border: '1px solid #223253',
            borderRadius: 14,
            background: '#0d1428',
            padding: '16px 16px',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {summarizeFilters(currentFilters).map((item) => (
              <span
                key={item}
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  color: '#9fb3ff',
                  border: '1px solid #2a3658',
                }}
              >
                {item}
              </span>
            ))}
          </div>
          {!user ? (
            <div style={{ color: '#9fb3ff', fontSize: 14, lineHeight: 1.7 }}>
              登录后可以把这组筛选保存到账户里。
              <div style={{ marginTop: 10 }}>
                <Link href="/auth/login" style={actionLinkStyle}>
                  登录后保存
                </Link>
              </div>
            </div>
          ) : !user.entitlements.canUseSavedSearches ? (
            <div style={{ color: '#9fb3ff', fontSize: 14, lineHeight: 1.7 }}>
              当前套餐还未解锁 Saved Views。升级后可长期保存研究视角、导出报告并复用筛选。
              <div style={{ marginTop: 10 }}>
                <Link href="/auth/account" style={actionLinkStyle}>
                  去升级套餐
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, color: '#9fb3ff', fontSize: 13 }}>
                视图名称
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：Marketplace 失速样本"
                  style={inputStyle}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={handleCreate} disabled={saving} style={primaryButton(saving)}>
                  {saving ? '保存中…' : '保存当前视图'}
                </button>
                <span style={{ color: '#6b7fa8', fontSize: 12 }}>
                  会保留当前筛选，不含分页和临时浏览位置。
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {fetching ? <p style={{ color: '#8a96b0' }}>正在同步 Saved Views…</p> : null}
      {message ? <p style={{ color: '#7dffb3' }}>{message}</p> : null}
      {error ? <p style={{ color: '#fda4af' }}>{error}</p> : null}

      {!fetching && !error && previewItems.length === 0 ? (
        <div
          style={{
            borderRadius: 14,
            border: '1px dashed #2a3658',
            background: '#0d1428',
            padding: '18px 18px',
            color: '#9fb3ff',
          }}
        >
          {user
            ? '还没有保存过研究视图。先在首页筛选出一组你会反复查看的案例，再把它存下来。'
            : '登录后可以建立自己的 Saved Views 列表。'}
        </div>
      ) : null}

      {previewItems.length > 0 ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {previewItems.map((item) => {
            const href = casesListPath(item.filters as CasesSearchParams);
            const badges = summarizeFilters(item.filters);
            const editing = editingId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  border: '1px solid #1d2746',
                  borderRadius: 14,
                  padding: '16px 18px',
                  background: '#0d1428',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {editing ? (
                      <div
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
                      >
                        <input
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          style={{ ...inputStyle, maxWidth: 320 }}
                        />
                        <button
                          onClick={() => void handleRename(item.id)}
                          disabled={saving}
                          style={miniButton}
                        >
                          保存
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditName('');
                          }}
                          style={ghostMiniButton}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <Link
                        href={href}
                        style={{
                          color: '#9fb3ff',
                          fontSize: 18,
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        {item.name}
                      </Link>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {badges.map((badge) => (
                        <span
                          key={`${item.id}-${badge}`}
                          style={{
                            padding: '4px 9px',
                            borderRadius: 999,
                            fontSize: 12,
                            color: '#9fb3ff',
                            border: '1px solid #24345a',
                          }}
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ color: '#6b7ca8', fontSize: 12, lineHeight: 1.6 }}>
                    <div>{item.caseCount} 个案例</div>
                    <div>更新于 {new Date(item.updatedAt).toLocaleDateString('zh-CN')}</div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginTop: 14,
                  }}
                >
                  <Link href={href} style={actionLinkStyle}>
                    打开视图
                  </Link>
                  {mode === 'full' && user?.entitlements.canUseSavedSearches ? (
                    <button
                      onClick={() => {
                        setEditingId(item.id);
                        setEditName(item.name);
                        setMessage(null);
                        setError(null);
                      }}
                      style={ghostMiniButton}
                    >
                      重命名
                    </button>
                  ) : null}
                  {mode === 'full' ? (
                    <button
                      onClick={() => void handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      style={ghostMiniButton}
                    >
                      {deletingId === item.id ? '删除中…' : '删除'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

const inputStyle: CSSProperties = {
  borderRadius: 10,
  border: '1px solid #243255',
  background: '#0b1020',
  color: '#f5f7fb',
  padding: '10px 12px',
  fontSize: 14,
};

function primaryButton(disabled = false): CSSProperties {
  return {
    border: 0,
    borderRadius: 10,
    background: disabled ? '#243255' : '#5b7cff',
    color: '#fff',
    padding: '10px 14px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const miniButton: CSSProperties = {
  border: 0,
  borderRadius: 9,
  background: '#5b7cff',
  color: '#fff',
  padding: '8px 12px',
  fontWeight: 700,
  cursor: 'pointer',
};

const ghostMiniButton: CSSProperties = {
  border: '1px solid #2a3658',
  borderRadius: 9,
  background: 'transparent',
  color: '#9fb3ff',
  padding: '8px 12px',
  fontWeight: 600,
  cursor: 'pointer',
};

const actionLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '9px 13px',
  borderRadius: 10,
  background: '#152238',
  color: '#f5f7fb',
  textDecoration: 'none',
  fontWeight: 700,
};
