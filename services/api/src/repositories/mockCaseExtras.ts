import { randomUUID } from 'node:crypto';
import type { EvidenceSourceItem, FailureFactorItem, TimelineEventItem } from './casesRepository.js';

const extraEvidence = new Map<string, EvidenceSourceItem[]>();
const extraFactors = new Map<string, FailureFactorItem[]>();
const extraTimeline = new Map<string, TimelineEventItem[]>();

export function appendMockEvidence(
  caseId: string,
  partial: Omit<EvidenceSourceItem, 'id'> & { id?: string },
): EvidenceSourceItem {
  const item: EvidenceSourceItem = {
    id: partial.id ?? randomUUID(),
    sourceType: partial.sourceType,
    title: partial.title,
    url: partial.url,
    publisher: partial.publisher,
    publishedAt: partial.publishedAt,
    credibilityLevel: partial.credibilityLevel,
    excerpt: partial.excerpt,
  };
  const list = extraEvidence.get(caseId) ?? [];
  list.push(item);
  extraEvidence.set(caseId, list);
  return item;
}

export function appendMockFailureFactor(
  caseId: string,
  partial: Omit<FailureFactorItem, 'id'> & { id?: string },
): FailureFactorItem {
  const item: FailureFactorItem = {
    id: partial.id ?? randomUUID(),
    level1Key: partial.level1Key,
    level2Key: partial.level2Key,
    level3Key: partial.level3Key,
    weight: partial.weight,
    explanation: partial.explanation,
  };
  const list = extraFactors.get(caseId) ?? [];
  list.push(item);
  extraFactors.set(caseId, list);
  return item;
}

export function getMockExtraEvidence(caseId: string): EvidenceSourceItem[] {
  return extraEvidence.get(caseId) ?? [];
}

export function getMockExtraFactors(caseId: string): FailureFactorItem[] {
  return extraFactors.get(caseId) ?? [];
}

export function appendMockTimelineEvent(
  caseId: string,
  partial: Omit<TimelineEventItem, 'id'> & { id?: string },
): TimelineEventItem {
  const item: TimelineEventItem = {
    id: partial.id ?? randomUUID(),
    eventDate: partial.eventDate,
    eventType: partial.eventType,
    title: partial.title,
    description: partial.description,
    amountUsd: partial.amountUsd,
    sortOrder: partial.sortOrder,
  };
  const list = extraTimeline.get(caseId) ?? [];
  list.push(item);
  list.sort((a, b) => a.sortOrder - b.sortOrder || a.eventDate.localeCompare(b.eventDate));
  extraTimeline.set(caseId, list);
  return item;
}

export function getMockExtraTimeline(caseId: string): TimelineEventItem[] {
  return extraTimeline.get(caseId) ?? [];
}
