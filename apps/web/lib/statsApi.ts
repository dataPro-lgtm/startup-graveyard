import { API_BASE_URL } from './api';

export interface AdminStats {
  totalPublished: number;
  totalFundingUsd: number;
  totalDraft: number;
  avgFundingUsd: number;
  byIndustry: Array<{ industry: string; count: number; totalFunding: number }>;
  byCountry: Array<{ country: string; count: number }>;
  byYear: Array<{ year: number; count: number }>;
  byFailureReason: Array<{ reason: string; count: number }>;
  recentlyAdded: Array<{ id: string; slug: string; companyName: string; createdAt: string }>;
  pendingReviews: number;
  ingestionStats: { pending: number; running: number; failed: number; completed: number };
}

export async function fetchAdminStats(adminKey: string): Promise<AdminStats | null> {
  const url = `${API_BASE_URL}/v1/admin/stats`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Admin-Key': adminKey },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as AdminStats;
  } catch {
    return null;
  }
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
