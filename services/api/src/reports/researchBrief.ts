import type { FastifyInstance } from 'fastify';
import type { SavedViewFilters } from '@sg/shared/schemas/savedViews';
import {
  businessModelLabel,
  countryLabel,
  industryLabel,
  primaryFailureReasonLabel,
} from '@sg/shared/taxonomy';
import { buildSavedViewQueryString } from '@sg/shared/schemas/savedViews';

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

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export type ResearchBriefPayload = {
  title: string;
  generatedAt: string;
  sourceViewUrl: string;
  sourceViewPath: string;
  filterSummary: string[];
  totalMatchingCases: number;
  sampleSize: number;
  sampleFundingUsd: number;
  topIndustries: string[];
  topFailureReasons: string[];
  cases: Array<{
    id: string;
    slug: string;
    companyName: string;
    industry: string;
    country: string | null;
    closedYear: number | null;
    totalFundingUsd: number | null;
    primaryFailureReasonKey: string | null;
    summary: string;
  }>;
};

export async function buildResearchBrief(
  app: FastifyInstance,
  input: { title: string; filters: SavedViewFilters },
): Promise<ResearchBriefPayload> {
  const result = await app.casesRepo.list({
    q: input.filters.q,
    industry: input.filters.industry,
    country: input.filters.country,
    closedYear: input.filters.closedYear ? Number(input.filters.closedYear) : undefined,
    businessModelKey: input.filters.businessModelKey?.toLowerCase(),
    primaryFailureReasonKey: input.filters.primaryFailureReasonKey?.toLowerCase(),
    sort: input.filters.sort,
    page: 1,
    limit: 12,
  });

  const sampleFundingUsd = result.items.reduce((sum, item) => sum + (item.totalFundingUsd ?? 0), 0);
  const queryString = buildSavedViewQueryString(input.filters);
  const sourceViewPath = queryString ? `/?${queryString}` : '/';

  return {
    title: input.title,
    generatedAt: new Date().toISOString(),
    sourceViewUrl: `${appBaseUrl()}${sourceViewPath}`,
    sourceViewPath,
    filterSummary: summarizeFilters(input.filters),
    totalMatchingCases: result.total,
    sampleSize: result.items.length,
    sampleFundingUsd,
    topIndustries: topBuckets(
      result.items.map((item) => item.industry),
      industryLabel,
    ),
    topFailureReasons: topBuckets(
      result.items.map((item) => item.primaryFailureReasonKey),
      primaryFailureReasonLabel,
    ),
    cases: result.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      companyName: item.companyName,
      industry: item.industry,
      country: item.country,
      closedYear: item.closedYear,
      totalFundingUsd: item.totalFundingUsd,
      primaryFailureReasonKey: item.primaryFailureReasonKey,
      summary: item.summary,
    })),
  };
}

export function renderResearchBriefMarkdown(brief: ResearchBriefPayload): string {
  return [
    `# ${brief.title}`,
    '',
    `Generated at: ${brief.generatedAt}`,
    `Source view: ${brief.sourceViewUrl}`,
    '',
    '## Filter Summary',
    ...brief.filterSummary.map((item) => `- ${item}`),
    '',
    '## Snapshot',
    `- Total matching cases: ${brief.totalMatchingCases}`,
    `- Sample included in this brief: ${brief.sampleSize}`,
    `- Funding represented in sample: ${formatUsd(brief.sampleFundingUsd)}`,
    `- Top industries in sample: ${brief.topIndustries.join(', ') || 'N/A'}`,
    `- Top failure reasons in sample: ${brief.topFailureReasons.join(', ') || 'N/A'}`,
    '',
    '## Matching Cases',
    ...brief.cases.flatMap((item, index) => {
      const meta = [
        industryLabel(item.industry),
        item.country ? countryLabel(item.country) : null,
        item.closedYear ? String(item.closedYear) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return [
        `### ${index + 1}. ${item.companyName}`,
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
  ].join('\n');
}
