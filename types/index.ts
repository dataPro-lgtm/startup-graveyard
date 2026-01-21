export interface Startup {
  id: string;
  name: string;
  nameEn?: string;
  logo?: string;
  industry: string;
  foundedYear: number;
  closedYear: number;
  lifespan: number; // 存活年数
  totalFunding: number; // 总融资额（美元）
  lossAmount: number; // 亏损金额（美元）
  investors: string[];
  founders: string[];
  failureReasons: string[];
  description: string;
  detailedAnalysis: string;
  lessons: string[];
  tags: string[];
  country: string;
  website?: string;
}

export type SortOption = 'funding' | 'loss' | 'lifespan' | 'closed';
export type FilterOption = {
  industry?: string;
  reason?: string;
  country?: string;
  decade?: string;
};
