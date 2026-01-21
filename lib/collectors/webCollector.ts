import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseCollector } from './base';
import { Startup } from '@/types';

interface WebSource {
  name: string;
  url: string;
  selectors: {
    list: string;
    title: string;
    link?: string;
    description?: string;
  };
}

export class WebCollector extends BaseCollector {
  private sources: WebSource[] = [
    {
      name: '36Kr失败案例',
      url: 'https://36kr.com/search/articles/创业失败',
      selectors: {
        list: '.article-item',
        title: '.article-title',
        link: 'a',
        description: '.article-summary',
      },
    },
  ];

  async collect(): Promise<Startup[]> {
    const startups: Startup[] = [];

    for (const source of this.sources) {
      try {
        console.log(`Collecting from ${source.name}...`);
        const data = await this.collectFromSource(source);
        startups.push(...data);
      } catch (error) {
        console.error(`Error collecting from ${source.name}:`, error);
      }
    }

    return startups;
  }

  private async collectFromSource(source: WebSource): Promise<Startup[]> {
    try {
      const response = await axios.get(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      const startups: Startup[] = [];

      $(source.selectors.list).each((index, element) => {
        try {
          const title = $(element).find(source.selectors.title).text().trim();
          const rawLink = source.selectors.link
            ? $(element).find(source.selectors.link).attr('href')
            : '';
          const link: string = rawLink || '';
          const description = source.selectors.description
            ? $(element).find(source.selectors.description).text().trim()
            : '';

          if (title) {
            const sourceName: string = source.name ?? 'Unknown Source';
            const startup = this.parseArticle(title, description, link, sourceName);
            if (startup) {
              startups.push(startup);
            }
          }
        } catch (error) {
          console.error('Error parsing article:', error);
        }
      });

      return startups;
    } catch (error) {
      console.error(`Error fetching from ${source.url}:`, error);
      return [];
    }
  }

  private parseArticle(title: string, description: string, link: string, source: string): Startup | null {
    // 简单的解析逻辑，实际需要更复杂的NLP处理
    // 这里只是示例，实际应该调用AI API或使用更复杂的解析
    
    // 尝试从标题提取信息
    const nameMatch = title.match(/(.+?)(?:失败|倒闭|破产|停止运营)/);
    const name = nameMatch ? nameMatch[1].trim() : title;

    // 生成基础数据
    const normalized = this.normalizeData({
      name,
      description: description || title,
      source,
    });

    return {
      id: this.generateId(name, source),
      name: normalized.name!,
      nameEn: normalized.nameEn,
      industry: normalized.industry || '未知',
      foundedYear: normalized.foundedYear || 2020,
      closedYear: normalized.closedYear || new Date().getFullYear(),
      lifespan: this.calculateLifespan(
        normalized.foundedYear || 2020,
        normalized.closedYear || new Date().getFullYear()
      ),
      totalFunding: normalized.totalFunding || 0,
      lossAmount: normalized.lossAmount || normalized.totalFunding || 0,
      investors: normalized.investors || [],
      founders: normalized.founders || [],
      failureReasons: normalized.failureReasons || ['待分析'],
      description: normalized.description || '',
      detailedAnalysis: normalized.detailedAnalysis || '',
      lessons: normalized.lessons || [],
      tags: normalized.tags || [source],
      country: normalized.country || '中国',
      website: link || normalized.website,
    };
  }
}
