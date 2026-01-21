import { Startup } from '@/types';

/**
 * 数据处理器
 * 清洗、去重、标准化采集的数据
 */
export class DataProcessor {
  /**
   * 处理采集的数据
   */
  static process(rawStartups: Startup[]): Startup[] {
    // 1. 数据清洗
    const cleaned = rawStartups.map(startup => this.cleanData(startup));

    // 2. 数据验证
    const validated = cleaned.filter(startup => this.validateData(startup));

    // 3. 去重
    const deduplicated = this.deduplicate(validated);

    // 4. 数据增强
    const enhanced = deduplicated.map(startup => this.enhanceData(startup));

    return enhanced;
  }

  /**
   * 清洗数据
   */
  private static cleanData(startup: Startup): Startup {
    return {
      ...startup,
      name: startup.name.trim(),
      nameEn: startup.nameEn?.trim(),
      description: startup.description.trim(),
      detailedAnalysis: startup.detailedAnalysis.trim(),
      industry: this.normalizeIndustry(startup.industry),
      country: this.normalizeCountry(startup.country),
      failureReasons: startup.failureReasons.map(r => r.trim()).filter(r => r.length > 0),
      tags: startup.tags.map(t => t.trim()).filter(t => t.length > 0),
      // 确保年份合理
      foundedYear: this.validateYear(startup.foundedYear),
      closedYear: this.validateYear(startup.closedYear),
      // 重新计算存活年数
      lifespan: Math.max(0, startup.closedYear - startup.foundedYear),
    };
  }

  /**
   * 验证数据
   */
  private static validateData(startup: Startup): boolean {
    // 必须有名称
    if (!startup.name || startup.name.length < 2) {
      return false;
    }

    // 年份必须合理
    if (startup.foundedYear < 1900 || startup.foundedYear > new Date().getFullYear()) {
      return false;
    }

    if (startup.closedYear < startup.foundedYear || startup.closedYear > new Date().getFullYear() + 1) {
      return false;
    }

    // 必须有描述或失败原因
    if (!startup.description && startup.failureReasons.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * 去重
   */
  private static deduplicate(startups: Startup[]): Startup[] {
    const seen = new Set<string>();
    const result: Startup[] = [];

    for (const startup of startups) {
      // 使用名称和成立年份作为唯一标识
      const key = `${startup.name.toLowerCase()}-${startup.foundedYear}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        result.push(startup);
      } else {
        // 如果已存在，合并数据（保留更完整的信息）
        const existing = result.find(s => 
          s.name.toLowerCase() === startup.name.toLowerCase() && 
          s.foundedYear === startup.foundedYear
        );
        if (existing) {
          // 合并失败原因、标签等
          existing.failureReasons = [
            ...new Set([...existing.failureReasons, ...startup.failureReasons])
          ];
          existing.tags = [
            ...new Set([...existing.tags, ...startup.tags])
          ];
          // 保留更详细的描述
          if (startup.detailedAnalysis.length > existing.detailedAnalysis.length) {
            existing.detailedAnalysis = startup.detailedAnalysis;
          }
        }
      }
    }

    return result;
  }

  /**
   * 增强数据
   */
  private static enhanceData(startup: Startup): Startup {
    // 如果没有详细分析，生成一个
    if (!startup.detailedAnalysis && startup.description) {
      startup.detailedAnalysis = `${startup.description}\n\n${startup.name}成立于${startup.foundedYear}年，在${startup.closedYear}年停止运营，存活了${startup.lifespan}年。`;
    }

    // 如果没有经验教训，尝试从失败原因生成
    if (startup.lessons.length === 0 && startup.failureReasons.length > 0) {
      startup.lessons = startup.failureReasons.map(reason => 
        `避免${reason}，建立更稳健的商业模式`
      );
    }

    // 自动生成标签
    if (startup.tags.length === 0) {
      startup.tags = [startup.industry, startup.country];
    }

    return startup;
  }

  /**
   * 标准化行业名称
   */
  private static normalizeIndustry(industry: string): string {
    const industryMap: Record<string, string> = {
      '互联网': '互联网',
      '移动互联网': '互联网',
      '电商': '电商',
      '电子商务': '电商',
      'O2O': 'O2O',
      '共享经济': '共享经济',
      '金融科技': '金融科技',
      'FinTech': '金融科技',
      '医疗健康': '医疗健康',
      '教育': '教育',
      '企业服务': '企业服务',
      'SaaS': '企业服务',
      '新消费': '新消费',
      '消费升级': '新消费',
    };

    return industryMap[industry] || industry;
  }

  /**
   * 标准化国家名称
   */
  private static normalizeCountry(country: string): string {
    const countryMap: Record<string, string> = {
      '中国': '中国',
      'China': '中国',
      'CN': '中国',
      '美国': '美国',
      'USA': '美国',
      'US': '美国',
      'United States': '美国',
    };

    return countryMap[country] || country;
  }

  /**
   * 验证年份
   */
  private static validateYear(year: number): number {
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear + 1) {
      return currentYear;
    }
    return year;
  }
}
