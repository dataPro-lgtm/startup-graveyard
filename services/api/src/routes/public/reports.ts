import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { buildSavedViewQueryString, type SavedViewFilters } from '@sg/shared/schemas/savedViews';
import {
  exportResearchReportBodySchema,
  exportResearchReportResponseSchema,
} from '../../schemas/reportExports.js';
import { verifyAccessToken } from '../../auth/tokens.js';
import {
  businessModelLabel,
  countryLabel,
  industryLabel,
  primaryFailureReasonLabel,
} from '@sg/shared/taxonomy';

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

async function requireUser(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const token = extractBearer(request.headers.authorization);
  if (!token) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
  const user = await app.usersRepo.getById(payload.sub);
  if (!user) {
    reply.code(404).send({ error: 'user_not_found' });
    return null;
  }
  return user;
}

function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function summarizeFilters(filters: SavedViewFilters): string[] {
  const parts: string[] = [];
  if (filters.q) parts.push(`关键词：${filters.q}`);
  if (filters.industry) parts.push(`行业：${industryLabel(filters.industry)}`);
  if (filters.country) parts.push(`国家：${countryLabel(filters.country)}`);
  if (filters.closedYear) parts.push(`关闭年份：${filters.closedYear}`);
  if (filters.businessModelKey) parts.push(`模式：${businessModelLabel(filters.businessModelKey)}`);
  if (filters.primaryFailureReasonKey) {
    parts.push(`失败主因：${primaryFailureReasonLabel(filters.primaryFailureReasonKey)}`);
  }
  return parts.length > 0 ? parts : ['全部已发布案例'];
}

function topBuckets(values: Array<string | null | undefined>, labelFor: (key: string) => string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([key, count]) => `${labelFor(key)} (${count})`);
}

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

export async function reportsRoutes(app: FastifyInstance) {
  app.post('/exports/markdown', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = exportResearchReportBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    if (!user.entitlements.canExportReports) {
      return reply.code(403).send({ error: 'entitlement_required' });
    }

    const result = await app.casesRepo.list({
      q: parsed.data.filters.q,
      industry: parsed.data.filters.industry,
      country: parsed.data.filters.country,
      closedYear: parsed.data.filters.closedYear
        ? Number(parsed.data.filters.closedYear)
        : undefined,
      businessModelKey: parsed.data.filters.businessModelKey?.toLowerCase(),
      primaryFailureReasonKey: parsed.data.filters.primaryFailureReasonKey?.toLowerCase(),
      sort: parsed.data.filters.sort,
      page: 1,
      limit: 12,
    });

    const totalFunding = result.items.reduce((sum, item) => sum + (item.totalFundingUsd ?? 0), 0);
    const topIndustries = topBuckets(
      result.items.map((item) => item.industry),
      industryLabel,
    );
    const topReasons = topBuckets(
      result.items.map((item) => item.primaryFailureReasonKey),
      primaryFailureReasonLabel,
    );
    const generatedAt = new Date().toISOString();
    const queryString = buildSavedViewQueryString(parsed.data.filters);
    const viewUrl = queryString ? `${appBaseUrl()}/?${queryString}` : `${appBaseUrl()}/`;
    const lines = [
      `# ${parsed.data.name}`,
      '',
      `Generated at: ${generatedAt}`,
      `Source view: ${viewUrl}`,
      '',
      '## Filter Summary',
      ...summarizeFilters(parsed.data.filters).map((item) => `- ${item}`),
      '',
      '## Snapshot',
      `- Total matching cases: ${result.total}`,
      `- Sample included in this brief: ${result.items.length}`,
      `- Funding represented in sample: ${formatUsd(totalFunding)}`,
      `- Top industries in sample: ${topIndustries.join(', ') || 'N/A'}`,
      `- Top failure reasons in sample: ${topReasons.join(', ') || 'N/A'}`,
      '',
      '## Matching Cases',
      ...result.items.flatMap((item, index) => {
        const header = `### ${index + 1}. ${item.companyName}`;
        const meta = [
          industryLabel(item.industry),
          item.country ? countryLabel(item.country) : null,
          item.closedYear ? String(item.closedYear) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return [
          header,
          meta ? `- Profile: ${meta}` : '- Profile: N/A',
          `- Funding: ${formatUsd(item.totalFundingUsd)}`,
          `- Primary failure reason: ${
            item.primaryFailureReasonKey
              ? primaryFailureReasonLabel(item.primaryFailureReasonKey)
              : 'N/A'
          }`,
          `- Summary: ${item.summary}`,
          `- Case URL: ${appBaseUrl()}/cases/s/${encodeURIComponent(item.slug)}`,
          '',
        ];
      }),
    ];

    return exportResearchReportResponseSchema.parse({
      ok: true,
      filename: `${slugifyFilename(parsed.data.name)}.md`,
      mimeType: 'text/markdown',
      title: parsed.data.name,
      caseCount: result.total,
      sampleSize: result.items.length,
      generatedAt,
      content: lines.join('\n'),
    });
  });
}
