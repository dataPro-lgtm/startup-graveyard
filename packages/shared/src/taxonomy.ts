/** 与 seed / taxonomy key 对齐；API 也可引用本包。 */
export const INDUSTRY_LABELS: Readonly<Record<string, string>> = {
  // 科技 / 软件
  saas: 'SaaS / 软件',
  devtools: '开发者工具',
  cybersecurity: '网络安全',
  cloud: '云计算 / 基础设施',
  ai_ml: '人工智能 / 机器学习',
  // 消费 / 零售
  ecommerce: '电子商务',
  social: '社交 / 内容',
  gaming: '游戏 / 娱乐',
  consumer: '消费品 / 生活方式',
  media: '媒体 / 出版',
  // 金融
  fintech: '金融科技',
  insurtech: '保险科技',
  crypto: '加密货币 / Web3',
  // 医疗 / 教育
  healthtech: '医疗健康',
  edtech: '教育科技',
  // 企业 / 平台
  marketplace: '交易平台',
  b2b_services: '企业服务',
  hr_tech: '人力资源科技',
  legaltech: '法律科技',
  proptech: '房地产科技',
  // 出行 / 物流
  mobility: '出行 / 运力',
  logistics: '物流 / 供应链',
  // 制造 / 硬件
  hardware: '硬件 / 物联网',
  cleantech: '清洁能源 / 环保',
  agritech: '农业科技',
  foodtech: '食品科技',
  // 其他
  spacetech: '航天科技',
  biotech: '生物技术',
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
  // 欧洲
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

/** `cases.business_model_key`；与 seed 示例对齐，可随数据扩展。 */
export const BUSINESS_MODEL_LABELS: Readonly<Record<string, string>> = {
  marketplace: '平台 / 撮合',
  subscription: '订阅',
  transactional: '交易抽成',
  advertising: '广告',
  hardware: '硬件销售',
  saas: 'SaaS 授权',
  freemium: '免费增值',
  enterprise: '企业授权',
  data: '数据服务',
  commission: '佣金',
};

/** `cases.primary_failure_reason_key` 等高层归因标签。 */
export const PRIMARY_FAILURE_REASON_LABELS: Readonly<Record<string, string>> = {
  premature_scaling: '过早扩张',
  unit_economics: '单位经济模型崩溃',
  funding_gap: '融资断档',
  regulatory: '监管 / 合规障碍',
  competition: '竞争加剧',
  product_market_fit: '产品市场契合不足',
  founder_conflict: '创始人冲突',
  team: '核心团队流失',
  pivot_failure: '转型失败',
  technology: '技术风险未解决',
  market_timing: '市场时机过早或过晚',
  operational: '运营管理失控',
  fraud: '欺诈 / 治理问题',
  acquisition_failed: '被收购谈判失败',
  customer_concentration: '客户过度集中',
};

const INDUSTRY: Record<string, string> = { ...INDUSTRY_LABELS };
const COUNTRY: Record<string, string> = { ...COUNTRY_LABELS };
const BUSINESS_MODEL: Record<string, string> = { ...BUSINESS_MODEL_LABELS };
const PRIMARY_FAILURE: Record<string, string> = {
  ...PRIMARY_FAILURE_REASON_LABELS,
};

export function industryLabel(key: string): string {
  return INDUSTRY[key.toLowerCase()] ?? key;
}

export function countryLabel(code: string | null): string {
  if (!code) return '—';
  const u = code.toUpperCase();
  return COUNTRY[u] ?? code;
}

export function businessModelLabel(key: string | null): string {
  if (!key) return '—';
  return BUSINESS_MODEL[key.toLowerCase()] ?? key;
}

export function primaryFailureReasonLabel(key: string | null): string {
  if (!key) return '—';
  return PRIMARY_FAILURE[key.toLowerCase()] ?? key;
}
