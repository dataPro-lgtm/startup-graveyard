import type { AdminCaseAttachmentsRepository } from '../repositories/adminCaseAttachmentsRepository.js';
import type { AdminWriteRepository } from '../repositories/adminWriteRepository.js';
import type { AuditRepository } from '../repositories/auditRepository.js';
import type { CasesRepository } from '../repositories/casesRepository.js';
import type { CopilotEvalsRepository } from '../repositories/copilotEvalsRepository.js';
import type { CopilotSessionsRepository } from '../repositories/copilotSessionsRepository.js';
import type { IngestionJobsRepository } from '../repositories/ingestionJobsRepository.js';
import type { ReviewsRepository } from '../repositories/reviewsRepository.js';
import type { SavedViewsRepository } from '../repositories/savedViewsRepository.js';
import type { TeamWorkspacesRepository } from '../repositories/teamWorkspacesRepository.js';
import type { SourceSnapshotsRepository } from '../repositories/sourceSnapshotsRepository.js';
import type { UsersRepository } from '../repositories/usersRepository.js';
import type { WatchlistsRepository } from '../repositories/watchlistRepository.js';

declare module 'fastify' {
  interface FastifyInstance {
    casesRepo: CasesRepository;
    reviewsRepo: ReviewsRepository;
    auditRepo: AuditRepository;
    adminWriteRepo: AdminWriteRepository;
    adminAttachmentsRepo: AdminCaseAttachmentsRepository;
    ingestionJobsRepo: IngestionJobsRepository;
    sourceSnapshotsRepo: SourceSnapshotsRepository;
    copilotSessionsRepo: CopilotSessionsRepository;
    copilotEvalsRepo: CopilotEvalsRepository;
    usersRepo: UsersRepository;
    watchlistsRepo: WatchlistsRepository;
    savedViewsRepo: SavedViewsRepository;
    teamWorkspacesRepo: TeamWorkspacesRepository;
  }
}
