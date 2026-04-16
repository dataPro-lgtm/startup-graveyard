'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  createReportShare,
  deleteReportShare,
  fetchMyReportShares,
  isApiError as isReportShareApiError,
} from '@/lib/reportSharesApi';
import {
  createSavedView,
  deleteSavedView,
  fetchMySavedViews,
  isApiError,
  updateSavedView,
} from '@/lib/savedViewsApi';
import { getAccessToken } from '@/lib/authApi';
import { casesListPath, type CasesSearchParams } from '@/lib/casesApi';
import {
  exportResearchReport,
  exportResearchReportPdf,
  isApiError as isReportApiError,
} from '@/lib/reportExportsApi';
import {
  TEAM_WORKSPACE_REFRESH_EVENT,
  fetchTeamWorkspaceContext,
  isApiError as isTeamWorkspaceApiError,
  notifyTeamWorkspaceUpdated,
  shareSavedViewToWorkspace,
} from '@/lib/teamWorkspaceApi';
import { useAuth } from './AuthProvider';
import type { ReportShareItem } from '@sg/shared/schemas/reportShares';
import type {
  SavedViewFilters,
  SavedViewItem,
  SavedViewSummary,
} from '@sg/shared/schemas/savedViews';
import type { TeamWorkspaceContextResponse } from '@sg/shared/schemas/teamWorkspace';
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
  if (filters.q) parts.push(`Query: ${filters.q}`);
  if (filters.industry) parts.push(industryLabel(filters.industry));
  if (filters.country) parts.push(countryLabel(filters.country));
  if (filters.closedYear) parts.push(`Closed in ${filters.closedYear}`);
  if (filters.businessModelKey) parts.push(businessModelLabel(filters.businessModelKey));
  if (filters.primaryFailureReasonKey) {
    parts.push(primaryFailureReasonLabel(filters.primaryFailureReasonKey));
  }
  if (parts.length === 0) return ['All cases'];
  return parts;
}

function apiErrorMessage(error: { error: string }) {
  if (error.error === 'entitlement_required') return 'Saved views are not unlocked on this plan.';
  if (error.error === 'saved_view_limit_reached') {
    return 'You have reached the saved-view limit for this plan.';
  }
  if (error.error === 'duplicate_saved_view') {
    return 'This filter set already exists in your saved views.';
  }
  return `Could not save the view: ${error.error}`;
}

function upsertItem(items: SavedViewItem[], nextItem: SavedViewItem): SavedViewItem[] {
  return [nextItem, ...items.filter((item) => item.id !== nextItem.id)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function decodeBase64(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer as ArrayBuffer;
}

export function SavedViewsManager({ mode, currentFilters, suggestedName }: SavedViewsManagerProps) {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<SavedViewItem[]>([]);
  const [summary, setSummary] = useState<SavedViewSummary | null>(null);
  const [reportShares, setReportShares] = useState<ReportShareItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [removingShareId, setRemovingShareId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(suggestedName ?? 'All Cases');
  const [teamWorkspaceContext, setTeamWorkspaceContext] =
    useState<TeamWorkspaceContextResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedViews() {
      if (!user) {
        setItems([]);
        setSummary(null);
        setReportShares([]);
        return;
      }
      const token = getAccessToken();
      if (!token) return;
      setFetching(true);
      const [savedViewsRes, shareRes] = await Promise.all([
        fetchMySavedViews(token),
        mode === 'full' ? fetchMyReportShares(token) : Promise.resolve({ items: [] }),
      ]);
      if (cancelled) return;
      if (isApiError(savedViewsRes)) {
        setError(apiErrorMessage(savedViewsRes));
      } else {
        setItems(savedViewsRes.items);
        setSummary(savedViewsRes.summary);
        setError(null);
      }
      if (!isReportShareApiError(shareRes)) {
        setReportShares(shareRes.items);
      }
      setFetching(false);
    }

    void loadSavedViews();
    return () => {
      cancelled = true;
    };
  }, [mode, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceContext() {
      if (!user || mode !== 'full') {
        setTeamWorkspaceContext(null);
        return;
      }
      const token = getAccessToken();
      if (!token) return;
      const res = await fetchTeamWorkspaceContext(token);
      if (cancelled) return;
      if (isTeamWorkspaceApiError(res)) {
        setTeamWorkspaceContext(null);
        return;
      }
      setTeamWorkspaceContext(res);
    }

    void loadWorkspaceContext();
    const onRefresh = () => {
      void loadWorkspaceContext();
    };
    window.addEventListener(TEAM_WORKSPACE_REFRESH_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(TEAM_WORKSPACE_REFRESH_EVENT, onRefresh);
    };
  }, [mode, user]);

  const displaySummary = useMemo(() => {
    if (summary) return summary;
    if (!user) return null;
    return {
      subscription: user.effectiveSubscription,
      billingStatus: user.effectiveBillingStatus,
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
  const shareBySavedViewId = useMemo(
    () => new Map(reportShares.map((item) => [item.savedViewId, item])),
    [reportShares],
  );

  async function handleCreate() {
    if (!user || !currentFilters) return;
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await createSavedView(token, {
      name: name.trim() || suggestedName || 'All Cases',
      filters: currentFilters,
    });
    setSaving(false);
    if (isApiError(res)) {
      setError(apiErrorMessage(res));
      return;
    }
    setItems((prev) => upsertItem(prev, res.item));
    setSummary(res.summary);
    setMessage(
      res.created
        ? 'Current research view saved.'
        : 'This filter set is already in your saved views.',
    );
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
    setMessage('Saved view name updated.');
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
    setReportShares((prev) => prev.filter((item) => item.savedViewId !== savedViewId));
    setSummary(res.summary);
    setMessage('Saved view deleted.');
  }

  async function handleExport(
    exportName: string,
    filters: SavedViewFilters,
    key: string,
    format: 'markdown' | 'pdf',
  ) {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;
    const exportingToken = `${key}:${format}`;
    setExportingKey(exportingToken);
    setError(null);
    setMessage(null);
    const res =
      format === 'markdown'
        ? await exportResearchReport(token, { name: exportName, filters })
        : await exportResearchReportPdf(token, { name: exportName, filters });
    setExportingKey(null);
    if (isReportApiError(res)) {
      setError(apiErrorMessage(res));
      return;
    }
    if (res.mimeType === 'text/markdown') {
      triggerDownload(
        new Blob([res.content], { type: `${res.mimeType};charset=utf-8` }),
        res.filename,
      );
    } else {
      triggerDownload(
        new Blob([decodeBase64(res.contentBase64)], { type: res.mimeType }),
        res.filename,
      );
    }
    setMessage(`Exported ${format === 'pdf' ? 'PDF' : 'Markdown'} brief: ${res.filename}`);
  }

  async function handleShare(savedViewId: string) {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;
    setSharingId(savedViewId);
    setError(null);
    setMessage(null);
    const res = await shareSavedViewToWorkspace(token, savedViewId);
    setSharingId(null);
    if (isTeamWorkspaceApiError(res)) {
      setError(`Could not share the saved view: ${res.error}`);
      return;
    }
    setTeamWorkspaceContext((prev) =>
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
    setMessage(
      res.added
        ? 'Saved view shared to the Team Workspace.'
        : 'This saved view is already in the Team Workspace.',
    );
    notifyTeamWorkspaceUpdated();
  }

  async function handlePublishShare(savedView: SavedViewItem) {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;
    setPublishingId(savedView.id);
    setError(null);
    setMessage(null);
    const res = await createReportShare(token, savedView.id);
    setPublishingId(null);
    if (isReportShareApiError(res)) {
      setError(`Could not publish the brief share: ${res.error}`);
      return;
    }
    setReportShares((prev) =>
      [
        res.item,
        ...prev.filter((item) => item.id !== res.item.id && item.savedViewId !== savedView.id),
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
    setMessage(
      res.created
        ? 'Public brief page created.'
        : 'Public brief page refreshed to match the current saved view.',
    );
  }

  async function handleDeleteShare(shareId: string, savedViewId: string) {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;
    setRemovingShareId(shareId);
    setError(null);
    setMessage(null);
    const res = await deleteReportShare(token, shareId);
    setRemovingShareId(null);
    if (isReportShareApiError(res)) {
      setError(`Could not stop the public share: ${res.error}`);
      return;
    }
    setReportShares((prev) =>
      prev.filter((item) => item.id !== res.shareId && item.savedViewId !== savedViewId),
    );
    setMessage('Public brief share stopped.');
  }

  async function handleCopyShare(shareUrl: string) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage('Share link copied.');
      setError(null);
    } catch {
      setError('Could not copy the link. Open the public brief manually.');
    }
  }

  if (loading) return null;

  return (
    <section
      id={mode === 'full' ? 'saved-views' : undefined}
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
            {mode === 'compact' ? 'Save the current research view' : 'Saved research views'}
          </h2>
          <p style={{ margin: 0, color: '#c8d0e5', lineHeight: 1.7 }}>
            {mode === 'compact'
              ? 'Turn the current filter set into a reusable research entry point for export, sharing, and team workflows.'
              : 'Saved views preserve long-lived research angles so you can return to the same analytical context at any time.'}
          </p>
        </div>
        {displaySummary ? (
          <div style={{ color: '#9fb3ff', fontSize: 13, lineHeight: 1.6 }}>
            <div>
              Saved {displaySummary.savedViewCount}/{displaySummary.savedViewLimit}
            </div>
            <div>Remaining {displaySummary.remainingSlots}</div>
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
              Sign in to save this filter set to your account.
              <div style={{ marginTop: 10 }}>
                <Link href="/auth/login" style={actionLinkStyle}>
                  Sign In to Save
                </Link>
              </div>
            </div>
          ) : !user.entitlements.canUseSavedSearches ? (
            <div style={{ color: '#9fb3ff', fontSize: 14, lineHeight: 1.7 }}>
              Your current plan does not unlock saved views. Upgrade to keep long-lived research
              angles, export briefs, and reuse filters.
              <div style={{ marginTop: 10 }}>
                <Link href="/auth/account" style={actionLinkStyle}>
                  Upgrade Plan
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, color: '#9fb3ff', fontSize: 13 }}>
                View Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Example: Marketplace breakdown sample"
                  style={inputStyle}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={handleCreate} disabled={saving} style={primaryButton(saving)}>
                  {saving ? 'Saving…' : 'Save Current View'}
                </button>
                {user.entitlements.canExportReports ? (
                  <>
                    <button
                      onClick={() =>
                        void handleExport(
                          name.trim() || suggestedName || 'All Cases',
                          currentFilters,
                          'current',
                          'markdown',
                        )
                      }
                      disabled={exportingKey === 'current:markdown'}
                      style={ghostMiniButton}
                    >
                      {exportingKey === 'current:markdown' ? 'Exporting…' : 'Export Markdown Brief'}
                    </button>
                    <button
                      onClick={() =>
                        void handleExport(
                          name.trim() || suggestedName || 'All Cases',
                          currentFilters,
                          'current',
                          'pdf',
                        )
                      }
                      disabled={exportingKey === 'current:pdf'}
                      style={ghostMiniButton}
                    >
                      {exportingKey === 'current:pdf' ? 'Exporting…' : 'Export PDF Brief'}
                    </button>
                  </>
                ) : null}
                <span style={{ color: '#6b7fa8', fontSize: 12 }}>
                  Keeps the current filters, but not temporary pagination state.
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {fetching ? <p style={{ color: '#8a96b0' }}>Syncing saved views…</p> : null}
      {mode === 'full' && teamWorkspaceContext?.workspace ? (
        <p style={{ color: '#8a96b0', fontSize: 13 }}>
          Active Team Workspace: {teamWorkspaceContext.workspace.name}. Any saved view can be shared
          with the team.
        </p>
      ) : null}
      {mode === 'full' && user?.entitlements.canExportReports ? (
        <p style={{ color: '#8a96b0', fontSize: 13 }}>
          Public brief pages and PDF briefs reuse the same report generator. You can share a link
          externally or export a deliverable PDF from the same saved view.
        </p>
      ) : null}
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
            ? 'No saved research views yet. Build one from the homepage filters and keep it for repeated analysis.'
            : 'Sign in to build your own saved-view library.'}
        </div>
      ) : null}

      {previewItems.length > 0 ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {previewItems.map((item) => {
            const href = casesListPath(item.filters as CasesSearchParams);
            const badges = summarizeFilters(item.filters);
            const editing = editingId === item.id;
            const share = shareBySavedViewId.get(item.id) ?? null;
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
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditName('');
                          }}
                          style={ghostMiniButton}
                        >
                          Cancel
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
                    <div>{item.caseCount} cases</div>
                    <div>Updated {new Date(item.updatedAt).toLocaleDateString('en-US')}</div>
                  </div>
                </div>

                {mode === 'full' && share ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid #223253',
                      background: '#10172b',
                      color: '#9fb3ff',
                      fontSize: 12,
                      lineHeight: 1.7,
                    }}
                  >
                    <div>Public brief: {share.shareUrl}</div>
                    <div>
                      Last access:
                      {share.lastAccessedAt
                        ? new Date(share.lastAccessedAt).toLocaleString('en-US')
                        : 'No external visits yet'}
                    </div>
                  </div>
                ) : null}

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
                    Open View
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
                      Rename
                    </button>
                  ) : null}
                  {mode === 'full' ? (
                    <>
                      {user?.entitlements.canExportReports ? (
                        <>
                          <button
                            onClick={() =>
                              void handleExport(item.name, item.filters, item.id, 'markdown')
                            }
                            disabled={exportingKey === `${item.id}:markdown`}
                            style={ghostMiniButton}
                          >
                            {exportingKey === `${item.id}:markdown`
                              ? 'Exporting…'
                              : 'Export Markdown'}
                          </button>
                          <button
                            onClick={() =>
                              void handleExport(item.name, item.filters, item.id, 'pdf')
                            }
                            disabled={exportingKey === `${item.id}:pdf`}
                            style={ghostMiniButton}
                          >
                            {exportingKey === `${item.id}:pdf` ? 'Exporting…' : 'Export PDF'}
                          </button>
                        </>
                      ) : null}
                      {user?.entitlements.canExportReports ? (
                        <>
                          <button
                            onClick={() => void handlePublishShare(item)}
                            disabled={publishingId === item.id}
                            style={ghostMiniButton}
                          >
                            {publishingId === item.id
                              ? 'Publishing…'
                              : share
                                ? 'Refresh Public Brief'
                                : 'Publish Brief Share'}
                          </button>
                          {share ? (
                            <>
                              <button
                                onClick={() => void handleCopyShare(share.shareUrl)}
                                style={ghostMiniButton}
                              >
                                Copy Link
                              </button>
                              <Link href={share.sharePath} style={actionLinkStyle} target="_blank">
                                Preview Brief
                              </Link>
                              <button
                                onClick={() => void handleDeleteShare(share.id, item.id)}
                                disabled={removingShareId === share.id}
                                style={ghostMiniButton}
                              >
                                {removingShareId === share.id ? 'Stopping…' : 'Stop Sharing'}
                              </button>
                            </>
                          ) : null}
                        </>
                      ) : null}
                      {teamWorkspaceContext?.workspace ? (
                        <button
                          onClick={() => void handleShare(item.id)}
                          disabled={sharingId === item.id}
                          style={ghostMiniButton}
                        >
                          {sharingId === item.id ? 'Sharing…' : 'Share to Team'}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {mode === 'full' ? (
                    <button
                      onClick={() => void handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      style={ghostMiniButton}
                    >
                      {deletingId === item.id ? 'Deleting…' : 'Delete'}
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
