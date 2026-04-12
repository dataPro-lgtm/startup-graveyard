-- 013_seed_timeline_cn.sql
-- Timeline events for 8 additional Chinese startup failure cases
-- Safe to re-run (ON CONFLICT DO NOTHING).

DO $$
DECLARE
  v_id UUID;
BEGIN

-- ─────────────────────────────────────────────
-- 乐视 LeEco
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'leeco';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2004-11-01', 'founding',   '乐视网成立',                  '贾跃亭在山西创立乐视网，最初是版权视频网站。', 1),
    (v_id, '2010-08-12', 'milestone',  '乐视网A股上市',               '在创业板上市，成为中国首家上市视频网站。', 2),
    (v_id, '2013-05-01', 'milestone',  '发布乐视超级电视',            '切入智能硬件，提出"平台+内容+终端+应用"生态概念。', 3),
    (v_id, '2015-01-01', 'funding',    '乐视体育独立融资',            '乐视体育A轮融资8亿元，押注足球等顶级版权。', 4),
    (v_id, '2016-01-01', 'milestone',  '全球七大生态全面铺开',        '手机、电视、汽车、体育、影业同步推进，贾跃亭提出"生态化反"。', 5),
    (v_id, '2016-11-02', 'problem',    '贾跃亭公开承认资金紧张',      '发内部信称"我们的生态在账面上已经严重失血"，股价暴跌。', 6),
    (v_id, '2017-05-01', 'problem',    '手机供应商停供讨债',          '供应链欠款超50亿元，代工厂和供应商集体上门追债。', 7),
    (v_id, '2017-07-01', 'shutdown',   '贾跃亭出走美国，公司崩塌',    '以"推进FF汽车融资"为由赴美，至今未归，留下逾百亿债务烂摊子。', 8)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- 蛋壳公寓
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'danke-apartment';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2015-03-01', 'founding',   '蛋壳公寓成立',                '高靖创立，以分散式长租公寓为模式切入北上深市场。', 1),
    (v_id, '2018-04-01', 'funding',    '获Tiger Global等3亿美元',     '资本涌入长租公寓赛道，蛋壳迅速扩张至40余城市。', 2),
    (v_id, '2020-01-17', 'milestone',  '纽交所IPO',                   '上市融资1.49亿美元，成为长租公寓第一股。', 3),
    (v_id, '2020-02-01', 'problem',    '疫情打击出租率',              '新冠疫情导致大量空置，运营成本无法覆盖，现金流急速恶化。', 4),
    (v_id, '2020-10-01', 'problem',    '大规模拖欠房东租金',          '资金池枯竭，开始拖欠房东款项，引发全国维权浪潮。', 5),
    (v_id, '2020-11-17', 'shutdown',   '宣告经营困难，实际倒闭',      '法院冻结账户，CEO出逃，数万房东房屋被迫对租客断供，引发社会事件。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- 暴风影音
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'baofeng';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2007-01-01', 'founding',   '暴风影音创立',                '冯鑫创立，以免费视频播放器起家，替代RealPlayer和Windows Media Player。', 1),
    (v_id, '2015-03-24', 'milestone',  'A股IPO连续29个涨停',          '上市后连续29个交易日涨停，市值最高超400亿，成为A股神话。', 2),
    (v_id, '2015-08-01', 'pivot',      '进军VR，发布暴风魔镜',        '高调宣布押注VR赛道，推出暴风魔镜系列头盔，股价应声大涨。', 3),
    (v_id, '2016-06-01', 'funding',    '65亿收购体育版权公司MPS',     '联合多家机构65亿元收购英国体育版权公司MPS，成为致命赌注。', 4),
    (v_id, '2017-12-01', 'problem',    'MPS破产，65亿打水漂',         'MPS宣告破产，65亿元投资几乎全额损失，暴风科技陷入巨额亏损。', 5),
    (v_id, '2019-07-28', 'shutdown',   '冯鑫被捕，公司停摆',          '实控人冯鑫因涉嫌对非国家工作人员行贿被捕，公司陷入瘫痪，旗下产品陆续下架。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- 锤子科技
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'smartisan';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2012-05-01', 'founding',   '锤子科技成立',                '罗永浩创立，立志做"工匠精神"手机，挑战苹果。', 1),
    (v_id, '2014-05-20', 'milestone',  'Smartisan T1发布，口碑炸裂',  '首款手机Smartisan T1发布，工业设计获高度评价，但出货量不及预期。', 2),
    (v_id, '2016-10-18', 'funding',    '完成B+轮融资约10亿元',        '累计融资超18亿元，但每部手机仍在亏损销售。', 3),
    (v_id, '2017-06-01', 'milestone',  '发布坚果Pro，销量短暂回升',   '主打年轻人市场的坚果系列帮助回血，但利润仍然为负。', 4),
    (v_id, '2018-10-01', 'problem',    '资金链告急，工厂欠款曝光',    '媒体报道代工厂长期欠款，融资陷入困境，员工工资延迟发放。', 5),
    (v_id, '2019-04-01', 'shutdown',   '被字节跳动收购核心团队',      '字节跳动以极低对价收购核心技术团队，锤子品牌名义上消亡，罗永浩后转型直播带货。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- 人人网
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'renren';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2005-12-01', 'founding',   '校内网成立',                  '王兴等人创立校内网，以清华/北大校园为起点推广实名制社交。', 1),
    (v_id, '2006-10-01', 'funding',    '被千橡集团收购',              '陈一舟的千橡集团以200万美元收购，更名为"人人网"。', 2),
    (v_id, '2011-05-04', 'milestone',  '纽交所IPO，首日市值71亿',     '上市首日市值超70亿美元，被誉为"中国Facebook"。', 3),
    (v_id, '2011-08-01', 'problem',    '微博崛起分流大学生用户',      '新浪微博强势崛起，人人网月活开始下滑，无法留住毕业后的用户。', 4),
    (v_id, '2013-01-01', 'problem',    '微信朋友圈一刀断喉',          '微信推出朋友圈，将熟人社交彻底迁移至移动端，人人网失去核心价值。', 5),
    (v_id, '2015-06-01', 'pivot',      '多次转型均告失败',            '先后尝试直播、二手车、金融、游戏，均无突破，股价跌至IPO价格5%以下。', 6),
    (v_id, '2018-11-01', 'shutdown',   '以8000万美元出售社交资产',    '将人人网社交业务以8000万美元卖给多牛传媒，彻底转型为投资公司。', 7)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- 优信二手车
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'uxin';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2011-01-01', 'founding',   '优信集团成立',                '戴琨创立，以二手车B2B拍卖切入，后转型C端电商平台。', 1),
    (v_id, '2016-04-01', 'funding',    '完成D轮融资，估值10亿+',      '获Warburg Pincus等投资，进入独角兽俱乐部，加速营销扩张。', 2),
    (v_id, '2018-06-27', 'milestone',  '纳斯达克IPO融资2.25亿美元',   '成为中国二手车电商第一股，但上市当日即破发。', 3),
    (v_id, '2019-02-01', 'problem',    'J Capital做空报告',           '做空机构指控优信存在财务造假和贷款造假，股价暴跌超50%。', 4),
    (v_id, '2020-02-01', 'problem',    '疫情重创汽车交易，濒临退市', '疫情叠加流动性危机，股价跌至0.5美元以下，收到退市警告。', 5),
    (v_id, '2020-09-01', 'pivot',      'CEO退出管理层，出售部分业务', '戴琨辞去CEO，出售旗下部分金融资产求存，公司进入收缩模式。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- 拉手网
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'lashou';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2010-03-01', 'founding',   '拉手网成立',                  '吴波创立，对标Groupon，在"千团大战"中率先崛起。', 1),
    (v_id, '2011-04-01', 'funding',    '获1亿美元融资，领跑全国',     'DCM等投资方注资，业务扩展至全国200余城市。', 2),
    (v_id, '2011-10-01', 'milestone',  '递交IPO申请，估值超10亿',     '向纳斯达克递交招股书，被视为团购赛道最强上市候选。', 3),
    (v_id, '2012-03-01', 'problem',    'IPO因财务疑问被迫撤回',       '招股书中数据被媒体质疑存在虚报，被迫撤回上市申请，风评大损。', 4),
    (v_id, '2012-09-01', 'problem',    '美团大众点评联手绞杀',        '美团凭借更强地推和更低佣金迅速蚕食拉手市场份额。', 5),
    (v_id, '2013-12-01', 'shutdown',   '以极低对价卖身北京旅游集团', '以约3亿元出售，投资人几乎血本无归，告别主流市场。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- 易到用车
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'yidao';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2010-05-01', 'founding',   '易到用车成立',                '周航创立，中国最早的网约车平台，专注高端商务出行。', 1),
    (v_id, '2014-06-01', 'milestone',  '首创"充返"补贴模式',          '推出充100返100活动，短期内规模快速扩大，但培养了薅羊毛用户。', 2),
    (v_id, '2015-10-01', 'funding',    '乐视战略投资7亿元',           '引入乐视作为战略股东，获得7亿元融资，双方共同押注出行生态。', 3),
    (v_id, '2016-08-01', 'problem',    '滴滴合并优步中国，一家独大',  '滴滴完成对优步中国的收购，市场份额超80%，易到沦为边缘玩家。', 4),
    (v_id, '2017-03-01', 'problem',    '乐视资金链断裂波及易到',      '乐视挪用易到资金用于自身业务，导致易到无力向司机结算提现。', 5),
    (v_id, '2017-05-01', 'shutdown',   '司机大规模维权，服务瘫痪',    '全国多城市司机集中堵门讨薪，欠薪金额超10亿元，平台实际瘫痪。', 6)
  ON CONFLICT DO NOTHING;
END IF;

END $$;
