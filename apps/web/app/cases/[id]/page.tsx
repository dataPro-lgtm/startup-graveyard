import { notFound, permanentRedirect } from 'next/navigation';
import { fetchCaseById, fetchSimilarCases } from '@/lib/casesApi';
import { CaseDetailView } from '../CaseDetailView';

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
