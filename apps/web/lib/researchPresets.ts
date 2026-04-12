import type { CasesSearchParams } from './casesApi';

export type ResearchPreset = {
  slug: string;
  title: string;
  description: string;
  filters: CasesSearchParams;
  copilotQuestion: string;
  accent: string;
};

export const RESEARCH_PRESETS: ResearchPreset[] = [
  {
    slug: 'premature-scaling',
    title: '过早扩张专题',
    description: '看融资充裕、扩张过快、单位经济失真如何把公司拖进现金流黑洞。',
    filters: { primaryFailureReasonKey: 'premature_scaling' },
    copilotQuestion: '过早扩张通常是如何一步步把创业公司拖垮的？',
    accent: '#5b7cff',
  },
  {
    slug: 'regulatory-shocks',
    title: '监管击穿专题',
    description: '聚焦监管、诉讼、合规收紧如何直接击穿商业模式。',
    filters: { primaryFailureReasonKey: 'regulatory' },
    copilotQuestion: '监管和合规风险通常通过哪些路径击穿创业公司的商业模式？',
    accent: '#ff8a65',
  },
  {
    slug: 'marketplace-burn',
    title: '平台模式失速',
    description: '研究 marketplace 模式在供给、履约、补贴和金融结构上的共性脆弱点。',
    filters: { businessModelKey: 'marketplace' },
    copilotQuestion: '平台撮合型创业公司最常见的失败路径是什么？',
    accent: '#18b981',
  },
  {
    slug: 'china-failures',
    title: '中国案例波段',
    description: '从中国样本里看资本泡沫、监管窗口和扩张逻辑的独特失败模式。',
    filters: { country: 'CN' },
    copilotQuestion: '中国创业失败案例里最反复出现的模式是什么？',
    accent: '#f4b544',
  },
  {
    slug: 'real-estate-meltdown',
    title: '地产与长租危机',
    description: '追踪重资产、租金杠杆与运营现金流错配如何引发连锁崩塌。',
    filters: { industry: 'real_estate' },
    copilotQuestion: '房地产和长租公寓创业公司为什么特别容易出现流动性崩盘？',
    accent: '#e66b9a',
  },
];
