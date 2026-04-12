import type { FastifyInstance } from 'fastify';
import {
  enqueueIngestionJobBodySchema,
  enqueueIngestionJobResponseSchema,
  ingestionJobIdParamSchema,
  ingestionJobItemSchema,
  listIngestionJobsQuerySchema,
  listIngestionJobsResponseSchema,
  processNextStubResponseSchema,
  reclaimStaleQuerySchema,
  reclaimStaleResponseSchema,
} from '../../schemas/ingestionJobs.js';

export async function ingestionJobRoutes(app: FastifyInstance) {
  app.post('/reclaim-stale', async (request, reply) => {
    const parsed = reclaimStaleQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const out = await app.ingestionJobsRepo.reclaimStaleRunning(parsed.data.maxRunningMinutes);
    return reclaimStaleResponseSchema.parse(out);
  });

  app.post('/process-next', async () => {
    const out = await app.ingestionJobsRepo.processNext();
    return processNextStubResponseSchema.parse(out);
  });

  app.get('/', async (request, reply) => {
    const parsed = listIngestionJobsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const items = await app.ingestionJobsRepo.listRecent({
      limit: parsed.data.limit,
      status: parsed.data.status,
    });
    return listIngestionJobsResponseSchema.parse({ items });
  });

  app.post('/:id/requeue', async (request, reply) => {
    const params = ingestionJobIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('invalid job id');
    }
    const job = await app.ingestionJobsRepo.requeueFailed(params.data.id);
    if (!job) {
      return reply.notFound('job not found or not in failed status');
    }
    return ingestionJobItemSchema.parse(job);
  });

  app.get('/:id', async (request, reply) => {
    const params = ingestionJobIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('invalid job id');
    }
    const job = await app.ingestionJobsRepo.getById(params.data.id);
    if (!job) return reply.notFound('job not found');
    return ingestionJobItemSchema.parse(job);
  });

  app.post('/', async (request, reply) => {
    const body = enqueueIngestionJobBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_body', details: body.error.flatten() });
    }
    const out = await app.ingestionJobsRepo.enqueue(body.data);
    return enqueueIngestionJobResponseSchema.parse(out);
  });
}
