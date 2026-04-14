import { API_BASE_URL } from './api';
import {
  exportResearchReportPdfResponseSchema,
  exportResearchReportResponseSchema,
} from '@sg/shared/schemas/reportExports';
import type { SavedViewFilters } from '@sg/shared/schemas/savedViews';

type ApiError = { error: string; details?: unknown };

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function exportResearchReport(
  token: string,
  input: { name: string; filters: SavedViewFilters },
) {
  const res = await fetch(`${API_BASE_URL}/v1/reports/exports/markdown`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return exportResearchReportResponseSchema.parse(json);
}

export async function exportResearchReportPdf(
  token: string,
  input: { name: string; filters: SavedViewFilters },
) {
  const res = await fetch(`${API_BASE_URL}/v1/reports/exports/pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return exportResearchReportPdfResponseSchema.parse(json);
}
