INSERT INTO cases (
  slug,
  company_name,
  summary,
  country_code,
  industry_key,
  status
) VALUES (
  'acme-draft',
  'Acme Draft Co',
  '本地开发用草稿案例，用于测试审核流。',
  'US',
  'saas',
  'draft'
);

INSERT INTO reviews (case_id, review_status, assigned_to)
SELECT id, 'pending', 'dev@local'
FROM cases WHERE slug = 'acme-draft';
