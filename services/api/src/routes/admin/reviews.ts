import type { FastifyInstance } from 'fastify';
import {
  approveReviewResponseSchema,
  listReviewsQuerySchema,
  listReviewsResponseSchema,
  rejectReviewBodySchema,
  rejectReviewResponseSchema,
  reviewIdParamSchema,
} from '../../schemas/reviews.js';

export async function reviewRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const parsed = listReviewsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const q = parsed.data;
    const result = await app.reviewsRepo.list({
      status: q.status,
      page: q.page,
      limit: q.limit,
    });
    return listReviewsResponseSchema.parse(result);
  });

  app.post('/:id/approve', async (request, reply) => {
    const params = reviewIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('invalid review id');
    }
    const out = await app.reviewsRepo.approve(params.data.id);
    if (!out) return reply.notFound('review not found or not pending');
    return approveReviewResponseSchema.parse(out);
  });

  app.post('/:id/reject', async (request, reply) => {
    const params = reviewIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('invalid review id');
    }
    const body = rejectReviewBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', details: body.error.flatten() });
    }
    const out = await app.reviewsRepo.reject(
      params.data.id,
      body.data.decisionNote,
    );
    if (!out) return reply.notFound('review not found or not pending');
    return rejectReviewResponseSchema.parse(out);
  });
}
