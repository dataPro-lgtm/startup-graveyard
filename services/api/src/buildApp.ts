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
  type CopilotEvalsRepository,
  MockCopilotEvalsRepository,
  PgCopilotEvalsRepository,
} from './repositories/copilotEvalsRepository.js';
import {
  type CopilotSessionsRepository,
  MockCopilotSessionsRepository,
  PgCopilotSessionsRepository,
} from './repositories/copilotSessionsRepository.js';
import { type AuditRepository, MockAuditRepository, PgAuditRepository } from './repositories/auditRepository.js';
import {
  type IngestionJobsRepository,
  MockIngestionJobsRepository,
  PgIngestionJobsRepository,
} from './repositories/ingestionJobsRepository.js';
import {
  type SourceSnapshotsRepository,
  MockSourceSnapshotsRepository,
  PgSourceSnapshotsRepository,
} from './repositories/sourceSnapshotsRepository.js';
import {
  type UsersRepository,
  MockUsersRepository,
  PgUsersRepository,
} from './repositories/usersRepository.js';
import {
  type WatchlistsRepository,
  MockWatchlistsRepository,
  PgWatchlistsRepository,
} from './repositories/watchlistRepository.js';
import {
  type SavedViewsRepository,
  MockSavedViewsRepository,
  PgSavedViewsRepository,
} from './repositories/savedViewsRepository.js';
import {
  type ReviewsRepository,
  MockReviewsRepository,
  PgReviewsRepository,
} from './repositories/reviewsRepository.js';
import { registerAdminRoutes } from './plugins/adminRoutes.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/public/auth.js';
import { caseRoutes } from './routes/public/cases.js';
import { copilotRoutes } from './routes/public/copilot.js';
import { paymentsRoutes } from './routes/public/payments.js';
import { savedViewsRoutes } from './routes/public/savedViews.js';
import { watchlistRoutes } from './routes/public/watchlist.js';
import { metaRoutes } from './routes/public/meta.js';

export type BuildAppOptions = {
  /** 默认 true；测试可关日志 */
  logger?: boolean;
};

/** 注册路由与仓库，不 listen（供 `inject` 测试与生产启动）。 */
export async function buildApp(options: BuildAppOptions = {}): Promise<ReturnType<typeof Fastify>> {
  const server = Fastify({ logger: options.logger ?? true });

  const pgPool = getPool();

  let casesRepo: CasesRepository;
  let reviewsRepo: ReviewsRepository;
  let adminWriteRepo: AdminWriteRepository;
  let adminAttachmentsRepo: AdminCaseAttachmentsRepository;
  let ingestionJobsRepo: IngestionJobsRepository;
  let sourceSnapshotsRepo: SourceSnapshotsRepository;
  let copilotSessionsRepo: CopilotSessionsRepository;
  let copilotEvalsRepo: CopilotEvalsRepository;
  let usersRepo: UsersRepository;
  let watchlistsRepo: WatchlistsRepository;
  let savedViewsRepo: SavedViewsRepository;
  const queueApprovedCaseIndex = async (caseId: string) => {
    await ingestionJobsRepo.enqueue({
      sourceName: 'rebuild_case_search_index',
      triggerType: 'review_approved',
      payload: { caseId },
    });
  };

  if (pgPool) {
    casesRepo = new PgCasesRepository(pgPool);
    reviewsRepo = new PgReviewsRepository(pgPool, async ({ caseId }) => {
      await queueApprovedCaseIndex(caseId);
    });
    adminWriteRepo = new PgAdminWriteRepository(pgPool);
    adminAttachmentsRepo = new PgAdminCaseAttachmentsRepository(pgPool);
    sourceSnapshotsRepo = new PgSourceSnapshotsRepository(pgPool);
    copilotSessionsRepo = new PgCopilotSessionsRepository(pgPool);
    copilotEvalsRepo = new PgCopilotEvalsRepository(pgPool);
    usersRepo = new PgUsersRepository(pgPool);
    watchlistsRepo = new PgWatchlistsRepository(pgPool);
    savedViewsRepo = new PgSavedViewsRepository(pgPool);
    ingestionJobsRepo = new PgIngestionJobsRepository(
      pgPool,
      casesRepo,
      adminWriteRepo,
      adminAttachmentsRepo,
      sourceSnapshotsRepo,
      copilotEvalsRepo,
    );
  } else {
    const mc = new MockCasesRepository();
    const mr = new MockReviewsRepository(mc, async ({ caseId }) => {
      await queueApprovedCaseIndex(caseId);
    });
    casesRepo = mc;
    reviewsRepo = mr;
    adminWriteRepo = new MockAdminWriteRepository(mc, mr);
    adminAttachmentsRepo = new MockAdminCaseAttachmentsRepository(casesRepo);
    sourceSnapshotsRepo = new MockSourceSnapshotsRepository();
    copilotSessionsRepo = new MockCopilotSessionsRepository();
    copilotEvalsRepo = new MockCopilotEvalsRepository();
    usersRepo = new MockUsersRepository();
    watchlistsRepo = new MockWatchlistsRepository(casesRepo);
    savedViewsRepo = new MockSavedViewsRepository();
    ingestionJobsRepo = new MockIngestionJobsRepository(
      casesRepo,
      adminWriteRepo,
      adminAttachmentsRepo,
      sourceSnapshotsRepo,
      copilotEvalsRepo,
    );
  }

  server.decorate('casesRepo', casesRepo as CasesRepository);
  server.decorate('reviewsRepo', reviewsRepo as ReviewsRepository);
  server.decorate('adminWriteRepo', adminWriteRepo as AdminWriteRepository);
  server.decorate('adminAttachmentsRepo', adminAttachmentsRepo as AdminCaseAttachmentsRepository);
  server.decorate('ingestionJobsRepo', ingestionJobsRepo as IngestionJobsRepository);
  server.decorate('sourceSnapshotsRepo', sourceSnapshotsRepo as SourceSnapshotsRepository);
  server.decorate('copilotSessionsRepo', copilotSessionsRepo as CopilotSessionsRepository);
  server.decorate('copilotEvalsRepo', copilotEvalsRepo as CopilotEvalsRepository);
  server.decorate('usersRepo', usersRepo as UsersRepository);
  server.decorate('watchlistsRepo', watchlistsRepo as WatchlistsRepository);
  server.decorate('savedViewsRepo', savedViewsRepo as SavedViewsRepository);
  const auditRepo = pgPool ? new PgAuditRepository(pgPool) : new MockAuditRepository();
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
  await server.register(authRoutes, { prefix: '/v1/auth' });
  await server.register(caseRoutes, { prefix: '/v1/cases' });
  await server.register(metaRoutes, { prefix: '/v1/meta' });
  await server.register(copilotRoutes, { prefix: '/v1/copilot' });
  await server.register(paymentsRoutes, { prefix: '/v1/payments' });
  await server.register(savedViewsRoutes, { prefix: '/v1/saved-views' });
  await server.register(watchlistRoutes, { prefix: '/v1/watchlist' });
  await server.register(registerAdminRoutes, { prefix: '/v1/admin' });
  if (!process.env.ADMIN_API_KEY) {
    server.log.warn('ADMIN_API_KEY unset; /v1/admin/* is disabled');
  }

  return server;
}
