BEGIN;

INSERT INTO cases (
  slug,
  company_name,
  summary,
  country_code,
  industry_key,
  business_model_key,
  founded_year,
  closed_year,
  status
) VALUES (
  'quickride-pk',
  'QuickRide',
  '同类即时出行扩张过快，补贴退坡与融资成本上升后现金流承压。',
  'PK',
  'mobility',
  'marketplace',
  2020,
  2023,
  'published'
);

INSERT INTO evidence_sources (
  case_id,
  source_type,
  title,
  url,
  publisher,
  credibility_level,
  excerpt
)
SELECT
  id,
  'media',
  'QuickRide coverage',
  'https://example.com/quickride-pk',
  'Example Media',
  'medium',
  'Seed-only stub.'
FROM cases
WHERE slug = 'quickride-pk';

INSERT INTO case_embeddings (case_id, embedding)
SELECT c.id,
  (
    SELECT array_agg(sin(i::float8 / 123.0) ORDER BY i)
    FROM generate_series(1, 1536) AS i
  )::vector(1536)
FROM cases c
WHERE c.slug = 'airlift';

INSERT INTO case_embeddings (case_id, embedding)
SELECT c.id,
  (
    SELECT array_agg(sin((i + 0.3)::float8 / 123.0) ORDER BY i)
    FROM generate_series(1, 1536) AS i
  )::vector(1536)
FROM cases c
WHERE c.slug = 'quickride-pk';

COMMIT;
