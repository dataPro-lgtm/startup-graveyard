import type { FastifyInstance } from 'fastify';
import {
  BUSINESS_MODEL_LABELS,
  COUNTRY_LABELS,
  INDUSTRY_LABELS,
  PRIMARY_FAILURE_REASON_LABELS,
} from '@sg/shared/taxonomy';

export async function metaRoutes(app: FastifyInstance) {
  app.get('/taxonomy', async () => ({
    industries: { ...INDUSTRY_LABELS },
    countries: { ...COUNTRY_LABELS },
    businessModels: { ...BUSINESS_MODEL_LABELS },
    primaryFailureReasons: { ...PRIMARY_FAILURE_REASON_LABELS },
  }));
}
