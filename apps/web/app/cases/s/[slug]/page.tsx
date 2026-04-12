import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchCaseBySlug, fetchSimilarCases } from '@/lib/casesApi';
import { CaseDetailView } from '../../CaseDetailView';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await fetchCaseBySlug(slug);
  if (!item) return {};

  const title = `${item.companyName} 失败复盘`;
  const description = item.summary.length > 160 ? item.summary.slice(0, 157) + '…' : item.summary;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/cases/s/${encodeURIComponent(slug)}`,
      images: [
        {
          url: `/api/og/case?slug=${encodeURIComponent(slug)}`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/api/og/case?slug=${encodeURIComponent(slug)}`],
    },
    alternates: { canonical: `/cases/s/${encodeURIComponent(slug)}` },
  };
}

export default async function CaseBySlugPage({ params }: Props) {
  const { slug } = await params;
  const item = await fetchCaseBySlug(slug);
  if (!item) notFound();
  const similar = await fetchSimilarCases(item.id, 6);

  return <CaseDetailView item={item} similar={similar} />;
}
