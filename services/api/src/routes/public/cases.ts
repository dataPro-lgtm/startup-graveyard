import type { FastifyInstance } from 'fastify';
import {
  caseDetailSchema,
  caseIdParamSchema,
  caseSlugParamSchema,
  listCasesQuerySchema,
  listCasesResponseSchema,
  similarCasesQuerySchema,
  similarCasesResponseSchema,
} from '../../schemas/cases.js';

export async function caseRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const parsed = listCasesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const q = parsed.data;
    const result = await app.casesRepo.list({
      q: q.q,
      industry: q.industry,
      country: q.country,
      closedYear: q.closedYear,
      businessModelKey: q.businessModelKey,
      primaryFailureReasonKey: q.primaryFailureReasonKey,
      sort: q.sort,
      page: q.page,
      limit: q.limit,
    });
    const body = listCasesResponseSchema.parse(result);
    return body;
  });

  app.get('/by-slug/:slug', async (request, reply) => {
    const params = caseSlugParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_params', details: params.error.flatten() });
    }
    const item = await app.casesRepo.getPublishedBySlug(params.data.slug);
    if (!item) return reply.notFound('case not found');
    return caseDetailSchema.parse(item);
  });

  app.get('/:id/similar', async (request, reply) => {
    const params = caseIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('invalid case id');
    }
    const lim = similarCasesQuerySchema.safeParse(request.query);
    if (!lim.success) {
      return reply.code(400).send({ error: 'invalid_query', details: lim.error.flatten() });
    }
    const items = await app.casesRepo.findSimilarPublished(params.data.id, lim.data.limit);
    return similarCasesResponseSchema.parse({ items });
  });

  app.get('/:id', async (request, reply) => {
    const params = caseIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('invalid case id');
    }
    const item = await app.casesRepo.getById(params.data.id);
    if (!item) return reply.notFound('case not found');
    return caseDetailSchema.parse(item);
  });
}
