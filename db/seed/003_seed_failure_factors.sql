INSERT INTO failure_factors (
  case_id,
  level_1_key,
  level_2_key,
  level_3_key,
  weight,
  explanation
)
SELECT
  id,
  'execution',
  'scaling',
  'premature_scaling',
  0.85,
  '扩张节奏相对单位经济模型偏快，融资环境转冷后现金流断裂。'
FROM cases
WHERE slug = 'airlift';
