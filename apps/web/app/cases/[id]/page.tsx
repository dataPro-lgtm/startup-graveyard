import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { fetchCaseById, fetchSimilarCases } from '@/lib/casesApi';
import { CaseDetailView } from '../CaseDetailView';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await fetchCaseById(id);
  if (!item) return {};
  if (item.slug.trim().length > 0) return {}; // canonical is the slug URL
  const title = `${item.companyName} 失败复盘`;
  const description = item.summary.length > 160 ? item.summary.slice(0, 157) + '…' : item.summary;
  return { title, description };
}

export default async function CaseDetailPage({ params }: Props) {
  const { id } = await params;
  const item = await fetchCaseById(id);
  if (!item) notFound();

  const slug = item.slug.trim();
  if (slug.length > 0) {
    permanentRedirect(`/cases/s/${encodeURIComponent(slug)}`);
  }

  const similar = await fetchSimilarCases(id, 6);
  return <CaseDetailView item={item} similar={similar} />;
}
