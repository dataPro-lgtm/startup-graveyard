import { notFound } from 'next/navigation';
import { fetchCaseBySlug, fetchSimilarCases } from '@/lib/casesApi';
import { CaseDetailView } from '../../CaseDetailView';

export default async function CaseBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await fetchCaseBySlug(slug);
  if (!item) notFound();
  const similar = await fetchSimilarCases(item.id, 6);

  return <CaseDetailView item={item} similar={similar} />;
}
