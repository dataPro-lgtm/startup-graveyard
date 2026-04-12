-- Timeline events for WeWork, Theranos, Clubhouse
BEGIN;

-- WeWork timeline
WITH c AS (SELECT id FROM cases WHERE slug = 'wework')
INSERT INTO timeline_events (id, case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT gen_random_uuid(), c.id, v.event_date::date, v.event_type, v.title, v.description, v.amount_usd, v.sort_order
FROM c, (VALUES
  ('2010-01-01', 'founded',        'WeWork 成立',               '共同创始人 Adam Neumann 和 Miguel McKelvey 在纽约创立 WeWork，提供共享办公空间。',              NULL,           1),
  ('2014-06-01', 'funding',        'D 轮融资 3.55 亿美元',      '获得 T. Rowe Price、Goldman Sachs 等机构投资，估值达 15 亿美元，正式跻身独角兽行列。',      355000000,      2),
  ('2017-08-01', 'funding',        '软银首次投资 44 亿美元',    '软银通过愿景基金注资 44 亿美元，估值飙升至 200 亿美元，为全球联合办公市场注入最大单笔融资。', 4400000000,     3),
  ('2019-01-01', 'funding',        '软银追加投资，估值 470 亿', '软银再度注资后估值达到 470 亿美元历史峰值，Neumann 个人套现 7 亿美元。',                   2000000000,     4),
  ('2019-08-14', 'product_launch', 'IPO 招股说明书发布',        'WeWork 提交 S-1 文件，巨额亏损（2018 年净亏损 19 亿美元）和 Neumann 自我交易细节引发强烈质疑。', NULL,          5),
  ('2019-09-30', 'pivot',          'IPO 撤回，Neumann 离职',    '估值从 470 亿骤降至 80 亿，Neumann 被迫辞去 CEO，软银接管注资 95 亿救火。',                 NULL,           6),
  ('2023-11-07', 'shutdown',       '申请破产保护',              '在利率上升和混合办公趋势冲击下，WeWork 正式向法院申请 Chapter 11 破产保护。',                 NULL,           7)
) AS v(event_date, event_type, title, description, amount_usd, sort_order)
ON CONFLICT DO NOTHING;

-- Theranos timeline
WITH c AS (SELECT id FROM cases WHERE slug = 'theranos')
INSERT INTO timeline_events (id, case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT gen_random_uuid(), c.id, v.event_date::date, v.event_type, v.title, v.description, v.amount_usd, v.sort_order
FROM c, (VALUES
  ('2003-01-01', 'founded',        'Theranos 成立',                'Elizabeth Holmes 19 岁从斯坦福辍学创立，宣称开发出只需指尖几滴血即可完成大量检测的革命性技术。', NULL,       1),
  ('2010-01-01', 'funding',        '累计融资破 4 亿美元',          '获得多轮机构和个人投资，投资人包括 Draper Fisher 等风险基金，估值持续攀升。',                  400000000,  2),
  ('2013-09-01', 'product_launch', 'Walgreens 门店正式上线',        '与 Walgreens 合作在全美数百家门店推出血液检测服务，并宣称检测价格仅为传统实验室的十分之一。', NULL,       3),
  ('2014-06-01', 'funding',        '估值达 90 亿美元',              '新一轮融资后 Theranos 估值达到 90 亿峰值，Holmes 登上《福布斯》等封面，被誉为"女版乔布斯"。', 500000000,  4),
  ('2015-10-16', 'regulatory',     '《华尔街日报》报道揭露造假',    'WSJ 记者 John Carreyrou 调查报道揭露 Theranos 核心技术存在重大缺陷，实验室大量依赖西门子传统设备。', NULL,  5),
  ('2016-07-01', 'regulatory',     'CMS 撤销实验室认证',           '联邦医疗保险和医疗补助服务中心（CMS）撤销 Theranos 实验室认证，禁止 Holmes 运营实验室两年。', NULL,      6),
  ('2018-09-05', 'shutdown',       '公司正式解散',                 'SEC 指控欺诈投资者后，Holmes 同意缴纳罚款并被禁止担任上市公司董事，公司随即解散。',           NULL,       7)
) AS v(event_date, event_type, title, description, amount_usd, sort_order)
ON CONFLICT DO NOTHING;

-- Clubhouse timeline
WITH c AS (SELECT id FROM cases WHERE slug = 'clubhouse')
INSERT INTO timeline_events (id, case_id, event_date, event_type, title, description, amount_usd, sort_order)
SELECT gen_random_uuid(), c.id, v.event_date::date, v.event_type, v.title, v.description, v.amount_usd, v.sort_order
FROM c, (VALUES
  ('2020-03-01', 'founded',        'Clubhouse 上线（邀请制内测）', 'Paul Davison 和 Rohan Seth 在 COVID 封锁初期推出音频社交 App，邀请制策略迅速制造稀缺感和 FOMO。', NULL,       1),
  ('2021-01-01', 'funding',        'B 轮融资 1 亿美元',            '估值达 10 亿美元，不到一年跻身独角兽，MAU 一度突破 1000 万，Elon Musk 入室直播引爆全球关注。',  100000000,  2),
  ('2021-04-01', 'funding',        'C 轮估值 40 亿美元',           'Andreessen Horowitz 领投，Clubhouse 估值升至 40 亿美元峰值，Android 版本上线后下载量迅速见顶。',  NULL,       3),
  ('2021-05-01', 'competition',    'Twitter Spaces 全面开放',      'Twitter 向所有用户开放 Spaces 功能，Spotify Live、Facebook Live Audio 等平台相继推出类似产品，Clubhouse 护城河瞬间消失。', NULL, 4),
  ('2021-12-01', 'pivot',          '疫情红利消退，DAU 断崖下滑',   '随疫情封控结束，线下社交恢复，Clubhouse 日活跌幅超 80%，留存数据远低于预期。',              NULL,       5),
  ('2023-04-01', 'layoff',         '裁员 50%，转型小团队路线',     '公司裁减约 50% 员工，CEO 承认"增长停滞"，宣布向更小规模、更亲密的社交产品转型。',          NULL,       6)
) AS v(event_date, event_type, title, description, amount_usd, sort_order)
ON CONFLICT DO NOTHING;

COMMIT;
