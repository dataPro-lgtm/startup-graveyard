import { BaseCollector } from './collectors/base';
import { WebCollector } from './collectors/webCollector';
import { AICollector } from './collectors/aiCollector';
import { ManualCollector } from './collectors/manualCollector';
import { DataProcessor } from './dataProcessor';
import { addStartup, addCollectionRecord, CollectionRecord } from './database';
import { Startup } from '@/types';
import { format } from 'date-fns';

export class CollectorManager {
  private collectors: BaseCollector[] = [];

  constructor() {
    // 初始化采集器
    this.collectors = [
      new WebCollector({ name: 'WebCollector', enabled: true }),
      new AICollector({ name: 'AICollector', enabled: !!process.env.OPENAI_API_KEY }),
      new ManualCollector({ name: 'ManualCollector', enabled: true }),
    ];
  }

  /**
   * 执行一次完整的数据采集
   */
  async collectAll(): Promise<{ success: number; failed: number; total: number }> {
    const results = {
      success: 0,
      failed: 0,
      total: 0,
    };

    for (const collector of this.collectors) {
      if (!collector.isEnabled()) {
        continue;
      }

      try {
        const cfg = collector.getConfig();
        console.log(`Starting collection from ${cfg.name}...`);
        const startTime = Date.now();
        
        // 采集数据
        const rawStartups = await collector.collect();
        
        // 处理数据
        const processedStartups = DataProcessor.process(rawStartups);
        
        // 保存数据
        for (const startup of processedStartups) {
          try {
            addStartup(startup);
            results.success++;
          } catch (error) {
            console.error(`Error saving startup ${startup.name}:`, error);
            results.failed++;
          }
        }

        results.total += processedStartups.length;
        
        const duration = Date.now() - startTime;
        
        // 记录采集日志
        const record: CollectionRecord = {
          id: `collect-${Date.now()}-${cfg.name}`,
          date: format(new Date(), 'yyyy-MM-dd'),
          source: cfg.name,
          count: processedStartups.length,
          status: 'success',
          createdAt: new Date().toISOString(),
        };
        addCollectionRecord(record);

        console.log(`✓ Collected ${processedStartups.length} startups from ${cfg.name} in ${duration}ms`);
      } catch (error) {
        const cfg = collector.getConfig();
        console.error(`✗ Error collecting from ${cfg.name}:`, error);
        results.failed++;

        // 记录失败日志
        const record: CollectionRecord = {
          id: `collect-${Date.now()}-${cfg.name}`,
          date: format(new Date(), 'yyyy-MM-dd'),
          source: cfg.name,
          count: 0,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          createdAt: new Date().toISOString(),
        };
        addCollectionRecord(record);
      }
    }

    return results;
  }

  /**
   * 获取采集器状态
   */
  getCollectorStatus(): Array<{ name: string; enabled: boolean }> {
    return this.collectors.map(c => {
      const cfg = c.getConfig();
      return {
        name: cfg.name,
        enabled: cfg.enabled,
      };
    });
  }
}
