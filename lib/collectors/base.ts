import { Startup } from '@/types';

export interface CollectorConfig {
  name: string;
  enabled: boolean;
  interval?: string; // cron expression
}

export abstract class BaseCollector {
  protected config: CollectorConfig;

  constructor(config: CollectorConfig) {
    this.config = config;
  }

  // 提供只读访问器，供管理器读取名称/开关状态
  getConfig(): CollectorConfig {
    return this.config;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  abstract collect(): Promise<Startup[]>;

  // 数据标准化
  protected normalizeData(rawData: any): Partial<Startup> {
    return {
      name: rawData.name || '',
      nameEn: rawData.nameEn || rawData.name_en || rawData.englishName,
      industry: rawData.industry || rawData.category || '未知',
      foundedYear: this.parseYear(rawData.foundedYear || rawData.founded_year || rawData.founded),
      closedYear: this.parseYear(rawData.closedYear || rawData.closed_year || rawData.closed),
      totalFunding: this.parseAmount(rawData.totalFunding || rawData.total_funding || rawData.funding),
      lossAmount: this.parseAmount(rawData.lossAmount || rawData.loss_amount || rawData.loss || rawData.totalFunding),
      investors: Array.isArray(rawData.investors) ? rawData.investors : [],
      founders: Array.isArray(rawData.founders) ? rawData.founders : [],
      failureReasons: Array.isArray(rawData.failureReasons) 
        ? rawData.failureReasons 
        : (rawData.failure_reasons ? rawData.failure_reasons.split(/[,，]/) : []),
      description: rawData.description || rawData.summary || '',
      detailedAnalysis: rawData.detailedAnalysis || rawData.detailed_analysis || rawData.analysis || '',
      lessons: Array.isArray(rawData.lessons) ? rawData.lessons : [],
      tags: Array.isArray(rawData.tags) ? rawData.tags : [],
      country: rawData.country || rawData.region || '未知',
      website: rawData.website || rawData.url,
    };
  }

  // 解析年份
  protected parseYear(year: any): number {
    if (typeof year === 'number') return year;
    if (typeof year === 'string') {
      const match = year.match(/\d{4}/);
      if (match) return parseInt(match[0]);
    }
    return new Date().getFullYear();
  }

  // 解析金额（支持多种格式）
  protected parseAmount(amount: any): number {
    if (typeof amount === 'number') return amount;
    if (typeof amount === 'string') {
      // 移除所有非数字字符（除了小数点）
      let numStr = amount.replace(/[^\d.]/g, '');
      let num = parseFloat(numStr);
      
      // 处理单位（亿、万、K、M、B等）
      if (amount.includes('亿') || amount.toLowerCase().includes('b')) {
        num *= 100000000;
      } else if (amount.includes('万') || amount.toLowerCase().includes('m')) {
        num *= 10000;
      } else if (amount.toLowerCase().includes('k')) {
        num *= 1000;
      }
      
      return Math.round(num);
    }
    return 0;
  }

  // 生成唯一ID
  protected generateId(name: string, source: string): string {
    const timestamp = Date.now();
    const nameHash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `${source}-${timestamp}-${nameHash}`;
  }

  // 计算存活年数
  protected calculateLifespan(foundedYear: number, closedYear: number): number {
    return Math.max(0, closedYear - foundedYear);
  }
}
