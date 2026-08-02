import { apiFetch } from './api';
import {
  exportResearchReportPdfResponseSchema,
  exportResearchReportResponseSchema,
} from '@sg/shared/schemas/reportExports';
import type { SavedViewFilters } from '@sg/shared/schemas/savedViews';

type ApiError = { error: string; details?: unknown };

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function exportResearchReport(input: { name: string; filters: SavedViewFilters }) {
  const res = await apiFetch('/v1/reports/exports/markdown', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return exportResearchReportResponseSchema.parse(json);
}

export async function exportResearchReportPdf(input: { name: string; filters: SavedViewFilters }) {
  const res = await apiFetch('/v1/reports/exports/pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return exportResearchReportPdfResponseSchema.parse(json);
}
