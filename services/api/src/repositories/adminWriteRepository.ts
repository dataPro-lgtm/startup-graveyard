import type { Pool } from 'pg';
import type { CreateDraftCaseBody } from '../schemas/adminCases.js';
import { withTransaction } from '../db/withTransaction.js';
import type { MockCasesRepository } from './casesRepository.js';
import type { MockReviewsRepository } from './reviewsRepository.js';

export type CreateDraftCaseResult =
  | { ok: true; caseId: string; reviewId: string }
  | { ok: false; error: 'duplicate_slug' };

export interface AdminWriteRepository {
  createDraftCaseWithReview(
    input: CreateDraftCaseBody,
  ): Promise<CreateDraftCaseResult>;
}

export class PgAdminWriteRepository implements AdminWriteRepository {
  constructor(private readonly pool: Pool) {}

  async createDraftCaseWithReview(
    input: CreateDraftCaseBody,
  ): Promise<CreateDraftCaseResult> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const ins = await client.query<{ id: string }>(
          `
          INSERT INTO cases (
            slug, company_name, summary, country_code, industry_key,
            business_model_key, founded_year, closed_year, total_funding_usd,
            primary_failure_reason_key, status
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, 'draft'
          )
          RETURNING id
          `,
          [
            input.slug,
            input.companyName,
            input.summary,
            input.countryCode ?? null,
            input.industryKey,
            input.businessModelKey ?? null,
            input.foundedYear ?? null,
            input.closedYear ?? null,
            input.totalFundingUsd ?? null,
            input.primaryFailureReasonKey ?? null,
          ],
        );
        const caseId = ins.rows[0]!.id;

        const rev = await client.query<{ id: string }>(
          `
          INSERT INTO reviews (case_id, review_status, assigned_to)
          VALUES ($1, 'pending', $2)
          RETURNING id
          `,
          [caseId, input.assignedTo ?? null],
        );
        const reviewId = rev.rows[0]!.id;

        await client.query(
          `
          INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
          VALUES ($1, $2, $3, $4::jsonb)
          `,
          [
            'case.draft_created',
            reviewId,
            caseId,
            JSON.stringify({
              actor: 'admin_api',
              slug: input.slug,
              companyName: input.companyName,
            }),
          ],
        );

        return { ok: true as const, caseId, reviewId };
      });
    } catch (e: unknown) {
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        (e as { code: string }).code === '23505'
      ) {
        return { ok: false, error: 'duplicate_slug' };
      }
      throw e;
    }
  }
}

export class MockAdminWriteRepository implements AdminWriteRepository {
  constructor(
    private readonly cases: MockCasesRepository,
    private readonly reviews: MockReviewsRepository,
  ) {}

  async createDraftCaseWithReview(
    input: CreateDraftCaseBody,
  ): Promise<CreateDraftCaseResult> {
    const c = this.cases.adminCreateDraft(input);
    if (!c.ok) return c;
    const reviewId = this.reviews.adminQueueReview({
      caseId: c.caseId,
      slug: input.slug,
      companyName: input.companyName,
      assignedTo: input.assignedTo ?? null,
    });
    return { ok: true, caseId: c.caseId, reviewId };
  }
}
