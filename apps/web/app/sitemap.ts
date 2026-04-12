import type { MetadataRoute } from 'next';
import { fetchCasesList } from '@/lib/casesApi';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://startup-graveyard.io';

export const revalidate = 3600; // refresh every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/copilot`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  // Fetch published cases for dynamic routes
  const result = await fetchCasesList({ limit: '200', page: '1' }).catch(() => null);
  const caseRoutes: MetadataRoute.Sitemap =
    result?.items.map((item) => ({
      url: item.slug.trim()
        ? `${SITE_URL}/cases/s/${encodeURIComponent(item.slug)}`
        : `${SITE_URL}/cases/${item.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })) ?? [];

  return [...staticRoutes, ...caseRoutes];
}
