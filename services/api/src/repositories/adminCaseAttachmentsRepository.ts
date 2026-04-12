import type { Pool } from 'pg';
import type { AddEvidenceBody, AddFailureFactorBody } from '../schemas/adminCaseAttachments.js';
import type { CasesRepository } from './casesRepository.js';
import {
  appendMockEvidence,
  appendMockFailureFactor,
} from './mockCaseExtras.js';

export type AttachmentWriteResult =
  | { ok: true; id: string }
  | { ok: false; error: 'case_not_found' };

export interface AdminCaseAttachmentsRepository {
  addEvidence(
    caseId: string,
    body: AddEvidenceBody,
  ): Promise<AttachmentWriteResult>;
  addFailureFactor(
    caseId: string,
    body: AddFailureFactorBody,
  ): Promise<AttachmentWriteResult>;
}

export class PgAdminCaseAttachmentsRepository
  implements AdminCaseAttachmentsRepository
{
  constructor(private readonly pool: Pool) {}

  async addEvidence(
    caseId: string,
    body: AddEvidenceBody,
  ): Promise<AttachmentWriteResult> {
    const publishedAt = body.publishedAt
      ? new Date(body.publishedAt)
      : null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query<{ id: string }>(
        `
        INSERT INTO evidence_sources (
          case_id, source_type, title, url, publisher, published_at,
          credibility_level, excerpt
        )
        SELECT c.id, $2, $3, $4, $5, $6, $7, $8
        FROM (SELECT id FROM cases WHERE id = $1) AS c
        RETURNING id
        `,
        [
          caseId,
          body.sourceType,
          body.title,
          body.url,
          body.publisher ?? null,
          publishedAt,
          body.credibilityLevel,
          body.excerpt ?? null,
        ],
      );
      if (ins.rowCount === 0) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'case_not_found' };
      }
      const id = ins.rows[0]!.id;
      await client.query(
        `
        INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
        VALUES ($1, NULL, $2, $3::jsonb)
        `,
        [
          'evidence.added',
          caseId,
          JSON.stringify({
            actor: 'admin_api',
            evidenceId: id,
            title: body.title,
          }),
        ],
      );
      await client.query('COMMIT');
      return { ok: true, id };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async addFailureFactor(
    caseId: string,
    body: AddFailureFactorBody,
  ): Promise<AttachmentWriteResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query<{ id: string }>(
        `
        INSERT INTO failure_factors (
          case_id, level_1_key, level_2_key, level_3_key, weight, explanation
        )
        SELECT c.id, $2, $3, $4, $5, $6
        FROM (SELECT id FROM cases WHERE id = $1) AS c
        RETURNING id
        `,
        [
          caseId,
          body.level1Key,
          body.level2Key,
          body.level3Key ?? null,
          body.weight,
          body.explanation ?? null,
        ],
      );
      if (ins.rowCount === 0) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'case_not_found' };
      }
      const id = ins.rows[0]!.id;
      await client.query(
        `
        INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
        VALUES ($1, NULL, $2, $3::jsonb)
        `,
        [
          'failure_factor.added',
          caseId,
          JSON.stringify({
            actor: 'admin_api',
            factorId: id,
            level1Key: body.level1Key,
            level2Key: body.level2Key,
          }),
        ],
      );
      await client.query('COMMIT');
      return { ok: true, id };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }
}

export class MockAdminCaseAttachmentsRepository
  implements AdminCaseAttachmentsRepository
{
  constructor(private readonly cases: CasesRepository) {}

  async addEvidence(
    caseId: string,
    body: AddEvidenceBody,
  ): Promise<AttachmentWriteResult> {
    const exists = await this.cases.caseExists(caseId);
    if (!exists) return { ok: false, error: 'case_not_found' };
    const publishedAt = body.publishedAt
      ? new Date(body.publishedAt).toISOString()
      : null;
    const item = appendMockEvidence(caseId, {
      sourceType: body.sourceType,
      title: body.title,
      url: body.url,
      publisher: body.publisher ?? null,
      publishedAt,
      credibilityLevel: body.credibilityLevel,
      excerpt: body.excerpt ?? null,
    });
    return { ok: true, id: item.id };
  }

  async addFailureFactor(
    caseId: string,
    body: AddFailureFactorBody,
  ): Promise<AttachmentWriteResult> {
    const exists = await this.cases.caseExists(caseId);
    if (!exists) return { ok: false, error: 'case_not_found' };
    const item = appendMockFailureFactor(caseId, {
      level1Key: body.level1Key,
      level2Key: body.level2Key,
      level3Key: body.level3Key ?? null,
      weight: body.weight,
      explanation: body.explanation ?? null,
    });
    return { ok: true, id: item.id };
  }
}
