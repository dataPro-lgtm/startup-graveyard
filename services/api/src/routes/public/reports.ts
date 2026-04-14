import type { FastifyInstance } from 'fastify';
import {
  exportResearchReportBodySchema,
  exportResearchReportResponseSchema,
} from '../../schemas/reportExports.js';
import {
  createReportShareBodySchema,
  createReportShareResponseSchema,
  deleteReportShareParamsSchema,
  deleteReportShareResponseSchema,
  publicReportShareParamsSchema,
  publicReportShareResponseSchema,
  reportShareListResponseSchema,
} from '../../schemas/reportShares.js';
import { buildResearchBrief, renderResearchBriefMarkdown } from '../../reports/researchBrief.js';
import type { ReportShareItemRecord } from '../../repositories/reportSharesRepository.js';
import { requireEffectiveUser } from './authedUser.js';

function slugifyFilename(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'research-view';
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

function sharePath(shareToken: string): string {
  return `/research/brief/${encodeURIComponent(shareToken)}`;
}

function toShareItem(item: ReportShareItemRecord) {
  return {
    ...item,
    sharePath: sharePath(item.shareToken),
    shareUrl: `${appBaseUrl()}${sharePath(item.shareToken)}`,
  };
}

export async function reportsRoutes(app: FastifyInstance) {
  app.post('/exports/markdown', async (request, reply) => {
    const user = await requireEffectiveUser(app, request, reply);
    if (!user) return reply;

    const parsed = exportResearchReportBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    if (!user.entitlements.canExportReports) {
      return reply.code(403).send({ error: 'entitlement_required' });
    }

    const brief = await buildResearchBrief(app, {
      title: parsed.data.name,
      filters: parsed.data.filters,
    });
    return exportResearchReportResponseSchema.parse({
      ok: true,
      filename: `${slugifyFilename(parsed.data.name)}.md`,
      mimeType: 'text/markdown',
      title: parsed.data.name,
      caseCount: brief.totalMatchingCases,
      sampleSize: brief.sampleSize,
      generatedAt: brief.generatedAt,
      content: renderResearchBriefMarkdown(brief),
    });
  });

  app.get('/shares/me', async (request, reply) => {
    const user = await requireEffectiveUser(app, request, reply);
    if (!user) return reply;

    const items = await app.reportSharesRepo.listByUserId(user.id);
    return reportShareListResponseSchema.parse({
      items: items.map((item) => toShareItem(item)),
    });
  });

  app.post('/shares', async (request, reply) => {
    const user = await requireEffectiveUser(app, request, reply);
    if (!user) return reply;

    const parsed = createReportShareBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    if (!user.entitlements.canExportReports) {
      return reply.code(403).send({ error: 'entitlement_required' });
    }

    const savedView = await app.savedViewsRepo.getById(user.id, parsed.data.savedViewId);
    if (!savedView) {
      return reply.code(404).send({ error: 'saved_view_not_found' });
    }

    const created = await app.reportSharesRepo.create(
      {
        userId: user.id,
        ownerDisplayName: user.displayName ?? null,
      },
      savedView,
    );

    return createReportShareResponseSchema.parse({
      ok: true,
      created: created.status === 'created',
      item: toShareItem(created.item),
    });
  });

  app.delete('/shares/:shareId', async (request, reply) => {
    const user = await requireEffectiveUser(app, request, reply);
    if (!user) return reply;

    const params = deleteReportShareParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_params', details: params.error.flatten() });
    }

    const removed = await app.reportSharesRepo.remove(user.id, params.data.shareId);
    if (!removed) {
      return reply.code(404).send({ error: 'share_not_found' });
    }

    return deleteReportShareResponseSchema.parse({
      ok: true,
      shareId: params.data.shareId,
    });
  });

  app.get('/shares/public/:shareToken', async (request, reply) => {
    const params = publicReportShareParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_params', details: params.error.flatten() });
    }

    const share = await app.reportSharesRepo.getPublicByToken(params.data.shareToken);
    if (!share) {
      return reply.code(404).send({ error: 'share_not_found' });
    }

    const brief = await buildResearchBrief(app, {
      title: share.savedViewName,
      filters: share.filters,
    });

    return publicReportShareResponseSchema.parse({
      share: {
        id: share.id,
        savedViewId: share.savedViewId,
        savedViewName: share.savedViewName,
        ownerDisplayName: share.ownerDisplayName,
        shareToken: share.shareToken,
        sharePath: sharePath(share.shareToken),
        shareUrl: `${appBaseUrl()}${sharePath(share.shareToken)}`,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt,
        lastAccessedAt: share.lastAccessedAt,
      },
      brief,
    });
  });
}
