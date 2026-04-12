import type { Pool, QueryResultRow } from 'pg';
import {
  normalizeFailureFactorLevel1Key,
  normalizeFailureFactorLevel2Key,
  normalizeFreeformTaxonomyKey,
  normalizePrimaryFailureReasonKey,
  normalizeTimelineEventType,
} from '@sg/shared/taxonomy';

type CaseTaxonomyRow = QueryResultRow & {
  id: string;
  status: string;
  industry_key: string;
  business_model_key: string | null;
  primary_failure_reason_key: string | null;
};

type FailureFactorTaxonomyRow = QueryResultRow & {
  id: string;
  case_id: string;
  level_1_key: string;
  level_2_key: string;
  level_3_key: string | null;
};

type TimelineTaxonomyRow = QueryResultRow & {
  id: string;
  case_id: string;
  event_type: string;
};

export type CaseTaxonomyPatch = {
  industryKey: string;
  businessModelKey: string | null;
  primaryFailureReasonKey: string | null;
};

export type FailureFactorTaxonomyPatch = {
  level1Key: string;
  level2Key: string;
  level3Key: string | null;
};

export type TimelineTaxonomyPatch = {
  eventType: string;
};

export type TaxonomyBackfillResult = {
  scannedCases: number;
  casesUpdated: number;
  factorsUpdated: number;
  timelineUpdated: number;
  affectedCaseIds: string[];
  publishedCaseIds: string[];
};

function normalizeOptionalKey(
  value: string | null,
  normalizer: (raw: string) => string | undefined,
): string | null {
  if (!value) return null;
  return normalizer(value) ?? normalizeFreeformTaxonomyKey(value) ?? value;
}

function changed<T extends Record<string, string | null>>(current: T, next: T): Partial<T> | null {
  const patch: Partial<T> = {};
  let hasChange = false;
  for (const key of Object.keys(next) as Array<keyof T>) {
    if (current[key] !== next[key]) {
      patch[key] = next[key];
      hasChange = true;
    }
  }
  return hasChange ? patch : null;
}

export function normalizeCaseTaxonomyRow(row: {
  industryKey: string;
  businessModelKey: string | null;
  primaryFailureReasonKey: string | null;
}): CaseTaxonomyPatch {
  return {
    industryKey: normalizeFreeformTaxonomyKey(row.industryKey),
    businessModelKey: row.businessModelKey
      ? normalizeFreeformTaxonomyKey(row.businessModelKey)
      : null,
    primaryFailureReasonKey: normalizeOptionalKey(
      row.primaryFailureReasonKey,
      normalizePrimaryFailureReasonKey,
    ),
  };
}

export function diffCaseTaxonomyRow(row: {
  industryKey: string;
  businessModelKey: string | null;
  primaryFailureReasonKey: string | null;
}): Partial<CaseTaxonomyPatch> | null {
  return changed(
    row,
    normalizeCaseTaxonomyRow({
      industryKey: row.industryKey,
      businessModelKey: row.businessModelKey,
      primaryFailureReasonKey: row.primaryFailureReasonKey,
    }),
  );
}

export function normalizeFailureFactorTaxonomyRow(row: {
  level1Key: string;
  level2Key: string;
  level3Key: string | null;
}): FailureFactorTaxonomyPatch {
  return {
    level1Key:
      normalizeFailureFactorLevel1Key(row.level1Key) ?? normalizeFreeformTaxonomyKey(row.level1Key),
    level2Key:
      normalizeFailureFactorLevel2Key(row.level2Key) ?? normalizeFreeformTaxonomyKey(row.level2Key),
    level3Key: normalizeOptionalKey(row.level3Key, normalizeFailureFactorLevel2Key),
  };
}

export function diffFailureFactorTaxonomyRow(row: {
  level1Key: string;
  level2Key: string;
  level3Key: string | null;
}): Partial<FailureFactorTaxonomyPatch> | null {
  return changed(
    row,
    normalizeFailureFactorTaxonomyRow({
      level1Key: row.level1Key,
      level2Key: row.level2Key,
      level3Key: row.level3Key,
    }),
  );
}

export function normalizeTimelineTaxonomyRow(row: { eventType: string }): TimelineTaxonomyPatch {
  return {
    eventType:
      normalizeTimelineEventType(row.eventType) ?? normalizeFreeformTaxonomyKey(row.eventType),
  };
}

export function diffTimelineTaxonomyRow(row: {
  eventType: string;
}): Partial<TimelineTaxonomyPatch> | null {
  return changed(row, normalizeTimelineTaxonomyRow(row));
}

export async function backfillCaseTaxonomy(
  pool: Pool,
  limit: number,
): Promise<TaxonomyBackfillResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const caseRows = await client.query<CaseTaxonomyRow>(
      `
      SELECT id, status, industry_key, business_model_key, primary_failure_reason_key
      FROM cases
      ORDER BY updated_at DESC, id DESC
      LIMIT $1
      `,
      [limit],
    );
    const caseIds = caseRows.rows.map((row) => row.id);
    if (caseIds.length === 0) {
      await client.query('COMMIT');
      return {
        scannedCases: 0,
        casesUpdated: 0,
        factorsUpdated: 0,
        timelineUpdated: 0,
        affectedCaseIds: [],
        publishedCaseIds: [],
      };
    }

    const factorRows = await client.query<FailureFactorTaxonomyRow>(
      `
      SELECT id, case_id, level_1_key, level_2_key, level_3_key
      FROM failure_factors
      WHERE case_id = ANY($1::uuid[])
      `,
      [caseIds],
    );
    const timelineRows = await client.query<TimelineTaxonomyRow>(
      `
      SELECT id, case_id, event_type
      FROM timeline_events
      WHERE case_id = ANY($1::uuid[])
      `,
      [caseIds],
    );

    let casesUpdated = 0;
    let factorsUpdated = 0;
    let timelineUpdated = 0;
    const affectedCaseIds = new Set<string>();
    const publishedCaseIds = new Set<string>();
    const publishedLookup = new Map(
      caseRows.rows.map((row) => [row.id, row.status === 'published']),
    );

    for (const row of caseRows.rows) {
      const patch = diffCaseTaxonomyRow({
        industryKey: row.industry_key,
        businessModelKey: row.business_model_key,
        primaryFailureReasonKey: row.primary_failure_reason_key,
      });
      if (!patch) continue;
      await client.query(
        `
        UPDATE cases
        SET industry_key = $2,
            business_model_key = $3,
            primary_failure_reason_key = $4,
            updated_at = NOW()
        WHERE id = $1
        `,
        [
          row.id,
          patch.industryKey ?? row.industry_key,
          patch.businessModelKey ?? row.business_model_key,
          patch.primaryFailureReasonKey ?? row.primary_failure_reason_key,
        ],
      );
      casesUpdated++;
      affectedCaseIds.add(row.id);
      if (row.status === 'published') publishedCaseIds.add(row.id);
    }

    for (const row of factorRows.rows) {
      const patch = diffFailureFactorTaxonomyRow({
        level1Key: row.level_1_key,
        level2Key: row.level_2_key,
        level3Key: row.level_3_key,
      });
      if (!patch) continue;
      await client.query(
        `
        UPDATE failure_factors
        SET level_1_key = $2,
            level_2_key = $3,
            level_3_key = $4
        WHERE id = $1
        `,
        [
          row.id,
          patch.level1Key ?? row.level_1_key,
          patch.level2Key ?? row.level_2_key,
          patch.level3Key ?? row.level_3_key,
        ],
      );
      factorsUpdated++;
      affectedCaseIds.add(row.case_id);
      if (publishedLookup.get(row.case_id)) publishedCaseIds.add(row.case_id);
    }

    for (const row of timelineRows.rows) {
      const patch = diffTimelineTaxonomyRow({
        eventType: row.event_type,
      });
      if (!patch) continue;
      await client.query(
        `
        UPDATE timeline_events
        SET event_type = $2
        WHERE id = $1
        `,
        [row.id, patch.eventType ?? row.event_type],
      );
      timelineUpdated++;
      affectedCaseIds.add(row.case_id);
      if (publishedLookup.get(row.case_id)) publishedCaseIds.add(row.case_id);
    }

    await client.query('COMMIT');
    return {
      scannedCases: caseRows.rows.length,
      casesUpdated,
      factorsUpdated,
      timelineUpdated,
      affectedCaseIds: [...affectedCaseIds],
      publishedCaseIds: [...publishedCaseIds],
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}
