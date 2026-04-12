import type { FastifyInstance } from 'fastify';
import {
  addEvidenceBodySchema,
  addFailureFactorBodySchema,
  adminCaseIdParamSchema,
  createdRowResponseSchema,
} from '../../schemas/adminCaseAttachments.js';
import {
  createDraftCaseBodySchema,
  createDraftCaseResponseSchema,
} from '../../schemas/adminCases.js';

export async function adminCaseRoutes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const parsed = createDraftCaseBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const out = await app.adminWriteRepo.createDraftCaseWithReview(
      parsed.data,
    );
    if (!out.ok) {
      return reply.code(409).send({ error: 'duplicate_slug' });
    }
    return createDraftCaseResponseSchema.parse({
      caseId: out.caseId,
      reviewId: out.reviewId,
      status: 'draft' as const,
    });
  });

  app.post('/:caseId/evidence', async (request, reply) => {
    const params = adminCaseIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('invalid case id');
    }
    const body = addEvidenceBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', details: body.error.flatten() });
    }
    const out = await app.adminAttachmentsRepo.addEvidence(
      params.data.caseId,
      body.data,
    );
    if (!out.ok) return reply.notFound('case not found');
    return createdRowResponseSchema.parse({ id: out.id });
  });

  app.post('/:caseId/failure-factors', async (request, reply) => {
    const params = adminCaseIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('invalid case id');
    }
    const body = addFailureFactorBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', details: body.error.flatten() });
    }
    const out = await app.adminAttachmentsRepo.addFailureFactor(
      params.data.caseId,
      body.data,
    );
    if (!out.ok) return reply.notFound('case not found');
    return createdRowResponseSchema.parse({ id: out.id });
  });
}
