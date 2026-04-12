import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { getPool } from './db/pool.js';
import {
  type AdminCaseAttachmentsRepository,
  MockAdminCaseAttachmentsRepository,
  PgAdminCaseAttachmentsRepository,
} from './repositories/adminCaseAttachmentsRepository.js';
import {
  type AdminWriteRepository,
  MockAdminWriteRepository,
  PgAdminWriteRepository,
} from './repositories/adminWriteRepository.js';
import {
  type CasesRepository,
  MockCasesRepository,
  PgCasesRepository,
} from './repositories/casesRepository.js';
import {
  type AuditRepository,
  MockAuditRepository,
  PgAuditRepository,
} from './repositories/auditRepository.js';
import {
  type IngestionJobsRepository,
  MockIngestionJobsRepository,
  PgIngestionJobsRepository,
} from './repositories/ingestionJobsRepository.js';
import {
  type ReviewsRepository,
  MockReviewsRepository,
  PgReviewsRepository,
} from './repositories/reviewsRepository.js';
import { registerAdminRoutes } from './plugins/adminRoutes.js';
import { healthRoutes } from './routes/health.js';
import { caseRoutes } from './routes/public/cases.js';
import { copilotRoutes } from './routes/public/copilot.js';
import { metaRoutes } from './routes/public/meta.js';

export type BuildAppOptions = {
  /** 默认 true；测试可关日志 */
  logger?: boolean;
};

/** 注册路由与仓库，不 listen（供 `inject` 测试与生产启动）。 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<ReturnType<typeof Fastify>> {
  const server = Fastify({ logger: options.logger ?? true });

  const pgPool = getPool();

  let casesRepo: CasesRepository;
  let reviewsRepo: ReviewsRepository;
  let adminWriteRepo: AdminWriteRepository;
  let adminAttachmentsRepo: AdminCaseAttachmentsRepository;
  let ingestionJobsRepo: IngestionJobsRepository;

  if (pgPool) {
    casesRepo = new PgCasesRepository(pgPool);
    reviewsRepo = new PgReviewsRepository(pgPool);
    adminWriteRepo = new PgAdminWriteRepository(pgPool);
    adminAttachmentsRepo = new PgAdminCaseAttachmentsRepository(pgPool);
    ingestionJobsRepo = new PgIngestionJobsRepository(pgPool, adminWriteRepo);
  } else {
    const mc = new MockCasesRepository();
    const mr = new MockReviewsRepository();
    casesRepo = mc;
    reviewsRepo = mr;
    adminWriteRepo = new MockAdminWriteRepository(mc, mr);
    adminAttachmentsRepo = new MockAdminCaseAttachmentsRepository(casesRepo);
    ingestionJobsRepo = new MockIngestionJobsRepository(adminWriteRepo);
  }

  server.decorate('casesRepo', casesRepo as CasesRepository);
  server.decorate('reviewsRepo', reviewsRepo as ReviewsRepository);
  server.decorate('adminWriteRepo', adminWriteRepo as AdminWriteRepository);
  server.decorate(
    'adminAttachmentsRepo',
    adminAttachmentsRepo as AdminCaseAttachmentsRepository,
  );
  server.decorate(
    'ingestionJobsRepo',
    ingestionJobsRepo as IngestionJobsRepository,
  );
  const auditRepo = pgPool
    ? new PgAuditRepository(pgPool)
    : new MockAuditRepository();
  server.decorate('auditRepo', auditRepo as AuditRepository);
  if (!pgPool) {
    server.log.warn('DATABASE_URL unset; using in-memory mock cases + reviews');
  }

  await server.register(cors, { origin: true });
  await server.register(sensible);
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Startup Graveyard API',
        version: '1.0.0',
      },
    },
  });
  await server.register(swaggerUi, { routePrefix: '/docs' });

  await server.register(healthRoutes, { prefix: '/health' });
  await server.register(caseRoutes, { prefix: '/v1/cases' });
  await server.register(metaRoutes, { prefix: '/v1/meta' });
  await server.register(copilotRoutes, { prefix: '/v1/copilot' });
  await server.register(registerAdminRoutes, { prefix: '/v1/admin' });
  if (!process.env.ADMIN_API_KEY) {
    server.log.warn('ADMIN_API_KEY unset; /v1/admin/* is open');
  }

  return server;
}
