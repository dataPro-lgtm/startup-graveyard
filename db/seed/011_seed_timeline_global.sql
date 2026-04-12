-- 011_seed_timeline_global.sql
-- Timeline events for the 19 new global startup failure cases
-- These are inserted via ON CONFLICT DO NOTHING so safe to re-run.

DO $$
DECLARE
  v_id UUID;
BEGIN

-- ─────────────────────────────────────────────
-- Pets.com
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'pets-com';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '1998-08-01', 'founding',    'Pets.com 成立',           '由Greg McLemore创立，专注于在线宠物用品零售，定位抓住宠物经济风口。', 1),
    (v_id, '2000-02-01', 'funding',     '获得约8200万美元融资',     'Amazon领投，软银等参与，总计筹集约8200万美元用于扩张。', 2),
    (v_id, '2000-02-11', 'milestone',   'IPO上市',                 '在纳斯达克以11美元/股上市，首日勉强维持，市场反应平淡。', 3),
    (v_id, '2000-04-30', 'milestone',   '超级碗广告',              '砸重金在超级碗打广告，吉祥物袜子狗家喻户晓，但销量未随知名度提升。', 4),
    (v_id, '2000-11-07', 'shutdown',    '宣布关闭',                '上市不足9个月，宣布停业清算，成为互联网泡沫的标志性失败案例。', 5)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Webvan
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'webvan';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '1996-01-01', 'founding',    'Webvan 成立',             'Louis Borders联合创立，立志用技术彻底颠覆传统食品零售。', 1),
    (v_id, '1999-11-05', 'milestone',   'IPO融资3.75亿美元',       '上市首日市值超过12亿美元，投资者对其商业模式极度乐观。', 2),
    (v_id, '1999-12-01', 'funding',     '与HomeGrocer合并谈判',    '为加速扩张收购竞争对手HomeGrocer，耗资12亿美元，负债激增。', 3),
    (v_id, '2000-06-01', 'milestone',   '激进扩张至26个城市',      '在尚未验证单城市盈利的情况下，豪赌全国同步铺开，仓库建设失控。', 4),
    (v_id, '2001-07-09', 'shutdown',    '申请破产清算',            '烧完12亿美元，宣告破产，2000名员工失业，成为史上损失最惨重的互联网公司之一。', 5)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Friendster
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'friendster';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2002-03-01', 'founding',    'Friendster 上线',         'Jonathan Abrams推出，首创社交图谱概念，迅速吸引300万用户。', 1),
    (v_id, '2003-06-01', 'funding',     '获得800万美元A轮',        'Kleiner Perkins等顶级VC投资，估值快速攀升。', 2),
    (v_id, '2003-07-01', 'milestone',   '拒绝Google 3000万收购',   '创始人拒绝谷歌高价收购，此后技术问题爆发，用户大量流失。', 3),
    (v_id, '2004-01-01', 'pivot',       '服务器崩溃用户大逃亡',    '用户体验极差，页面加载长达40秒，MySpace趁势崛起抢走用户。', 4),
    (v_id, '2009-12-01', 'shutdown',    '卖给马来西亚公司MOL',     '以4000万美元出售，主要用户转移至东南亚，最终2015年彻底关闭。', 5)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- MySpace
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'myspace';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2003-08-01', 'founding',    'MySpace 上线',            'Tom Anderson和Chris DeWolfe推出，以音乐人社区为切入点快速扩张。', 1),
    (v_id, '2005-07-18', 'funding',     '新闻集团5.8亿美元收购',   '默多克豪掷5.8亿美元，新闻集团认为SNS是下一个媒体帝国。', 2),
    (v_id, '2006-06-01', 'milestone',   '超越Google成美国最大网站', '月访问量突破1亿，是当时全球最大社交平台。', 3),
    (v_id, '2008-01-01', 'problem',     'Facebook高速增长蚕食份额', 'Facebook凭借更简洁设计和实名制迅速抢走MySpace用户群。', 4),
    (v_id, '2011-06-29', 'shutdown',    '以3500万美元贱卖',        '新闻集团以3500万美元出售，较收购价缩水94%，成为媒体史上最惨收购之一。', 5)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Color Labs
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'color-labs';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2011-03-23', 'founding',    'Color Labs 发布',         '比尔·莱特创立，发布当天即获4100万美元融资，硅谷轰动。', 1),
    (v_id, '2011-03-23', 'funding',     '发布即融资4100万美元',    'Sequoia、Bain等豪赌这款"邻近社交摄影"应用。', 2),
    (v_id, '2011-06-01', 'problem',     '用户困惑产品定位不清',    '应用逻辑反直觉，新用户无法理解"与陌生人共享照片"的价值。', 3),
    (v_id, '2012-01-01', 'pivot',       '多次转型均告失败',        '先后尝试社交电视、社交视频等方向，均无起色。', 4),
    (v_id, '2012-10-17', 'shutdown',    '被苹果收购团队',          'Apple收购其团队和专利，产品下架，4100万美元融资基本归零。', 5)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Yik Yak
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'yik-yak';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2013-08-01', 'founding',    'Yik Yak 上线',            'Tyler Droll和Brooks Buffington在大学校园推出匿名地理社交应用。', 1),
    (v_id, '2014-06-01', 'milestone',   '进入高校爆红',            '校园用户裂变式增长，跻身App Store前十，估值冲破4亿美元。', 2),
    (v_id, '2014-11-01', 'funding',     '获7300万美元融资',        'DCM等投资方注资，估值约4亿美元。', 3),
    (v_id, '2016-04-01', 'problem',     '霸凌问题失控',            '匿名机制引发严重霸凌、骚扰，多所学校封禁，媒体持续负面报道。', 4),
    (v_id, '2016-10-01', 'pivot',       '强制推出实名制',          '试图用实名制扭转形象，核心用户大规模离开，DAU暴跌90%。', 5),
    (v_id, '2017-04-28', 'shutdown',    '宣布关闭服务',            '流量枯竭，Square收购团队，产品永久下线。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Zynga
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'zynga';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2007-07-01', 'founding',    'Zynga 成立',              'Mark Pincus创立，聚焦Facebook平台休闲社交游戏。', 1),
    (v_id, '2009-06-01', 'milestone',   'FarmVille爆红',           'FarmVille上线两个月月活超7500万，成为Facebook史上增长最快应用。', 2),
    (v_id, '2011-12-16', 'milestone',   'IPO市值超100亿美元',      '在纳斯达克上市，首日市值近100亿美元，成为互联网史上最大游戏IPO之一。', 3),
    (v_id, '2012-06-01', 'problem',     'Facebook算法调整断流',    'Facebook限制游戏通知推送，Zynga月活用户急剧下滑。', 4),
    (v_id, '2012-10-01', 'problem',     '移动转型失败',            '错失移动端窗口，自研移动游戏口碑与收入均不及预期。', 5),
    (v_id, '2013-06-01', 'shutdown',    '关闭多个工作室裁员1000人', '股价较IPO最高点跌去80%，关闭游戏工作室，大幅裁员。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Gilt Groupe
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'gilt-groupe';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2007-11-01', 'founding',    'Gilt Groupe 创立',        'Alexis Maybank和Alexandra Wilson创立，专注奢侈品限时闪购。', 1),
    (v_id, '2009-05-01', 'milestone',   '会员突破200万', '闪购模式引爆，营收快速增长，估值超过10亿美元。', 2),
    (v_id, '2011-05-01', 'funding',     '完成E轮融资估值10亿+',    '累计融资近2.4亿美元，"闪购电商"赛道皇冠企业。', 3),
    (v_id, '2013-01-01', 'problem',     'IPO计划一再推迟',         '亏损持续扩大，盈利遥遥无期，多次传出的IPO计划均未兑现。', 4),
    (v_id, '2015-06-01', 'problem',     '闪购模式红利消退',        '消费者审美疲劳，竞争对手涌入，折扣战拖累毛利，品牌溢价瓦解。', 5),
    (v_id, '2016-01-07', 'shutdown',    '以2.5亿美元出售给HBC',    '哈德逊湾公司以2.5亿美元收购，较峰值估值大幅折价，投资人损失惨重。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Dinnr
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'dinnr';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2012-06-01', 'founding',    'Dinnr 在伦敦上线',        '由Michal Bohanes创立，对标Blue Apron，切入英国食谱套餐配送市场。', 1),
    (v_id, '2012-09-01', 'milestone',   '进入Techstars孵化器',     '成功入选伦敦Techstars，获得种子资金和导师资源。', 2),
    (v_id, '2013-04-01', 'problem',     '复购率不及预期',          '食材包装成本高、配送物流复杂，单订单利润极薄，用户复购意愿低。', 3),
    (v_id, '2013-10-01', 'shutdown',    '宣布关闭',                '创始人在博客公开复盘：市场规模不足以支撑商业模式，当机立断止损。', 4)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Boo.com
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'boo-com';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '1998-08-01', 'founding',    'Boo.com 成立',            'Ernst Malmsten和Kajsa Leander创立，立志打造全球首个时尚电商平台。', 1),
    (v_id, '1999-09-01', 'funding',     '获得1.35亿美元融资',      'JP Morgan、LVMH等名流机构注资，成为欧洲最受瞩目的互联网初创。', 2),
    (v_id, '1999-11-01', 'milestone',   '耗时两年终于上线',        '网站用了海量Flash动画和3D旋转，在56k拨号时代完全无法使用。', 3),
    (v_id, '2000-03-01', 'problem',     '每月烧钱超800万英镑',     '运营成本失控，物流、客服、IT基础设施均严重超支。', 4),
    (v_id, '2000-05-18', 'shutdown',    '破产清算',                '上线不足6个月，1.35亿英镑融资耗尽，被迫破产，250名员工失业。', 5)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Wonga
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'wonga';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2006-01-01', 'founding',    'Wonga 成立',              'Errol Damelin在伦敦创立，以算法信审颠覆短期消费贷款。', 1),
    (v_id, '2010-01-01', 'milestone',   '实现盈利并快速扩张',      '贷款业务快速增长，年化利率高达5000%仍受消费者追捧，成为FinTech明星。', 2),
    (v_id, '2012-01-01', 'milestone',   '估值超10亿英镑',          '成为英国首批独角兽之一，业务扩展至南非、加拿大等市场。', 3),
    (v_id, '2013-11-01', 'problem',     '监管重拳：利率上限',      '英国FCA宣布对发薪日贷款实施利率上限，Wonga核心盈利模式受到致命威胁。', 4),
    (v_id, '2014-06-01', 'problem',     '虚假律师信赔偿丑闻',      '被曝以虚假律所名义向欠款客户发恐吓信，被迫赔偿220万英镑并公开道歉。', 5),
    (v_id, '2018-08-30', 'shutdown',    '申请破产管理',            '监管整改成本激增、索赔洪流压垮资产负债表，宣告破产，全部员工失业。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Solyndra
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'solyndra';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2005-01-01', 'founding',    'Solyndra 成立',           'Chris Gronet在加州创立，开发圆柱形薄膜太阳能电池板。', 1),
    (v_id, '2009-09-01', 'funding',     '获5.35亿美元联邦贷款担保', '奥巴马政府将其列为绿色能源旗舰项目，提供5.35亿美元贷款担保。', 2),
    (v_id, '2010-05-01', 'milestone',   '奥巴马亲赴工厂参观',      '总统为其背书，成为美国清洁能源产业名片。', 3),
    (v_id, '2011-01-01', 'problem',     '中国光伏价格断崖下跌',    '中国政府补贴推动多晶硅太阳能板量产，价格暴跌令Solyndra成本倒挂。', 4),
    (v_id, '2011-08-31', 'shutdown',    '宣告破产',                '宣布停产并申请破产，裁员1100人，政治丑闻使清洁能源补贴政策饱受质疑。', 5)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Quirky
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'quirky';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2009-06-01', 'founding',    'Quirky 成立',             'Ben Kaufman创立，搭建众包发明平台：社区提交创意，公司负责量产销售。', 1),
    (v_id, '2011-06-01', 'milestone',   '与GE战略合作',            '通用电气合作，共同孵化智能家居硬件，品牌影响力大幅提升。', 2),
    (v_id, '2012-09-01', 'funding',     '完成9000万美元融资',      'Andreessen Horowitz领投，累计融资接近1.9亿美元。', 3),
    (v_id, '2014-01-01', 'problem',     '产品线失控SKU超400个',    '为追求众包社区满意度，盲目扩充产品线，供应链、库存管理完全失控。', 4),
    (v_id, '2015-09-22', 'shutdown',    '申请破产',                '入不敷出，破产清算，Wink智能家居业务被分拆出售以偿还部分债务。', 5)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Skully
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'skully';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2012-01-01', 'founding',    'Skully 成立',             'Marcus Weller创立，开发搭载AR抬头显示的智能摩托车头盔。', 1),
    (v_id, '2014-08-01', 'funding',     'Indiegogo众筹超240万美元','创始人以炫酷概念视频引爆众筹，超2400名支持者预购。', 2),
    (v_id, '2015-01-01', 'funding',     '获1400万美元风险投资',    'Intel Capital等注资，估值冲至1亿美元以上。', 3),
    (v_id, '2016-03-01', 'problem',     '交货严重延误',            '量产工艺难题无法解决，距承诺交货日期已拖延近两年。', 4),
    (v_id, '2016-07-21', 'shutdown',    '创始人挥霍公款公司破产',  '媒体曝光创始人将公司资金用于豪车、度假、个人消费，公司随即破产，众筹用户血本无归。', 5)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- ofo小黄车
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'ofo';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2014-09-01', 'founding',    'ofo 在北大校园创立',      '戴威与同学在北京大学校园内发起，以共享单车解决"最后一公里"。', 1),
    (v_id, '2016-02-01', 'funding',     '获得金沙江创投天使轮',    '走出校园，开始城市化扩张，滴滴出行也随后跟投。', 2),
    (v_id, '2017-07-01', 'funding',     'E轮融资超7亿美元',        '阿里、滴滴、DST等加持，估值超30亿美元，与摩拜打响补贴大战。', 3),
    (v_id, '2017-12-01', 'milestone',   '全球投放超1000万辆',      '扩张至全球20余个国家，单车投放量全球第一。', 4),
    (v_id, '2018-07-01', 'problem',     '押金难退挤兑危机',        '数千万用户申请退还99元押金，资金链断裂，开始无力偿付。', 5),
    (v_id, '2019-06-01', 'shutdown',    '实际停止运营',            '戴威出行被限制，公司陷入诉讼泥潭，投资人追讨超20亿美元，实际倒闭。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- 瑞幸咖啡
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'luckin-coffee';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2017-10-01', 'founding',    '瑞幸咖啡成立',            '钱治亚和陆正耀在北京创立，以"无限场景"和大额补贴挑战星巴克。', 1),
    (v_id, '2019-05-17', 'milestone',   '闪电IPO，纳斯达克上市',   '成立仅18个月即赴美上市，创全球最快IPO纪录，融资6.45亿美元。', 2),
    (v_id, '2020-02-01', 'problem',     '浑水做空报告曝光造假',    '浑水公司发布89页做空报告，指控瑞幸虚构交易数据。', 3),
    (v_id, '2020-04-02', 'problem',     '自曝22亿元财务造假',      '公司发布公告承认2019年Q2至Q4虚增销售约22亿元人民币，COO刘剑被革职。', 4),
    (v_id, '2020-06-26', 'shutdown',    '遭纳斯达克摘牌退市',      '股价在12个交易日内暴跌90%，被强制退市，面临SEC及中美多地司法调查。', 5),
    (v_id, '2021-04-01', 'milestone',   '完成重组复出',            '经历破产重组，门店实现盈利，2023年门店数反超星巴克中国，成为奇特的"起死回生"案例。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Katerra
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'katerra';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2015-01-01', 'founding',    'Katerra 成立',            'Michael Marks和Fritz Wolff创立，以科技公司逻辑颠覆传统建筑供应链。', 1),
    (v_id, '2018-01-01', 'funding',     '获软银愿景基金8.65亿美元', '孙正义豪投8.65亿美元，押注"建筑业的特斯拉"。', 2),
    (v_id, '2019-06-01', 'milestone',   '员工超8000人',            '全球扩张至美国、中东、印度，成为建筑科技赛道最受瞩目的公司。', 3),
    (v_id, '2020-06-01', 'problem',     '内部管理与成本危机',      '项目延期、质量问题频发，管理层内讧，实际造价远超预算。', 4),
    (v_id, '2021-02-01', 'funding',     '再获SoftBank 2亿美元续命', '软银追加投资以避免损失，但已无法改变公司命运。', 5),
    (v_id, '2021-06-06', 'shutdown',    '申请破产清算',            '宣告破产，解雇全部8000名员工，软银累计损失超10亿美元。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Fast
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'fast-checkout';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2019-01-01', 'founding',    'Fast 成立',               'Domm Holland在旧金山创立，专注一键结账，誓言干掉繁琐的支付流程。', 1),
    (v_id, '2020-03-01', 'funding',     '获Stripe领投2000万美元',  'Stripe战略投资，对Fast的愿景高度认可。', 2),
    (v_id, '2021-01-26', 'funding',     'B轮1.02亿美元',           'Addition等知名机构注资，估值超过10亿美元，成为最新独角兽。', 3),
    (v_id, '2021-06-01', 'milestone',   '发布Fast Checkout产品',   '正式向商户开放，但接入流程复杂、转化提升数据存疑。', 4),
    (v_id, '2022-03-01', 'problem',     '月收入仅60万美元',        '内部泄露：尽管花费超过1000万美元/月，MRR仅约60万美元，差距触目惊心。', 5),
    (v_id, '2022-04-05', 'shutdown',    '宣布关闭公司',            '资金断裂，宣告倒闭，120名员工当天被解雇，一键支付梦破灭。', 6)
  ON CONFLICT DO NOTHING;
END IF;

-- ─────────────────────────────────────────────
-- Convoy
-- ─────────────────────────────────────────────
SELECT id INTO v_id FROM cases WHERE slug = 'convoy';
IF v_id IS NOT NULL THEN
  INSERT INTO timeline_events (case_id, event_date, event_type, title, description, sort_order) VALUES
    (v_id, '2015-01-01', 'founding',    'Convoy 成立',             'Dan Lewis和Grant Goodale创立，以算法撮合货主与司机，号称"货运界的Uber"。', 1),
    (v_id, '2019-11-01', 'funding',     '获4亿美元D轮，估值26亿',  'Jeff Bezos、Bill Gates等知名人士参与投资。', 2),
    (v_id, '2020-06-01', 'problem',     '疫情冲击货运市场',        '新冠疫情造成供需剧烈波动，平台撮合效率大打折扣，司机收入不稳定。', 3),
    (v_id, '2022-06-01', 'problem',     '货运市场深度下行',        '后疫情运价断崖式下跌，高固定成本压垮盈利模型。', 4),
    (v_id, '2023-10-19', 'shutdown',    '宣布关闭运营',            '宣告停止运营，数百名员工遭裁撤，12亿美元融资化为乌有。', 5)
  ON CONFLICT DO NOTHING;
END IF;

END $$;
