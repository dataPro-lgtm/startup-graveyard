INSERT INTO cases (
  slug,
  company_name,
  summary,
  country_code,
  industry_key,
  business_model_key,
  founded_year,
  closed_year,
  total_funding_usd,
  primary_failure_reason_key,
  status
) VALUES (
  'airlift',
  'Airlift',
  '高速扩张叠加融资环境收缩，导致现金流无法支撑业务。',
  'PK',
  'mobility',
  'marketplace',
  2019,
  2022,
  109000000,
  'premature_scaling',
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
SELECT id, 'media', 'Airlift shutdown coverage', 'https://example.com/airlift', 'Example Media', 'medium',
'Seed entry used only for local development.'
FROM cases WHERE slug = 'airlift';