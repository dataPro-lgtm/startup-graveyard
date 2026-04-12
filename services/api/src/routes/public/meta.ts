import type { FastifyInstance } from 'fastify';
import { homeSummarySchema } from '@sg/shared/schemas/meta';
import {
  BUSINESS_MODEL_LABELS,
  COUNTRY_LABELS,
  FAILURE_FACTOR_LEVEL_1_LABELS,
  FAILURE_FACTOR_LEVEL_2_LABELS,
  INDUSTRY_LABELS,
  PRIMARY_FAILURE_REASON_LABELS,
  TIMELINE_EVENT_TYPE_LABELS,
} from '@sg/shared/taxonomy';

export async function metaRoutes(app: FastifyInstance) {
  app.get('/taxonomy', async () => ({
    industries: { ...INDUSTRY_LABELS },
    countries: { ...COUNTRY_LABELS },
    businessModels: { ...BUSINESS_MODEL_LABELS },
    primaryFailureReasons: { ...PRIMARY_FAILURE_REASON_LABELS },
    failureFactorLevel1: { ...FAILURE_FACTOR_LEVEL_1_LABELS },
    failureFactorLevel2: { ...FAILURE_FACTOR_LEVEL_2_LABELS },
    timelineEventTypes: { ...TIMELINE_EVENT_TYPE_LABELS },
  }));

  app.get('/home-summary', async () => {
    const summary = await app.casesRepo.getHomeSummary();
    return homeSummarySchema.parse(summary);
  });
}
