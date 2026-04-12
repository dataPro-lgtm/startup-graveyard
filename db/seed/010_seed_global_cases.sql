-- ── 批量新增 20 个全球知名创业失败案例 ────────────────────────────────────────
-- 覆盖更多行业、国家和失败模式，丰富案例库

-- 1. Pets.com (US, ecommerce, 2000)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'pets-com',
  'Pets.com',
  '互联网泡沫时代最具代表性的失败案例之一。Pets.com 以低于成本的价格销售宠物用品，靠大规模营销（包括超级碗广告）吸引眼球，却从未建立可持续的商业模式。公司在 2000 年 3 月 IPO，9 个月后即告破产清算。',
  'US', 'ecommerce', 2000, 1998, 82000000, 'b2c',
  'unit_economics', 'published',
  'pets.com 宠物用品 互联网泡沫 dot-com 超级碗广告 IPO 破产',
  '["每件商品亏损出售无法靠规模解决单位经济学问题", "品牌知名度不能掩盖根本商业模式缺陷", "IPO 不等于商业成功，资本市场热情会迅速消退", "物流和配送成本是电商核心竞争壁垒"]'
) ON CONFLICT (slug) DO NOTHING;

-- 2. Webvan (US, logistics/grocery, 2001)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'webvan',
  'Webvan',
  '在电商基础设施尚不成熟的 1990 年代末，Webvan 试图颠覆杂货配送行业。公司耗资数亿美元建造先进仓储设施，却低估了客户获取成本和配送密度问题。2001 年申请破产时，已烧掉逾 12 亿美元。',
  'US', 'logistics', 2001, 1996, 1200000000, 'b2c',
  'premature_scaling', 'published',
  'webvan 生鲜配送 互联网泡沫 仓储 最后一公里 过早扩张',
  '["过早大规模投入固定资产基础设施，没有验证需求", "生鲜配送需要极高的配送密度才能盈利", "先验证单城市模型再扩张，而非同步多城市铺开", "技术优先不等于忽视供应链运营复杂度"]'
) ON CONFLICT (slug) DO NOTHING;

-- 3. Friendster (US, social, 2015)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'friendster',
  'Friendster',
  'Friendster 是最早的大众社交网络之一，比 Facebook 早三年。然而技术架构无法支撑快速增长的用户，频繁宕机让用户转向 MySpace 和后来的 Facebook。管理层拒绝了 Google 3000 万美元的收购要约，最终以不到 1 亿美元卖给 MOL Global。',
  'US', 'social', 2015, 2002, 50000000, 'b2c',
  'technical_debt', 'published',
  'friendster 社交网络 MySpace Facebook 技术债务 用户流失 收购',
  '["技术架构必须能支撑产品成功后的规模，否则成功本身会摧毁产品", "拒绝早期收购要评估自身能否保持领先地位", "用户体验（加载速度）是社交平台的核心留存因素", "先发优势只有技术执行力配合才有意义"]'
) ON CONFLICT (slug) DO NOTHING;

-- 4. MySpace (US, social, 2011)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'myspace',
  'MySpace',
  'MySpace 曾是全球最大社交网络，2006 年月活跃用户超过 1 亿。被新闻集团以 5.8 亿美元收购后，公司陷入官僚化，过度商业化的广告策略破坏了用户体验，最终被 Facebook 全面超越。2011 年以 3500 万美元出售。',
  'US', 'social', 2011, 2003, 100000000, 'advertising',
  'product_market_fit', 'published',
  'myspace 社交网络 Facebook 新闻集团 收购 用户体验 广告',
  '["大公司收购后官僚化会扼杀产品创新速度", "过度商业化和广告轰炸会驱走用户", "平台开放性和用户自定义不等于良好体验", "社交网络的网络效应一旦反转很难逆转"]'
) ON CONFLICT (slug) DO NOTHING;

-- 5. Color Labs (US, social, 2012)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'color-labs',
  'Color Labs',
  'Color Labs 在 2011 年发布前就获得 4100 万美元融资，创下当时 A 轮纪录。这款基于位置的照片分享应用从未找到用户需求，产品上线后用户寥寥，一年内大规模裁员，最终以未公开价格被 Apple 收购团队。',
  'US', 'social', 2012, 2011, 41000000, 'b2c',
  'product_market_fit', 'published',
  'color labs 照片分享 位置社交 A轮融资 创纪录 产品市场契合',
  '["巨额融资不能替代产品验证，反而可能掩盖根本问题", "先融资后验证会导致过度工程化", "没有冷启动策略的社交应用很难突破临界用户规模", "创始人光环不能弥补产品缺乏差异化的问题"]'
) ON CONFLICT (slug) DO NOTHING;

-- 6. Yik Yak (US, social, 2017)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'yik-yak',
  'Yik Yak',
  'Yik Yak 是一款匿名本地化社交应用，在大学校园爆红。高峰期月活超 170 万，估值达 4 亿美元。然而匿名带来的网络霸凌和骚扰问题促使多所大学封锁应用，公司试图取消匿名功能却失去了核心用户，被 Square 以约 100 万美元收购。',
  'US', 'social', 2017, 2013, 73500000, 'advertising',
  'regulatory', 'published',
  'yik yak 匿名社交 校园 网络霸凌 Square 收购',
  '["匿名功能带来的负外部性会成为产品存亡的威胁", "核心差异化特性一旦去除，产品往往失去存在意义", "校园爆红不等于具备可持续扩展到更广泛用户群的能力", "监管和社会压力可以比竞争对手更快摧毁产品"]'
) ON CONFLICT (slug) DO NOTHING;

-- 7. Zynga (US, gaming, 2015 decline)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'zynga',
  'Zynga（衰落期）',
  'Zynga 依靠 Facebook 平台的《FarmVille》等游戏一度成为最大社交游戏公司，2011 年 IPO 估值 70 亿美元。然而过度依赖 Facebook 平台、移动转型迟缓、文化毒性和大规模裁员使公司股价跌去 70%，成为平台依赖风险的典型案例。',
  'US', 'gaming', 2015, 2007, 1000000000, 'freemium',
  'platform_dependency', 'published',
  'zynga farmville facebook 社交游戏 平台依赖 移动转型 IPO',
  '["过度依赖单一平台是生死级别的风险", "平台方规则变化可以一夜间摧毁业务", "移动端转型不能依靠收购解决，需要从根本重构能力", "公司文化问题如不处理，会在困难时期加速崩溃"]'
) ON CONFLICT (slug) DO NOTHING;

-- 8. Fab.com already exists, skip

-- 9. Gilt Groupe (US, ecommerce, 2016)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'gilt-groupe',
  'Gilt Groupe',
  'Gilt 在 2007-2013 年间是奢侈品限时特卖电商的代名词，估值一度达 10 亿美元，被视为独角兽。然而奢侈品牌逐渐自建直销渠道，竞争对手蜂拥而入，公司的折扣定位伤害了品牌形象。2016 年以 2.5 亿美元出售给 Hudson''s Bay Company。',
  'US', 'ecommerce', 2016, 2007, 286000000, 'b2c',
  'competition', 'published',
  'gilt groupe 奢侈品 限时特卖 电商 独角兽 品牌损害 竞争',
  '["折扣模式长期伤害合作品牌的溢价形象，难以为继", "当供给方（品牌商）自建渠道时，中间商模式会被快速侵蚀", "低门槛商业模式（限时特卖）容易引发同质化竞争", "独角兽估值在商业模式未经证明时只是泡沫"]'
) ON CONFLICT (slug) DO NOTHING;

-- 10. Dinnr (UK, foodtech, 2014)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'dinnr',
  'Dinnr',
  'Dinnr 是英国一家食材配送初创公司，曾被视为 HelloFresh 的竞争者。创始人 Michal Bohanes 在公司关闭后罕见地公开了全部财务数据：产品方向从单次购买转向订阅制时已太晚，客户获取成本远超终身价值，2014 年关闭。其公开的失败复盘被创业社区广泛引用。',
  'GB', 'foodtech', 2014, 2013, 1000000, 'subscription',
  'unit_economics', 'published',
  'dinnr 食材配送 英国 订阅 CAC LTV 失败复盘 透明度',
  '["订阅转化率低会让前期高昂的获客成本永远无法回收", "食材配送的单位经济学需要极高的订阅留存率才能成立", "公开失败经验是对生态系统的贡献，值得鼓励", "创始人过早转型方向而不是深度挖掘初始验证方向"]'
) ON CONFLICT (slug) DO NOTHING;

-- 11. Boo.com (UK, ecommerce, 2000)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'boo-com',
  'Boo.com',
  'Boo.com 是 1990 年代末欧洲最知名的互联网创业失败。这家在线时尚零售商耗资 1.35 亿美元打造了当时技术最先进的购物网站（3D 虚拟模特），却忽视了大多数用户使用 56k 拨号网络无法流畅使用的现实。2000 年 5 月破产，成为教科书级案例。',
  'GB', 'ecommerce', 2000, 1998, 135000000, 'b2c',
  'product_market_fit', 'published',
  'boo.com 时尚电商 互联网泡沫 英国 技术超前 用户体验',
  '["技术超前于用户基础设施能力是致命错误", "炫技不能替代可用性，用户体验必须符合真实用户环境", "奢华办公和过度招聘会加速资金消耗", "欧洲多语言多货币运营比预期复杂得多"]'
) ON CONFLICT (slug) DO NOTHING;

-- 12. Wonga (UK, fintech, 2018)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'wonga',
  'Wonga',
  'Wonga 是英国发薪日贷款平台先驱，曾估值 10 亿美元，以技术驱动快速审批著称。然而 5000% 年化利率引发监管机构关注，2014 年英国金融行为监管局出手整治，赔偿丑闻和大量诉讼使公司于 2018 年破产清算。',
  'GB', 'fintech', 2018, 2006, 145000000, 'lending',
  'regulatory', 'published',
  'wonga 发薪日贷款 英国 金融监管 高利贷 FCA 消费者保护',
  '["建立在监管灰色地带的商业模式随时面临系统性风险", "短期高利率产品需要在设计阶段考虑社会责任", "监管变化速度远快于公司转型速度", "用户数据和算法优势无法对抗根本性的合规缺失"]'
) ON CONFLICT (slug) DO NOTHING;

-- 13. Solyndra (US, cleantech, 2011)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'solyndra',
  'Solyndra',
  'Solyndra 是美国太阳能电池板制造商，获得美国政府 5.35 亿美元贷款担保。然而中国厂商规模化生产导致硅板价格暴跌 75%，Solyndra 独特的圆柱形电池板技术的成本优势彻底消失。2011 年破产成为政治风波，引发对政府补贴科技公司的广泛讨论。',
  'US', 'cleantech', 2011, 2005, 1030000000, 'b2b',
  'competition', 'published',
  'solyndra 太阳能 清洁能源 政府补贴 中国竞争 硅板价格',
  '["单一技术路线押注需要对竞争格局变化保持高度敏感", "政府补贴可以掩盖竞争力不足问题，延迟而非避免失败", "大宗商品价格变化可以瞬间颠覆竞争优势", "清洁能源硬件公司面临制造业规模化的严酷竞争法则"]'
) ON CONFLICT (slug) DO NOTHING;

-- 14. Quirky (US, hardware, 2015)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'quirky',
  'Quirky',
  'Quirky 试图用众包模式颠覆硬件产品开发：任何人提交创意，社区投票，公司生产销售。这个理念吸引了 1.85 亿美元投资，却忽视了硬件开发的工程复杂性。平均每个产品开发周期 29 天，质量问题频发，2015 年申请破产。',
  'US', 'hardware', 2015, 2009, 185000000, 'marketplace',
  'operational', 'published',
  'quirky 众包 硬件 产品开发 创客 GE 合作 质量问题',
  '["众包创意不能解决硬件开发的工程复杂性和供应链挑战", "速度与质量的平衡在硬件领域比软件更难", "平台模式在需要深度专业知识的领域适用性有限", "大品牌合作（GE）带来的光环掩盖了根本运营问题"]'
) ON CONFLICT (slug) DO NOTHING;

-- 15. Skully (US, hardware, 2016)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'skully',
  'Skully',
  'Skully 打造了世界上第一款智能摩托车头盔，内置 AR 抬头显示和后视摄像头，众筹超过 240 万美元。然而创始人将公司资金用于个人挥霍（豪车、私人消费），产品延迟交付，最终以欺诈指控收场，2016 年破产时仍有数百名消费者未收到产品。',
  'US', 'hardware', 2016, 2012, 15000000, 'b2c',
  'governance', 'published',
  'skully 智能头盔 AR 摩托车 众筹 欺诈 创始人道德',
  '["创始人道德问题是最难预防但最具破坏性的风险", "众筹资金不等于验证了量产能力", "硬件产品从原型到量产的鸿沟被严重低估", "缺乏财务监督机制的初创公司极易出现资金滥用"]'
) ON CONFLICT (slug) DO NOTHING;

-- 16. Ofo (CN, mobility, 2019)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'ofo',
  'ofo 小黄车',
  'ofo 是共享单车大战中的主角之一，巅峰期在全球 20 个国家运营 1000 万辆单车，估值超过 30 亿美元。然而单车损耗率极高，用户押金池被挪作他用，补贴大战使单位经济学彻底崩溃。2018 年后资金断裂，退押金队伍绵延数公里，数百万用户至今未退款。',
  'CN', 'mobility', 2019, 2014, 2200000000, 'subscription',
  'unit_economics', 'published',
  'ofo 共享单车 押金 补贴战 滴滴 摩拜 中国 挪用资金',
  '["共享硬件的损耗成本是商业模式的核心约束，不能被增长数据掩盖", "用户押金是负债不是收入，挪用将形成系统性风险", "补贴大战打赢了竞争对手却同时摧毁了行业经济模型", "线下硬件运营需要完全不同于软件的能力体系"]'
) ON CONFLICT (slug) DO NOTHING;

-- 17. Luckin Coffee 早期财务造假（CN, foodtech, 2020 scandal）
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'luckin-coffee',
  '瑞幸咖啡（财务造假）',
  '瑞幸咖啡以惊人速度扩张，18 个月完成 IPO，被包装为"中国星巴克挑战者"。然而 2020 年自查报告揭示虚构 22 亿元人民币销售额，做空机构浑水研究发布的 89 页报告早已预警。股价单日暴跌 75%，退出纳斯达克，多位高管被刑事调查。',
  'CN', 'foodtech', 2020, 2017, 865000000, 'b2c',
  'fraud', 'published',
  '瑞幸 luckin coffee 财务造假 浑水 做空 纳斯达克 中概股',
  '["数据驱动的扩张故事需要可独立核实的底层数据支撑", "单店经济模型不成立时，规模扩张只会放大亏损", "做空报告的详细指控值得认真对待而非单纯辟谣", "治理结构缺陷在公司高速扩张期往往被忽视直到暴雷"]'
) ON CONFLICT (slug) DO NOTHING;

-- 18. Katerra (US, construction tech, 2021)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'katerra',
  'Katerra',
  'Katerra 由麦肯锡合伙人和科技老兵联合创立，获得软银愿景基金逾 20 亿美元投资，试图用科技和垂直整合颠覆建筑行业。然而建筑行业的本地化复杂性、传统承包商关系网络和过于激进的扩张使公司持续亏损，2021 年申请破产。',
  'US', 'construction', 2021, 2015, 2000000000, 'b2b',
  'premature_scaling', 'published',
  'katerra 建筑科技 软银 垂直整合 供应链 愿景基金 承包商',
  '["传统行业的碎片化和本地化不是软件工程方法能轻易解决的", "资本充足不等于竞争优势，有时反而导致过度扩张", "软银愿景基金的投资方式（大额快速压注）在重资产行业失效", "颠覆性定位需要认真研究被颠覆行业的深层运作逻辑"]'
) ON CONFLICT (slug) DO NOTHING;

-- 19. Fast (US, fintech, 2022)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'fast-co',
  'Fast',
  'Fast 提供一键结账服务，2021 年估值 5.8 亿美元，曾获 Stripe 领投。然而公司每月烧掉 1000 万美元，年收入仅约 60 万美元，收入支出比达 1:200。在融资市场收紧的 2022 年，公司宣布关闭仅用时 24 小时，成为泡沫时代的典型案例。',
  'US', 'fintech', 2022, 2019, 124500000, 'saas',
  'unit_economics', 'published',
  'fast 一键结账 stripe 电商 结账体验 烧钱 融资寒冬',
  '["年收入 60 万美元、月烧 1000 万美元的公司在低利率时代可以融资，利率正常化后迅速死亡", "支付和结账场景有极高的平台方垄断倾向，独立创业者很难切入", "B2B2C 模式需要同时说服商家和消费者，获客成本双倍", "宏观环境变化（加息）会让商业模式的缺陷变得无法掩盖"]'
) ON CONFLICT (slug) DO NOTHING;

-- 20. Convoy (US, logistics, 2023)
INSERT INTO cases (slug, company_name, summary, country_code, industry_key,
  closed_year, founded_year, total_funding_usd, business_model_key,
  primary_failure_reason_key, status, search_tags, key_lessons)
VALUES (
  'convoy',
  'Convoy',
  'Convoy 是数字货运中介平台，获得 Jeff Bezos、比尔盖茨等知名投资人超过 9 亿美元投资，估值一度达 38 亿美元。然而 2022 年运费价格暴跌叠加融资市场收紧，公司无法实现盈利，2023 年 10 月突然宣布关闭，数百名员工当天失业。',
  'US', 'logistics', 2023, 2015, 900000000, 'marketplace',
  'market_timing', 'published',
  'convoy 数字货运 卡车 物流 市场周期 融资寒冬 Amazon Bezos',
  '["周期性行业的创业公司需要在上行周期储备足够的资本度过下行", "大宗商品价格驱动的市场会让双边平台的撮合价值剧烈波动", "明星投资人站台不代表商业模式验证", "重资产物流创业需要更保守的扩张节奏"]'
) ON CONFLICT (slug) DO NOTHING;

-- Update status to published for all new entries (should already be published)
-- Verify all are published
UPDATE cases SET status = 'published' WHERE slug IN (
  'pets-com', 'webvan', 'friendster', 'myspace', 'color-labs',
  'yik-yak', 'zynga', 'gilt-groupe', 'dinnr', 'boo-com',
  'wonga', 'solyndra', 'quirky', 'skully', 'ofo',
  'luckin-coffee', 'katerra', 'fast-co', 'convoy'
) AND status != 'published';
