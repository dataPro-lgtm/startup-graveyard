/** 与 seed / taxonomy key 对齐；API 与 Web 共用。 */

function trimLower(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase();
}

export function canonicalizeTaxonomyKey(value: string): string {
  return trimLower(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function normalizeFreeformTaxonomyKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return canonicalizeTaxonomyKey(trimmed) || trimmed;
}

function aliasTokens(value: string): string[] {
  const raw = trimLower(value);
  const canonical = canonicalizeTaxonomyKey(value);
  return [...new Set([raw, canonical].filter(Boolean))];
}

function lookupAlias(value: string, aliases: Readonly<Record<string, string>>): string | undefined {
  for (const token of aliasTokens(value)) {
    if (aliases[token]) return aliases[token];
  }
  return undefined;
}

function labelFromMap(
  key: string | null,
  labels: Readonly<Record<string, string>>,
  normalize: (value: string) => string | undefined,
): string {
  if (!key) return '—';
  const canonical = normalize(key);
  return (canonical ? labels[canonical] : undefined) ?? key;
}

export const INDUSTRY_LABELS: Readonly<Record<string, string>> = {
  // 科技 / 软件
  saas: 'SaaS / 软件',
  devtools: '开发者工具',
  cybersecurity: '网络安全',
  cloud: '云计算 / 基础设施',
  ai_ml: '人工智能 / 机器学习',
  // 消费 / 零售
  ecommerce: '电子商务',
  e_commerce: '电子商务',
  social: '社交 / 内容',
  social_media: '社交媒体',
  gaming: '游戏 / 娱乐',
  consumer: '消费品 / 生活方式',
  media: '媒体 / 出版',
  media_entertainment: '媒体 / 娱乐',
  // 金融
  fintech: '金融科技',
  insurtech: '保险科技',
  crypto: '加密货币 / Web3',
  // 医疗 / 教育
  healthtech: '医疗健康',
  biotech: '生物技术',
  edtech: '教育科技',
  // 企业 / 平台
  marketplace: '交易平台',
  b2b_services: '企业服务',
  hr_tech: '人力资源科技',
  legaltech: '法律科技',
  proptech: '房地产科技',
  real_estate: '房地产 / 长租公寓',
  // 出行 / 物流
  mobility: '出行 / 运力',
  logistics: '物流 / 供应链',
  transportation: '交通 / 出行',
  automotive: '汽车 / 出行',
  // 制造 / 硬件
  hardware: '硬件 / 物联网',
  hardware_electronics: '硬件 / 消费电子',
  cleantech: '清洁能源 / 环保',
  agritech: '农业科技',
  foodtech: '食品科技',
  // 其他
  spacetech: '航天科技',
};

export const COUNTRY_LABELS: Readonly<Record<string, string>> = {
  // 亚洲
  CN: '中国',
  IN: '印度',
  JP: '日本',
  KR: '韩国',
  SG: '新加坡',
  ID: '印度尼西亚',
  PK: '巴基斯坦',
  VN: '越南',
  TH: '泰国',
  MY: '马来西亚',
  PH: '菲律宾',
  BD: '孟加拉国',
  // 欧洲 / 北美
  US: '美国',
  GB: '英国',
  DE: '德国',
  FR: '法国',
  SE: '瑞典',
  NL: '荷兰',
  ES: '西班牙',
  IL: '以色列',
  // 美洲
  CA: '加拿大',
  BR: '巴西',
  MX: '墨西哥',
  AR: '阿根廷',
  // 大洋洲
  AU: '澳大利亚',
  // 非洲
  NG: '尼日利亚',
  ZA: '南非',
  KE: '肯尼亚',
};

/** `cases.business_model_key`；与 seed 对齐，可随数据扩展。 */
export const BUSINESS_MODEL_LABELS: Readonly<Record<string, string>> = {
  marketplace: '平台 / 撮合',
  subscription: '订阅',
  transactional: '交易抽成',
  advertising: '广告',
  hardware: '硬件销售',
  saas: 'SaaS 授权',
  b2b_saas: 'B2B SaaS',
  b2c: 'B2C',
  freemium: '免费增值',
  enterprise: '企业授权',
  consumer: '消费者产品',
  data: '数据服务',
  commission: '佣金',
  lending: '借贷 / 金融撮合',
};

/** `cases.primary_failure_reason_key` 高层归因标签。 */
export const PRIMARY_FAILURE_REASON_LABELS: Readonly<Record<string, string>> = {
  premature_scaling: '过早扩张',
  overexpansion: '过度扩张',
  unit_economics: '单位经济模型崩溃',
  funding_gap: '融资断档',
  financial_mismanagement: '财务管理失控',
  regulatory: '监管 / 合规障碍',
  regulatory_compliance: '监管 / 合规障碍',
  competition: '竞争加剧',
  platform_dependency: '平台依赖风险',
  product_market_fit: '产品市场契合不足',
  pivot_failure: '转型失败',
  strategic_pivot_failure: '战略转型失败',
  failure_to_pivot: '转型失败',
  founder_conflict: '创始人冲突',
  poor_investor_choice: '错误投资方选择',
  team: '核心团队流失',
  governance: '治理失效',
  technology: '技术风险未解决',
  technical_debt: '技术债务 / 架构失效',
  market_timing: '市场时机过早或过晚',
  operational: '运营管理失控',
  fraud: '欺诈 / 治理问题',
  acquisition_failed: '被收购谈判失败',
  customer_concentration: '客户过度集中',
};

export const FAILURE_FACTOR_LEVEL_1_LABELS: Readonly<Record<string, string>> = {
  product: '产品',
  market: '市场',
  finance: '财务 / 资本',
  operational: '运营',
  competitive: '竞争',
  regulatory: '监管 / 合规',
  talent: '人才',
  technology: '技术',
  go_to_market: '渠道 / GTM',
  founder: '创始人',
  team: '团队',
  execution: '执行',
};

export const FAILURE_FACTOR_LEVEL_2_LABELS: Readonly<Record<string, string>> = {
  premature_scaling: '过早扩张',
  cash_burn: '现金消耗过快',
  product_market_fit: '产品市场契合不足',
  weak_demand: '需求不足',
  unit_economics: '单位经济模型失衡',
  regulatory_compliance: '监管 / 合规问题',
  lawsuit_or_investigation: '诉讼 / 调查压力',
  better_funded_competitor: '资金更雄厚的竞争者',
  platform_competition: '平台型竞争压力',
  platform_dependency: '平台依赖',
  market_timing: '市场时机不对',
  channel_mismatch: '渠道不匹配',
  enterprise_sales_execution: '企业销售执行失误',
  missing_social_features: '缺少社交传播机制',
  pricing_mismatch: '定价错位',
  unnecessary_product: '伪需求 / 无必要产品',
  pivot_failure: '转型失败',
  strategic_pivot_failure: '战略转型失败',
  failure_to_pivot: '转型失败',
  premature_geographic_expansion: '过早地域扩张',
  worker_classification_risk: '用工归类风险',
  hardware_quality_issues: '硬件质量问题',
  cost_structure_bloat: '成本结构失控',
  creator_exodus: '创作者流失',
  parent_company_strategy: '母公司战略摇摆',
  technical_debt: '技术债务',
  governance: '治理问题',
  financial_mismanagement: '财务管理失控',
  poor_investor_choice: '错误投资方选择',
  content_cost_overrun: '内容成本失控',
  customer_acquisition_cost: '获客成本过高',
  promotional_pricing: '促销定价过低',
  wrong_consumption_context: '使用场景判断错误',
  monetization_failure: '变现失败',
  reliability_defects: '可靠性缺陷',
  hardware_margin: '硬件毛利不足',
  headcount_cost: '人力成本过高',
  auto_logistics_complexity: '物流履约复杂度过高',
  contractor_vs_employee: '承包商 / 雇员归属争议',
  apple_watch_fitbit: 'Apple / Fitbit 竞争冲击',
  spotify_market_entry: 'Spotify 入场竞争',
  apple_music_launch: 'Apple Music 平台冲击',
  label_licensing_cost: '版权授权成本过高',
  europe_expansion: '欧洲扩张失控',
  marketplace_to_inventory: '从平台转库存模式失败',
};

export const TIMELINE_EVENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  founded: '成立',
  funding: '融资',
  product_launch: '产品上线',
  milestone: '里程碑',
  pivot: '转型',
  problem: '问题暴露',
  layoff: '裁员',
  shutdown: '关闭',
  acquisition: '收购',
  regulatory: '监管事件',
  competition: '竞争压力',
  other: '其他',
};

const PRIMARY_FAILURE_REASON_ALIASES: Readonly<Record<string, string>> = {
  'premature scaling': 'premature_scaling',
  pmf: 'product_market_fit',
  'product market fit': 'product_market_fit',
  'unit economics': 'unit_economics',
  'regulatory compliance': 'regulatory_compliance',
  compliance: 'regulatory_compliance',
  'platform dependency': 'platform_dependency',
  'technical debt': 'technical_debt',
  'strategic pivot failure': 'strategic_pivot_failure',
  'failure to pivot': 'failure_to_pivot',
  'poor investor choice': 'poor_investor_choice',
  governance_issues: 'governance',
  'financial mismanagement': 'financial_mismanagement',
  'market timing': 'market_timing',
  '过早扩张': 'premature_scaling',
  '过度扩张': 'overexpansion',
  '单位经济': 'unit_economics',
  '监管': 'regulatory',
  '合规': 'regulatory_compliance',
  '竞争': 'competition',
  '平台依赖': 'platform_dependency',
  '产品市场契合': 'product_market_fit',
  '转型失败': 'pivot_failure',
  '战略转型失败': 'strategic_pivot_failure',
  '治理': 'governance',
  '技术债': 'technical_debt',
  '财务管理': 'financial_mismanagement',
  '投资方选择失误': 'poor_investor_choice',
};

const FAILURE_FACTOR_LEVEL_1_ALIASES: Readonly<Record<string, string>> = {
  product: 'product',
  market: 'market',
  finance: 'finance',
  financial: 'finance',
  operational: 'operational',
  operations: 'operational',
  competitive: 'competitive',
  competition: 'competitive',
  regulatory: 'regulatory',
  talent: 'talent',
  technology: 'technology',
  team: 'team',
  founder: 'founder',
  gtm: 'go_to_market',
  sales: 'go_to_market',
  execution: 'execution',
  '产品': 'product',
  '市场': 'market',
  '财务': 'finance',
  '运营': 'operational',
  '竞争': 'competitive',
  '监管': 'regulatory',
  '人才': 'talent',
  '技术': 'technology',
  '团队': 'team',
  '创始人': 'founder',
  '渠道': 'go_to_market',
  '执行': 'execution',
};

const FAILURE_FACTOR_LEVEL_2_ALIASES: Readonly<Record<string, string>> = {
  pmf: 'product_market_fit',
  'product market fit': 'product_market_fit',
  'unit economics': 'unit_economics',
  'regulatory compliance': 'regulatory_compliance',
  'better funded competitor': 'better_funded_competitor',
  'platform competition': 'platform_competition',
  'channel mismatch': 'channel_mismatch',
  'missing social features': 'missing_social_features',
  'pricing mismatch': 'pricing_mismatch',
  'unnecessary product': 'unnecessary_product',
  'worker classification risk': 'worker_classification_risk',
  'cost structure bloat': 'cost_structure_bloat',
  'creator exodus': 'creator_exodus',
  'parent company strategy': 'parent_company_strategy',
  'poor investor choice': 'poor_investor_choice',
  'financial mismanagement': 'financial_mismanagement',
  '技术债': 'technical_debt',
  '单位经济': 'unit_economics',
  '渠道不匹配': 'channel_mismatch',
  '监管合规': 'regulatory_compliance',
  '伪需求': 'unnecessary_product',
  '转型失败': 'pivot_failure',
  '错误投资方选择': 'poor_investor_choice',
};

const TIMELINE_EVENT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  founding: 'founded',
  launch: 'product_launch',
  launched: 'product_launch',
  release: 'product_launch',
  released: 'product_launch',
  milestone: 'milestone',
  issue: 'problem',
  issues: 'problem',
  problem: 'problem',
  closure: 'shutdown',
  close: 'shutdown',
  closed: 'shutdown',
  bankrupt: 'shutdown',
  bankruptcy: 'shutdown',
  acquire: 'acquisition',
  acquired: 'acquisition',
  sold: 'acquisition',
  sale: 'acquisition',
  investigation: 'regulatory',
  lawsuit: 'regulatory',
  lawsuits: 'regulatory',
  regulation: 'regulatory',
  competitor: 'competition',
  competitors: 'competition',
  '成立': 'founded',
  '融资': 'funding',
  '上线': 'product_launch',
  '发布': 'product_launch',
  '里程碑': 'milestone',
  '转型': 'pivot',
  '问题': 'problem',
  '裁员': 'layoff',
  '关闭': 'shutdown',
  '倒闭': 'shutdown',
  '收购': 'acquisition',
  '监管': 'regulatory',
  '竞争': 'competition',
};

export function normalizePrimaryFailureReasonKey(value: string): string | undefined {
  const alias = lookupAlias(value, PRIMARY_FAILURE_REASON_ALIASES);
  if (alias) return alias;
  const canonical = canonicalizeTaxonomyKey(value);
  if (canonical && PRIMARY_FAILURE_REASON_LABELS[canonical]) return canonical;
  return canonical || undefined;
}

export function normalizeFailureFactorLevel1Key(value: string): string | undefined {
  const alias = lookupAlias(value, FAILURE_FACTOR_LEVEL_1_ALIASES);
  if (alias) return alias;
  const canonical = canonicalizeTaxonomyKey(value);
  if (canonical && FAILURE_FACTOR_LEVEL_1_LABELS[canonical]) return canonical;
  return canonical || undefined;
}

export function normalizeFailureFactorLevel2Key(value: string): string | undefined {
  const alias = lookupAlias(value, FAILURE_FACTOR_LEVEL_2_ALIASES);
  if (alias) return alias;
  const canonical = canonicalizeTaxonomyKey(value);
  if (canonical && FAILURE_FACTOR_LEVEL_2_LABELS[canonical]) return canonical;
  return canonical || undefined;
}

export function normalizeTimelineEventType(value: string): string | undefined {
  const alias = lookupAlias(value, TIMELINE_EVENT_TYPE_ALIASES);
  if (alias) return alias;
  const canonical = canonicalizeTaxonomyKey(value);
  if (canonical && TIMELINE_EVENT_TYPE_LABELS[canonical]) return canonical;
  return canonical || undefined;
}

export function industryLabel(key: string): string {
  const canonical = canonicalizeTaxonomyKey(key);
  return INDUSTRY_LABELS[canonical] ?? key;
}

export function countryLabel(code: string | null): string {
  if (!code) return '—';
  const u = code.toUpperCase();
  return COUNTRY_LABELS[u] ?? code;
}

export function businessModelLabel(key: string | null): string {
  if (!key) return '—';
  const canonical = canonicalizeTaxonomyKey(key);
  return BUSINESS_MODEL_LABELS[canonical] ?? key;
}

export function primaryFailureReasonLabel(key: string | null): string {
  return labelFromMap(key, PRIMARY_FAILURE_REASON_LABELS, normalizePrimaryFailureReasonKey);
}

export function failureFactorLevel1Label(key: string | null): string {
  return labelFromMap(key, FAILURE_FACTOR_LEVEL_1_LABELS, normalizeFailureFactorLevel1Key);
}

export function failureFactorLevel2Label(key: string | null): string {
  return labelFromMap(key, FAILURE_FACTOR_LEVEL_2_LABELS, normalizeFailureFactorLevel2Key);
}

export function timelineEventTypeLabel(key: string | null): string {
  return labelFromMap(key, TIMELINE_EVENT_TYPE_LABELS, normalizeTimelineEventType);
}
