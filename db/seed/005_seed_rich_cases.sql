-- 丰富案例 seed：8 个有代表性的真实创业失败案例
-- 依赖：migration 0004（timeline_events, published_at）
BEGIN;

-- ─────────────────────────────────────────────
-- 1. Quibi — 移动流媒体平台
-- ─────────────────────────────────────────────
INSERT INTO cases (
  slug, company_name, summary,
  country_code, industry_key, business_model_key,
  founded_year, closed_year, total_funding_usd,
  primary_failure_reason_key, status, published_at
) VALUES (
  'quibi',
  'Quibi',
  '由 Jeffrey Katzenberg 和 Meg Whitman 联合创立，定位于"手机竖屏短剧"流媒体平台，烧光 17.5 亿美元融资后仅存活 6 个月即宣告关闭。COVID-19 导致通勤场景消失、竖屏内容被 TikTok / YouTube 免费替代、产品缺乏社交分享机制，多重失败因素叠加。',
  'US', 'media', 'subscription',
  2018, 2020, 1750000000,
  'product_market_fit', 'published', NOW()
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Market', 'product_market_fit', 'wrong_consumption_context', 0.90,
  '核心使用场景（通勤）因 COVID-19 消失；竖屏短剧需求被免费平台充分满足，用户付费意愿极低。'
FROM cases WHERE slug = 'quibi' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Product', 'missing_social_features', NULL, 0.70,
  '用户无法截图、无法分享片段到社交媒体，错失病毒传播与口碑增长。'
FROM cases WHERE slug = 'quibi' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Finance', 'premature_scaling', 'content_cost_overrun', 0.75,
  '在验证用户需求之前斥资超 10 亿美元购买内容版权，固定成本过高无法收缩。'
FROM cases WHERE slug = 'quibi' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'media',
  'Quibi, the Short-Form Streaming Service, Shutting Down',
  'https://www.nytimes.com/2020/10/21/business/media/quibi-shutting-down.html',
  'The New York Times', 'high',
  'Quibi, the short-form mobile video service that raised $1.75 billion... is shutting down.'
FROM cases WHERE slug = 'quibi' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'founder_postmortem',
  'Katzenberg & Whitman Letter to Investors',
  'https://www.wsj.com/articles/quibi-is-shutting-down-11603294800',
  'Wall Street Journal', 'high',
  'Jeffrey Katzenberg blamed the coronavirus pandemic as "one of the main reasons" for the failure.'
FROM cases WHERE slug = 'quibi' ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. Juicero — 智能榨汁机
-- ─────────────────────────────────────────────
INSERT INTO cases (
  slug, company_name, summary,
  country_code, industry_key, business_model_key,
  founded_year, closed_year, total_funding_usd,
  primary_failure_reason_key, status, published_at
) VALUES (
  'juicero',
  'Juicero',
  '获得谷歌风投等 1.2 亿美元投资的"互联网榨汁机"，售价 700 美元。Bloomberg 报道用手直接挤压配套果汁包效果与机器相同后，公司形象崩溃，3 个月后关闭。',
  'US', 'hardware', 'hardware',
  2013, 2017, 120000000,
  'product_market_fit', 'published', NOW()
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Product', 'unnecessary_product', NULL, 0.95,
  '核心功能（挤果汁包）可用双手替代，机器提供的价值仅为"联网"，消费者感知价值与 700 美元售价严重不符。'
FROM cases WHERE slug = 'juicero' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Market', 'pricing_mismatch', NULL, 0.80,
  '消费者硬件市场对高溢价接受度极低，订阅耗材模式在价值感知崩溃后无法维持。'
FROM cases WHERE slug = 'juicero' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'media',
  'Bloomberg: Juicero''s $400 Juicer Is Even Sillier Than We Thought',
  'https://www.bloomberg.com/news/features/2017-04-19/silicon-valley-s-400-juicer-may-be-feeling-the-squeeze',
  'Bloomberg', 'high',
  'Bloomberg found the packets could be squeezed by hand — no $400 machine required.'
FROM cases WHERE slug = 'juicero' ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 3. Rdio — 音乐流媒体
-- ─────────────────────────────────────────────
INSERT INTO cases (
  slug, company_name, summary,
  country_code, industry_key, business_model_key,
  founded_year, closed_year, total_funding_usd,
  primary_failure_reason_key, status, published_at
) VALUES (
  'rdio',
  'Rdio',
  '早于 Spotify 进入美国市场的音乐流媒体服务，设计精良但最终在 Spotify 和 Apple Music 的双重压力下破产，以 7500 万美元被 Pandora 收购拆解。',
  'US', 'saas', 'subscription',
  2008, 2015, 175000000,
  'competition', 'published', NOW()
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Competitive', 'better_funded_competitor', 'spotify_market_entry', 0.85,
  'Spotify 以更激进的免费层+付费转化策略进入美国，用户获取成本远低于 Rdio。'
FROM cases WHERE slug = 'rdio' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Market', 'platform_competition', 'apple_music_launch', 0.70,
  'Apple Music 2015 年上线，借助 iOS 预装优势大幅挤压独立音乐 App 生存空间。'
FROM cases WHERE slug = 'rdio' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Finance', 'unit_economics', 'label_licensing_cost', 0.75,
  '唱片版权费占收入比例持续高于 70%，无法通过规模摊薄；免费层用户转化率不足。'
FROM cases WHERE slug = 'rdio' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'official_notice',
  'Rdio Files for Bankruptcy, Pandora to Acquire Key Assets for $75M',
  'https://techcrunch.com/2015/11/16/rdio-files-for-bankruptcy/',
  'TechCrunch', 'high',
  'Rdio has filed for bankruptcy protection... Pandora will acquire key assets for approximately $75 million.'
FROM cases WHERE slug = 'rdio' ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 4. Fab.com — 设计品闪购电商
-- ─────────────────────────────────────────────
INSERT INTO cases (
  slug, company_name, summary,
  country_code, industry_key, business_model_key,
  founded_year, closed_year, total_funding_usd,
  primary_failure_reason_key, status, published_at
) VALUES (
  'fab-com',
  'Fab.com',
  '快速成长为"全球最快增长的电商之一"，估值一度达 10 亿美元，随后激进扩张欧洲、转型失败、裁员数百人，最终以 1500 万美元贱卖。从 3.36 亿美元融资到清盘，历时不到 5 年。',
  'US', 'ecommerce', 'marketplace',
  2010, 2015, 336000000,
  'premature_scaling', 'published', NOW()
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Operational', 'premature_geographic_expansion', 'europe_expansion', 0.88,
  '在美国业务模型尚未验证的情况下激进扩张欧洲，运营成本急剧上升，两条战线同时失守。'
FROM cases WHERE slug = 'fab-com' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Product', 'pivot_failure', 'marketplace_to_inventory', 0.80,
  '从轻资产闪购平台转型为持有库存的全品类电商，商业模式根本性改变但团队和资金均未跟上。'
FROM cases WHERE slug = 'fab-com' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Finance', 'unit_economics', 'customer_acquisition_cost', 0.72,
  '单客户获取成本（CAC）持续飙升，留存率不足，LTV/CAC 比值严重失衡。'
FROM cases WHERE slug = 'fab-com' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'media',
  'Fab.com Sells Itself to PCH for $15M After Burning Through $336M',
  'https://techcrunch.com/2015/03/17/fab-com-sells-itself-to-pch-for-15m-after-raising-336m/',
  'TechCrunch', 'high',
  'Fab.com raised $336 million... and sold itself for $15 million, a fraction of its former valuation.'
FROM cases WHERE slug = 'fab-com' ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 5. Homejoy — 家政服务平台
-- ─────────────────────────────────────────────
INSERT INTO cases (
  slug, company_name, summary,
  country_code, industry_key, business_model_key,
  founded_year, closed_year, total_funding_usd,
  primary_failure_reason_key, status, published_at
) VALUES (
  'homejoy',
  'Homejoy',
  '按需家政服务平台，估值一度超过 3.8 亿美元。因工人分类诉讼（独立承包商 vs. 正式员工）风险和激进低价策略，被迫关闭。',
  'US', 'marketplace', 'marketplace',
  2012, 2015, 38000000,
  'regulatory', 'published', NOW()
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Regulatory', 'worker_classification_risk', 'contractor_vs_employee', 0.90,
  '四起集体诉讼要求将清洁工认定为正式员工，若败诉将产生数千万美元追溯薪资和福利负债，公司无力承担。'
FROM cases WHERE slug = 'homejoy' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Market', 'unit_economics', 'promotional_pricing', 0.75,
  '初始促销价每次仅收 19 美元，用户留存后绕开平台直接联系清洁工，平台抽佣收入无法支撑运营。'
FROM cases WHERE slug = 'homejoy' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'media',
  'Homejoy Shuts Down Citing Worker Misclassification Lawsuits',
  'https://techcrunch.com/2015/07/17/homejoy-shuts-down/',
  'TechCrunch', 'high',
  'Homejoy is shutting down... the company cited lawsuits challenging the employment status of its workers.'
FROM cases WHERE slug = 'homejoy' ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 6. Jawbone — 智能穿戴设备
-- ─────────────────────────────────────────────
INSERT INTO cases (
  slug, company_name, summary,
  country_code, industry_key, business_model_key,
  founded_year, closed_year, total_funding_usd,
  primary_failure_reason_key, status, published_at
) VALUES (
  'jawbone',
  'Jawbone',
  '曾估值 30 亿美元的可穿戴设备公司，累计融资 9 亿美元。在 Apple Watch、Fitbit 的双重夹击下，产品质量问题频发，资金链断裂后清盘，核心资产被以色列医疗健康公司收购。',
  'US', 'hardware', 'hardware',
  1999, 2017, 930000000,
  'competition', 'published', NOW()
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Competitive', 'platform_competition', 'apple_watch_fitbit', 0.85,
  'Apple Watch（2015）和 Fitbit 分别从高端和低端夹击，Jawbone 无差异化护城河。'
FROM cases WHERE slug = 'jawbone' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Product', 'hardware_quality_issues', 'reliability_defects', 0.80,
  'UP 系列手环多次出现大规模硬件故障，退货率高，品牌信誉受损。'
FROM cases WHERE slug = 'jawbone' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Finance', 'unit_economics', 'hardware_margin', 0.70,
  '硬件毛利率过低，无法支撑高研发与营销投入；软件订阅转型未能成功执行。'
FROM cases WHERE slug = 'jawbone' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'media',
  'Jawbone Is Dead. Here''s What We Can Learn From Its Demise.',
  'https://www.wareable.com/jawbone/jawbone-is-dead-heres-what-killed-it-257',
  'Wareable', 'high',
  'Jawbone raised nearly $1 billion in funding but ultimately could not compete with Apple and Fitbit.'
FROM cases WHERE slug = 'jawbone' ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 7. Beepi — 二手车电商
-- ─────────────────────────────────────────────
INSERT INTO cases (
  slug, company_name, summary,
  country_code, industry_key, business_model_key,
  founded_year, closed_year, total_funding_usd,
  primary_failure_reason_key, status, published_at
) VALUES (
  'beepi',
  'Beepi',
  '点对点二手车交易平台，获得 BBVA 等投资方 1.49 亿美元融资，估值达 5 亿美元。运营成本失控（员工每年人均成本超 30 万美元）叠加二手车物流高复杂度，最终资金耗尽解散。',
  'US', 'marketplace', 'marketplace',
  2013, 2017, 149000000,
  'operational', 'published', NOW()
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Operational', 'cost_structure_bloat', 'headcount_cost', 0.88,
  '公司员工年均成本超 30 万美元（含工资、福利、办公），人均产出无法覆盖支出。'
FROM cases WHERE slug = 'beepi' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Product', 'unit_economics', 'auto_logistics_complexity', 0.75,
  '二手车检测、运输、过户等环节固定成本极高，P2P 模型无法规模化摊薄边际成本。'
FROM cases WHERE slug = 'beepi' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'media',
  'Beepi, the Car-Selling Startup, Is Shutting Down',
  'https://www.wsj.com/articles/beepi-the-car-selling-startup-is-shutting-down-1488389098',
  'Wall Street Journal', 'high',
  'Beepi burned through most of its cash and struggled with high operating costs—spending $300,000 per employee annually.'
FROM cases WHERE slug = 'beepi' ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 8. Vine — 短视频社交
-- ─────────────────────────────────────────────
INSERT INTO cases (
  slug, company_name, summary,
  country_code, industry_key, business_model_key,
  founded_year, closed_year, total_funding_usd,
  primary_failure_reason_key, status, published_at
) VALUES (
  'vine',
  'Vine',
  '开创 6 秒循环短视频格式，被 Twitter 收购后用户和创作者快速增长。因 Twitter 战略摇摆、无法建立创作者变现体系，最终被 YouTube / Instagram / Snapchat 蚕食，2016 年宣布关停。',
  'US', 'social', 'advertising',
  2012, 2016, NULL,
  'team', 'published', NOW()
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Talent', 'creator_exodus', 'monetization_failure', 0.90,
  '顶级创作者多次要求平台分成均遭拒，集体转向 YouTube；平台失去头部内容后用户流失。'
FROM cases WHERE slug = 'vine' ON CONFLICT DO NOTHING;

INSERT INTO failure_factors (case_id, level_1_key, level_2_key, level_3_key, weight, explanation)
SELECT id, 'Operational', 'parent_company_strategy', 'twitter_neglect', 0.80,
  'Twitter 自身经营困难，削减 Vine 预算并多次换帅，产品功能迭代严重滞后于 Instagram Stories 等竞品。'
FROM cases WHERE slug = 'vine' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'media',
  'Twitter Is Shutting Down Vine',
  'https://techcrunch.com/2016/10/27/twitter-is-shutting-down-vine/',
  'TechCrunch', 'high',
  'Twitter announced today that it is shutting down Vine, the once-popular six-second video service.'
FROM cases WHERE slug = 'vine' ON CONFLICT DO NOTHING;

INSERT INTO evidence_sources (case_id, source_type, title, url, publisher, credibility_level, excerpt)
SELECT id, 'community',
  'The Demise of Vine: How Twitter Killed Its Most Promising Product',
  'https://medium.com/@vine-demise',
  'Medium / Various', 'medium',
  'Vine''s top creators asked Twitter for $1.2M each and revenue sharing in October 2015; Twitter declined.'
FROM cases WHERE slug = 'vine' ON CONFLICT DO NOTHING;

COMMIT;
