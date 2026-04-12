-- 时间线事件 seed：为所有案例补充关键事件节点
-- 依赖：migration 0004（timeline_events 表）+ seed 001/005（案例数据）
BEGIN;

-- ── Airlift ──────────────────────────────────────────────────────────────────
INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2019-03-01', 'founded',   'Airlift 成立', '由 Usman Gul 等人在卡拉奇创立，定位于巴基斯坦出行/物流平台。', NULL, 10
FROM cases c WHERE c.slug = 'airlift';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2019-06-01', 'funding', 'Pre-Seed / Seed 轮融资', '获得 200 万美元种子轮融资，切入卡拉奇公共汽车通勤市场。', 2000000, 20
FROM cases c WHERE c.slug = 'airlift';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2020-08-01', 'funding', 'Series A 融资 $12M', '由 First Round Capital 领投完成 1200 万美元 A 轮融资。', 12000000, 30
FROM cases c WHERE c.slug = 'airlift';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2021-01-01', 'pivot', '战略转型：从出行转向即时零售', '将核心业务从共乘出行切换至 30 分钟快速商超配送（Q-Commerce）。', NULL, 40
FROM cases c WHERE c.slug = 'airlift';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2021-08-01', 'funding', 'Series B 融资 $85M', '完成 8500 万美元 B 轮，估值约 2.75 亿美元，计划扩张至孟加拉国等市场。', 85000000, 50
FROM cases c WHERE c.slug = 'airlift';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2022-07-12', 'shutdown', '宣布关闭', '融资环境骤冷，资金耗尽，Airlift 发布公开信宣布立即停止所有服务。', NULL, 60
FROM cases c WHERE c.slug = 'airlift';

-- ── Quibi ─────────────────────────────────────────────────────────────────────
INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2018-01-01', 'founded', 'Quibi 成立', 'Jeffrey Katzenberg（梦工厂联合创始人）与 Meg Whitman（前惠普 CEO）共同创立。', NULL, 10
FROM cases c WHERE c.slug = 'quibi';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2018-08-01', 'funding', '完成 10 亿美元初始融资', '从迪士尼、NBC、华纳等主要媒体公司募集 10 亿美元。', 1000000000, 20
FROM cases c WHERE c.slug = 'quibi';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2020-01-01', 'funding', '追加融资至 17.5 亿美元', '在 CES 大会前完成最后一轮融资，总额达到 17.5 亿美元。', 750000000, 30
FROM cases c WHERE c.slug = 'quibi';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2020-04-06', 'product_launch', 'Quibi 正式上线', '推出 iOS/Android App，初始订阅价 4.99 美元/月（广告版）或 7.99 美元/月（无广告版）。', NULL, 40
FROM cases c WHERE c.slug = 'quibi';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2020-10-21', 'shutdown', '宣布关闭', '上线仅 6 个月，日活用户不足 170 万，宣布关闭并向投资方退还剩余约 3.5 亿美元现金。', NULL, 50
FROM cases c WHERE c.slug = 'quibi';

-- ── Juicero ────────────────────────────────────────────────────────────────────
INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2013-01-01', 'founded', 'Juicero 成立', '由厨师 Doug Evans 在旧金山创立，目标打造"特斯拉级别"的家用榨汁机。', NULL, 10
FROM cases c WHERE c.slug = 'juicero';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2016-03-01', 'funding', '完成 1.2 亿美元融资', '获 Google Ventures、Kleiner Perkins 等顶级 VC 投资，估值约 2.7 亿美元。', 120000000, 20
FROM cases c WHERE c.slug = 'juicero';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2016-04-01', 'product_launch', '榨汁机上市，售价 $699', '首款产品上市，需配合专属果汁包使用，包月订阅 5-8 美元。', NULL, 30
FROM cases c WHERE c.slug = 'juicero';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2017-04-19', 'regulatory', 'Bloomberg 报道"手挤事件"', 'Bloomberg 记者发现可直接用手挤压果汁包，无需使用机器，报道引发全球嘲讽。', NULL, 40
FROM cases c WHERE c.slug = 'juicero';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2017-09-01', 'shutdown', '宣布关闭并全额退款', '报道后仅 5 个月，公司宣布停产并为所有机器提供全额退款。', NULL, 50
FROM cases c WHERE c.slug = 'juicero';

-- ── Rdio ──────────────────────────────────────────────────────────────────────
INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2008-08-01', 'founded', 'Rdio 成立', '由 Skype 联合创始人 Janus Friis 和 Niklas Zennström 创立，总部旧金山。', NULL, 10
FROM cases c WHERE c.slug = 'rdio';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2010-08-01', 'product_launch', 'Rdio 正式上线', '以社交音乐流媒体为特色在美国上线，支持 PC 和手机客户端。', NULL, 20
FROM cases c WHERE c.slug = 'rdio';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2011-07-01', 'funding', '获 RIM（黑莓）1500 万美元战略投资', '与 RIM 达成战略合作，为黑莓设备提供独家音乐服务。', 15000000, 30
FROM cases c WHERE c.slug = 'rdio';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2011-07-14', 'product_launch', 'Spotify 进入美国市场', 'Spotify 以免费层+社交分享策略登陆美国，快速蚕食 Rdio 用户群。', NULL, 35
FROM cases c WHERE c.slug = 'rdio';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2015-06-30', 'product_launch', 'Apple Music 正式上线', 'Apple 推出与 iOS 深度集成的 Apple Music，对独立音乐 App 形成平台级冲击。', NULL, 40
FROM cases c WHERE c.slug = 'rdio';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2015-11-17', 'shutdown', '申请破产，Pandora 收购核心资产', '以 7500 万美元出售核心技术资产给 Pandora，品牌随即关闭。', 75000000, 50
FROM cases c WHERE c.slug = 'rdio';

-- ── Fab.com ──────────────────────────────────────────────────────────────────
INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2010-06-01', 'founded', 'Fab.com 成立（前身 Fabulis）', '最初定位 LGBTQ 社交网络，随后于 2011 年转型为设计品闪购平台。', NULL, 10
FROM cases c WHERE c.slug = 'fab-com';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2012-06-01', 'funding', 'Series C 融资 $1.05 亿', '完成 C 轮融资，估值突破 10 亿美元，成为 DTC 电商领域独角兽。', 105000000, 20
FROM cases c WHERE c.slug = 'fab-com';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2013-01-01', 'pivot', '激进扩张欧洲，收购 Casacanda', '收购德国设计电商 Casacanda，以仓储自营模式在欧洲布局，运营成本剧增。', NULL, 30
FROM cases c WHERE c.slug = 'fab-com';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2013-09-01', 'layoff', '裁员 440 人（全球团队约 40%）', '业务收缩，宣布大规模裁员，放弃欧洲多个市场。', NULL, 40
FROM cases c WHERE c.slug = 'fab-com';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2015-03-01', 'acquisition', '以 1500 万美元出售给 PCH', '最终以相当于融资额 4.5% 的价格贱卖，标志着这轮估值泡沫的终结。', 15000000, 50
FROM cases c WHERE c.slug = 'fab-com';

-- ── Jawbone ──────────────────────────────────────────────────────────────────
INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '1999-01-01', 'founded', 'Jawbone 成立（原名 AliphCom）', '创始人 Hosain Rahman 创立，早期专注蓝牙耳机，后转型可穿戴健康设备。', NULL, 10
FROM cases c WHERE c.slug = 'jawbone';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2011-10-01', 'product_launch', 'UP 健康手环发布', '首款活动追踪手环上市，但因大规模硬件缺陷被迫召回，免费更换所有产品。', NULL, 20
FROM cases c WHERE c.slug = 'jawbone';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2014-01-01', 'funding', '融资至 9 亿美元，估值 30 亿', '完成多轮大额融资，估值达消费硬件领域最高点之一。', 300000000, 30
FROM cases c WHERE c.slug = 'jawbone';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2015-04-24', 'product_launch', 'Apple Watch 发布', 'Apple Watch 上市，Jawbone 直接面对拥有平台生态优势的竞争对手。', NULL, 40
FROM cases c WHERE c.slug = 'jawbone';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2016-01-01', 'pivot', '尝试转型医疗级可穿戴', '宣布暂停消费者手环业务，转向面向医疗机构的临床级设备，转型未能完成。', NULL, 50
FROM cases c WHERE c.slug = 'jawbone';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2017-07-01', 'shutdown', '公司清盘，资产转移至新医疗公司', '在无力偿债的情况下宣告清盘，创始人另立新公司接收核心技术资产。', NULL, 60
FROM cases c WHERE c.slug = 'jawbone';

-- ── Vine ─────────────────────────────────────────────────────────────────────
INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2012-06-01', 'founded', 'Vine 成立', '由 Dom Hofmann 等人创立，专注于 6 秒循环视频创作分享。', NULL, 10
FROM cases c WHERE c.slug = 'vine';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2012-10-01', 'acquisition', 'Twitter 上市前收购', '产品尚未正式发布即被 Twitter 以约 3000 万美元收购。', 30000000, 20
FROM cases c WHERE c.slug = 'vine';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2013-01-01', 'product_launch', 'Vine App 正式上线', '以 6 秒短视频为核心格式登陆 iOS，首月即成为 App Store 免费榜第一。', NULL, 30
FROM cases c WHERE c.slug = 'vine';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2015-10-01', 'other', '顶级创作者集体要求分成被拒', '数十位顶级创作者要求每人 120 万美元保底 + 收益分成，Twitter 拒绝，创作者陆续出走 YouTube。', NULL, 40
FROM cases c WHERE c.slug = 'vine';

INSERT INTO timeline_events (case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT c.id, '2016-10-27', 'shutdown', 'Twitter 宣布关闭 Vine', '在大规模裁员计划中，Vine 被宣布关闭；2017 年 1 月网站最终下线。', NULL, 50
FROM cases c WHERE c.slug = 'vine';

COMMIT;
