import { z } from 'zod';
import { API_BASE_URL } from './api';
import {
  BUSINESS_MODEL_LABELS,
  COUNTRY_LABELS,
  FAILURE_FACTOR_LEVEL_1_LABELS,
  FAILURE_FACTOR_LEVEL_2_LABELS,
  INDUSTRY_LABELS,
  PRIMARY_FAILURE_REASON_LABELS,
  TIMELINE_EVENT_TYPE_LABELS,
} from '@sg/shared/taxonomy';
import { homeSummarySchema, type HomeSummary } from '@sg/shared/schemas/meta';

const taxonomySchema = z.object({
  industries: z.record(z.string()),
  countries: z.record(z.string()),
  businessModels: z.record(z.string()).optional(),
  primaryFailureReasons: z.record(z.string()).optional(),
  failureFactorLevel1: z.record(z.string()).optional(),
  failureFactorLevel2: z.record(z.string()).optional(),
  timelineEventTypes: z.record(z.string()).optional(),
});

export type TaxonomyLabels = {
  industries: Record<string, string>;
  countries: Record<string, string>;
  businessModels: Record<string, string>;
  primaryFailureReasons: Record<string, string>;
  failureFactorLevel1: Record<string, string>;
  failureFactorLevel2: Record<string, string>;
  timelineEventTypes: Record<string, string>;
};

function taxonomyFallback(): TaxonomyLabels {
  return {
    industries: { ...INDUSTRY_LABELS },
    countries: { ...COUNTRY_LABELS },
    businessModels: { ...BUSINESS_MODEL_LABELS },
    primaryFailureReasons: { ...PRIMARY_FAILURE_REASON_LABELS },
    failureFactorLevel1: { ...FAILURE_FACTOR_LEVEL_1_LABELS },
    failureFactorLevel2: { ...FAILURE_FACTOR_LEVEL_2_LABELS },
    timelineEventTypes: { ...TIMELINE_EVENT_TYPE_LABELS },
  };
}

function normalizeTaxonomy(parsed: z.infer<typeof taxonomySchema>): TaxonomyLabels {
  return {
    industries: parsed.industries,
    countries: parsed.countries,
    businessModels: parsed.businessModels ?? { ...BUSINESS_MODEL_LABELS },
    primaryFailureReasons: parsed.primaryFailureReasons ?? { ...PRIMARY_FAILURE_REASON_LABELS },
    failureFactorLevel1: parsed.failureFactorLevel1 ?? { ...FAILURE_FACTOR_LEVEL_1_LABELS },
    failureFactorLevel2: parsed.failureFactorLevel2 ?? { ...FAILURE_FACTOR_LEVEL_2_LABELS },
    timelineEventTypes: parsed.timelineEventTypes ?? { ...TIMELINE_EVENT_TYPE_LABELS },
  };
}

/** 与 API `/v1/meta/taxonomy` 对齐；失败时用 shared 静态表兜底。 */
export async function fetchTaxonomy(): Promise<TaxonomyLabels> {
  const fb = taxonomyFallback();
  try {
    const res = await fetch(`${API_BASE_URL}/v1/meta/taxonomy`, {
      cache: 'no-store',
    });
    if (!res.ok) return fb;
    const json: unknown = await res.json();
    const parsed = taxonomySchema.safeParse(json);
    return parsed.success ? normalizeTaxonomy(parsed.data) : fb;
  } catch {
    return fb;
  }
}

export async function fetchHomeSummary(): Promise<HomeSummary | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/meta/home-summary`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = homeSummarySchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
