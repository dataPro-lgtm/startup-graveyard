import { Startup } from '@/types';

// 注意：客户端组件不能直接使用fs模块
// 客户端应该通过API获取数据，这里只提供默认数据作为fallback

// 默认数据（作为fallback）
const defaultStartupsArray: Startup[] = [
  {
    id: '1',
    name: 'e国商城',
    nameEn: 'eGuo',
    industry: '电商',
    foundedYear: 2000,
    closedYear: 2001,
    lifespan: 1,
    totalFunding: 5000000,
    lossAmount: 5000000,
    investors: ['IDG资本'],
    founders: ['张永青'],
    failureReasons: ['市场超前', '烧钱过快', '物流不完善'],
    description: '中国最早的B2C电商平台之一，因市场环境不成熟和资金链断裂而失败。',
    detailedAnalysis: 'e国商城成立于2000年，是中国最早的B2C电商平台之一。创始人张永青从美国回国创业，试图复制Amazon模式。然而，当时中国互联网普及率低，物流基础设施不完善，支付体系不成熟，导致用户体验极差。公司一年内烧光了500万美元融资，最终因资金链断裂而倒闭。',
    lessons: [
      '市场时机至关重要，过早进入市场可能成为先烈',
      '需要根据本地市场特点调整商业模式',
      '控制烧钱速度，建立可持续的现金流'
    ],
    tags: ['电商', 'B2C', '市场超前', '资金链断裂'],
    country: '中国'
  },
  {
    id: '2',
    name: '若邻网',
    nameEn: 'Wealink',
    industry: '社交网络',
    foundedYear: 2004,
    closedYear: 2013,
    lifespan: 9,
    totalFunding: 15000000,
    lossAmount: 15000000,
    investors: ['软银中国', 'DCM'],
    founders: ['邹岭'],
    failureReasons: ['盲目模仿', '缺乏本土化', '竞争激烈'],
    description: '试图复制LinkedIn模式的职业社交网络，因缺乏本土化创新而失败。',
    detailedAnalysis: '若邻网成立于2004年，是中国最早的职业社交网络之一，试图复制LinkedIn的成功模式。然而，公司过于依赖美国模式，缺乏对中国职场文化的理解。在微信等社交平台崛起后，若邻网的用户流失严重，最终在2013年停止运营。',
    lessons: [
      '不能简单复制国外模式，需要深度本土化',
      '理解目标市场的文化和用户习惯',
      '及时调整策略应对市场变化'
    ],
    tags: ['社交网络', '职业社交', '本土化', '竞争'],
    country: '中国'
  },
  {
    id: '3',
    name: '虎头局',
    nameEn: 'Tiger Head',
    industry: '新消费',
    foundedYear: 2019,
    closedYear: 2023,
    lifespan: 4,
    totalFunding: 50000000,
    lossAmount: 50000000,
    investors: ['红杉中国', 'GGV', 'IDG资本'],
    founders: ['胡亭'],
    failureReasons: ['激进扩张', '资金链断裂', '商业模式不清晰'],
    description: '新中式烘焙品牌，因激进扩张导致资金链断裂而倒闭。',
    detailedAnalysis: '虎头局成立于2019年，是新中式烘焙的代表品牌之一。公司获得多轮融资后，开始激进扩张，在全国开设大量门店。然而，单店盈利能力不足，加上疫情冲击，导致资金链断裂。2023年，虎头局宣布破产清算。',
    lessons: [
      '扩张速度要与盈利能力匹配',
      '建立可持续的商业模式',
      '保持现金流健康'
    ],
    tags: ['新消费', '烘焙', '扩张', '资金链'],
    country: '中国'
  },
  {
    id: '4',
    name: 'Theranos',
    nameEn: 'Theranos',
    industry: '医疗科技',
    foundedYear: 2003,
    closedYear: 2018,
    lifespan: 15,
    totalFunding: 900000000,
    lossAmount: 900000000,
    investors: ['Tim Draper', 'Rupert Murdoch', 'Larry Ellison'],
    founders: ['Elizabeth Holmes'],
    failureReasons: ['技术造假', '监管问题', '创始人欺诈'],
    description: '血液检测公司，因技术造假和创始人欺诈而倒闭，成为硅谷最大丑闻之一。',
    detailedAnalysis: 'Theranos由Elizabeth Holmes于2003年创立，声称可以通过少量血液进行数百种检测。公司估值一度达到90亿美元，吸引了众多知名投资者。然而，2015年《华尔街日报》揭露公司技术造假，产品无法正常工作。最终，Holmes被判欺诈罪，公司于2018年解散。',
    lessons: [
      '技术必须真实可靠，不能夸大宣传',
      '监管合规至关重要',
      '诚信是创业的基石'
    ],
    tags: ['医疗科技', '欺诈', '监管', '技术'],
    country: '美国'
  },
  {
    id: '5',
    name: 'WeWork',
    nameEn: 'WeWork',
    industry: '共享办公',
    foundedYear: 2010,
    closedYear: 2019,
    lifespan: 9,
    totalFunding: 22000000000,
    lossAmount: 20000000000,
    investors: ['软银', 'Benchmark', '高盛'],
    founders: ['Adam Neumann'],
    failureReasons: ['商业模式缺陷', '过度扩张', '管理混乱'],
    description: '共享办公空间公司，因商业模式缺陷和过度扩张导致IPO失败。',
    detailedAnalysis: 'WeWork成立于2010年，通过租赁办公空间再转租给创业公司。公司估值一度达到470亿美元，但在2019年IPO前夕，投资者发现公司财务状况糟糕，商业模式存在根本缺陷。创始人Adam Neumann被迫辞职，公司估值暴跌，最终被软银接管。',
    lessons: [
      '商业模式必须可持续',
      '估值不等于价值',
      '公司治理至关重要'
    ],
    tags: ['共享办公', '商业模式', '扩张', 'IPO'],
    country: '美国'
  },
  {
    id: '6',
    name: 'Juicero',
    nameEn: 'Juicero',
    industry: '硬件',
    foundedYear: 2013,
    closedYear: 2017,
    lifespan: 4,
    totalFunding: 120000000,
    lossAmount: 120000000,
    investors: ['Kleiner Perkins', 'Google Ventures'],
    founders: ['Doug Evans'],
    failureReasons: ['产品过度设计', '价格过高', '需求不足'],
    description: '智能榨汁机公司，因产品过度设计和价格过高而失败。',
    detailedAnalysis: 'Juicero开发了一款售价700美元的智能榨汁机，需要配合专用果汁包使用。然而，有用户发现用手挤压果汁包也能得到相同效果，导致产品价值受到质疑。公司最终因需求不足和商业模式不可持续而关闭。',
    lessons: [
      '产品要解决真实问题',
      '避免过度设计',
      '价格要与价值匹配'
    ],
    tags: ['硬件', '智能设备', '价格', '需求'],
    country: '美国'
  },
  {
    id: '7',
    name: 'Quibi',
    nameEn: 'Quibi',
    industry: '流媒体',
    foundedYear: 2018,
    closedYear: 2020,
    lifespan: 2,
    totalFunding: 1750000000,
    lossAmount: 1750000000,
    investors: ['迪士尼', '华纳', 'NBC环球'],
    founders: ['Jeffrey Katzenberg', 'Meg Whitman'],
    failureReasons: ['时机错误', '内容策略失败', '用户习惯不匹配'],
    description: '短视频流媒体平台，因时机错误和内容策略失败而倒闭。',
    detailedAnalysis: 'Quibi由好莱坞资深人士Jeffrey Katzenberg创立，专注于10分钟以内的短视频内容。公司融资17.5亿美元，但在2020年4月上线时，正值疫情爆发，用户更倾向于长视频内容。平台内容质量不高，用户增长缓慢，最终在6个月后宣布关闭。',
    lessons: [
      '时机选择至关重要',
      '理解用户真实需求',
      '内容质量是流媒体的核心'
    ],
    tags: ['流媒体', '短视频', '时机', '内容'],
    country: '美国'
  },
  {
    id: '8',
    name: 'Color',
    nameEn: 'Color',
    industry: '社交',
    foundedYear: 2011,
    closedYear: 2012,
    lifespan: 1,
    totalFunding: 41000000,
    lossAmount: 41000000,
    investors: ['红杉资本', 'Bain Capital'],
    founders: ['Bill Nguyen'],
    failureReasons: ['产品定位不清', '用户体验差', '竞争激烈'],
    description: '照片分享应用，因产品定位不清和用户体验差而快速失败。',
    detailedAnalysis: 'Color在2011年获得4100万美元A轮融资，创下当时记录。应用试图通过地理位置自动创建照片分享群组，但产品定位不清，用户体验复杂，用户增长缓慢。在Instagram等竞争对手的冲击下，公司一年后转型失败并关闭。',
    lessons: [
      '产品定位要清晰',
      '用户体验是核心',
      '融资额不等于成功'
    ],
    tags: ['社交', '照片分享', '定位', '用户体验'],
    country: '美国'
  },
  {
    id: '9',
    name: 'Beepi',
    nameEn: 'Beepi',
    industry: '二手车',
    foundedYear: 2014,
    closedYear: 2017,
    lifespan: 3,
    totalFunding: 150000000,
    lossAmount: 150000000,
    investors: ['Foundation Capital', 'Redpoint Ventures'],
    founders: ['Ale Resnik', 'Owen Savir'],
    failureReasons: ['运营成本过高', '商业模式不可持续', '资金链断裂'],
    description: '二手车交易平台，因运营成本过高和商业模式不可持续而倒闭。',
    detailedAnalysis: 'Beepi试图通过提供上门检测和交付服务来改善二手车交易体验。然而，这种重资产模式导致运营成本极高，每笔交易都在亏损。公司无法找到可持续的商业模式，最终在2017年宣布关闭。',
    lessons: [
      '控制运营成本',
      '商业模式必须可持续',
      '单位经济模型要健康'
    ],
    tags: ['二手车', '运营成本', '商业模式', '单位经济'],
    country: '美国'
  },
  {
    id: '10',
    name: 'Homejoy',
    nameEn: 'Homejoy',
    industry: 'O2O',
    foundedYear: 2012,
    closedYear: 2015,
    lifespan: 3,
    totalFunding: 40000000,
    lossAmount: 40000000,
    investors: ['Google Ventures', 'Redpoint Ventures'],
    founders: ['Adora Cheung', 'Aaron Cheung'],
    failureReasons: ['获客成本高', '用户留存率低', '服务质量不稳定'],
    description: '家庭清洁服务平台，因获客成本高和用户留存率低而失败。',
    detailedAnalysis: 'Homejoy提供家庭清洁服务的在线预订平台。公司通过大量补贴获取用户，但用户留存率极低，获客成本远高于用户生命周期价值。同时，服务质量不稳定，导致口碑下滑。最终在2015年宣布关闭。',
    lessons: [
      '获客成本要可控',
      '提高用户留存率',
      '服务质量是O2O的核心'
    ],
    tags: ['O2O', '服务', '获客成本', '留存率'],
    country: '美国'
  }
];

// 导出默认数据
export const defaultStartups = defaultStartupsArray;

// 获取所有行业（基于传入的数据）
export const getIndustries = (startupsData: Startup[] = defaultStartupsArray): string[] => {
  const industries = new Set(startupsData.map(s => s.industry));
  return Array.from(industries).sort();
};

// 获取所有失败原因（基于传入的数据）
export const getFailureReasons = (startupsData: Startup[] = defaultStartupsArray): string[] => {
  const reasons = new Set(startupsData.flatMap(s => s.failureReasons));
  return Array.from(reasons).sort();
};

// 获取所有国家（基于传入的数据）
export const getCountries = (startupsData: Startup[] = defaultStartupsArray): string[] => {
  const countries = new Set(startupsData.map(s => s.country));
  return Array.from(countries).sort();
};
