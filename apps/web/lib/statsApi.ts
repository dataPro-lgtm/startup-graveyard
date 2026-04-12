import { API_BASE_URL } from './api';
import {
  adminStatsResponseSchema,
  type AdminStatsResponse as AdminStats,
} from '@sg/shared/schemas/adminStats';

export type { AdminStats };

export async function fetchAdminStats(adminKey: string): Promise<AdminStats | null> {
  const url = `${API_BASE_URL}/v1/admin/stats`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Admin-Key': adminKey },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const parsed = adminStatsResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
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
