-- Baseline Copilot eval dataset

INSERT INTO copilot_eval_cases (
  slug,
  title,
  question,
  pinned_case_slugs,
  expected_case_slugs,
  expected_grounded,
  expected_fallback_reason,
  notes,
  status
)
VALUES
  (
    'airlift-why-failed',
    'Airlift root cause recall',
    'Airlift 为什么会失败？',
    ARRAY['airlift']::citext[],
    ARRAY['airlift']::citext[],
    NULL,
    NULL,
    '基础单案例回忆，使用 pinned context 验证 prompt 对 Airlift 归因是否稳定。',
    'active'
  ),
  (
    'pakistan-mobility-compare',
    'Pakistan mobility cluster comparison',
    '比较 Airlift 和 QuickRide 的失败共性。',
    ARRAY['airlift', 'quickride-pk']::citext[],
    ARRAY['airlift', 'quickride-pk']::citext[],
    NULL,
    NULL,
    '验证显式双案例问题在固定上下文下是否至少引用 Airlift 和 QuickRide。',
    'active'
  ),
  (
    'no-relevant-cases-fallback',
    'No relevant case fallback',
    'zzzzqxjvnotarealstartuppattern 为什么会失败？',
    ARRAY[]::citext[],
    ARRAY[]::citext[],
    false,
    'no_relevant_cases',
    '验证知识库缺失时的 fallback 行为和无引用输出。',
    'active'
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  question = EXCLUDED.question,
  pinned_case_slugs = EXCLUDED.pinned_case_slugs,
  expected_case_slugs = EXCLUDED.expected_case_slugs,
  expected_grounded = EXCLUDED.expected_grounded,
  expected_fallback_reason = EXCLUDED.expected_fallback_reason,
  notes = EXCLUDED.notes,
  status = EXCLUDED.status,
  updated_at = NOW();
