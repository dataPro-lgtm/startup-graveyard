-- 补充案例：WeWork、Theranos、Clubhouse
BEGIN;

-- WeWork
INSERT INTO cases (
  id, slug, status, company_name, summary,
  industry_key, country_code, closed_year, founded_year,
  total_funding_usd, business_model_key, primary_failure_reason_key,
  search_tags, key_lessons, published_at
) VALUES (
  gen_random_uuid(),
  'wework',
  'published',
  'WeWork',
  '共享办公空间独角兽，软银豪赌 180 亿美元，估值一度达 470 亿。2019 年 IPO 前夕因创始人 Adam Neumann 的治理丑闻和持续巨亏曝光，估值雪崩至 80 亿，被迫撤回上市。软银注资救火后公司艰难运营至 2023 年申请破产保护。',
  'real_estate',
  'US',
  2023,
  2010,
  18500000000,
  'saas',
  'governance',
  'WeWork 共享办公 联合办公 商业地产 软银 IPO失败 公司治理 创始人问题 估值泡沫 破产',
  '1. 科技溢价不能掩盖地产本质：WeWork 用科技公司叙事获得 SaaS 估值，但底层是长租短售的高风险地产套利，利率/衰退来临时商业模式立即崩塌。
2. 创始人崇拜是治理毒药：Adam Neumann 拥有超级投票权且自我交易（向公司出售"We"商标），缺乏制衡的治理结构加速了崩溃。
3. 软银式大额注资会扭曲增长优先级：单笔 100 亿美元注资让公司失去"必须盈利"的市场压力，将扩张速度置于单位经济学之上。
4. IPO 是终极透明度测试：上市前的尽职调查和公开披露义务曝光了所有之前被资本遮掩的问题，创业公司应提前按上市标准自查。',
  now()
) ON CONFLICT (slug) DO NOTHING;

-- Theranos
INSERT INTO cases (
  id, slug, status, company_name, summary,
  industry_key, country_code, closed_year, founded_year,
  total_funding_usd, business_model_key, primary_failure_reason_key,
  search_tags, key_lessons, published_at
) VALUES (
  gen_random_uuid(),
  'theranos',
  'published',
  'Theranos',
  '声称用几滴血即可完成数百项血液检测的医疗科技独角兽，融资 9 亿美元，估值峰值 90 亿。2015 年《华尔街日报》调查揭露其核心技术是谎言：实验室实为使用西门子设备、检测结果大量存在误差。创始人 Elizabeth Holmes 因欺诈罪被判 11 年监禁，公司 2018 年解散。',
  'healthtech',
  'US',
  2018,
  2003,
  900000000,
  'b2b_saas',
  'fraud',
  'Theranos 血液检测 医疗科技 欺诈 硅谷丑闻 Elizabeth Holmes 监管 FDA 生物技术',
  '1. 医疗产品的核实义务不可豁免：再好的故事都不能替代独立的临床验证，医疗投资者应强制要求第三方技术审计。
2. 秘密文化是欺诈的温床：Theranos 以"保护专利"为由拒绝一切外部验证，过度保密本身即为危险信号。
3. 名人董事会不等于技术验证：Kissinger、Mattis 等政界大佬的背书证明的是人际关系，不是技术可行性。
4. 监管不是障碍而是护城河：FDA 认证虽然耗时昂贵，但能过滤虚假技术，绕过监管的竞争优势终将反噬。',
  now()
) ON CONFLICT (slug) DO NOTHING;

-- Clubhouse
INSERT INTO cases (
  id, slug, status, company_name, summary,
  industry_key, country_code, closed_year, founded_year,
  total_funding_usd, business_model_key, primary_failure_reason_key,
  search_tags, key_lessons, published_at
) VALUES (
  gen_random_uuid(),
  'clubhouse',
  'published',
  'Clubhouse',
  '疫情期间爆红的音频社交平台，2021 年估值达 40 亿美元，MAU 一度破千万。疫情结束后线下社交回归、Twitter Spaces/Spotify 等大厂复制功能，用户量快速萎缩。2023 年裁员 50% 后转型为小团队产品，估值跌去逾 90%。',
  'social',
  'US',
  NULL,
  2020,
  110000000,
  'consumer',
  'competition',
  'Clubhouse 音频社交 语音社交 疫情红利 直播 社交媒体 Twitter Spaces 复制竞争 用户留存',
  '1. 疫情红利是假 PMF：COVID 封控期间的爆炸性增长掩盖了真实的用户留存问题，需在恢复正常后重新验证 PMF。
2. 无壁垒功能会被平台快速复制：纯粹的产品创新若无网络效应或数据飞轮支撑，会在 6-12 个月内被 Twitter/Spotify 等大厂免费复制。
3. 邀请制的稀缺感是有保质期的：邀请制制造了 FOMO 和初期增长，但稀缺感消失后若无内容生态支撑，用户会批量流失。
4. 实时内容无法沉淀：不可回放的对话无法形成内容库和搜索流量，导致新用户获取成本居高不下。',
  now()
) ON CONFLICT (slug) DO NOTHING;

COMMIT;
