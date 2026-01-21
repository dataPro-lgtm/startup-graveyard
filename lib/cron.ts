import cron from 'node-cron';
import { CollectorManager } from './collectorManager';

let collectorManager: CollectorManager | null = null;
let cronJob: cron.ScheduledTask | null = null;

/**
 * 启动定时采集任务
 * 默认每天凌晨2点执行
 */
export function startCronJob(cronExpression: string = '0 2 * * *') {
  if (cronJob) {
    console.log('Cron job already running');
    return;
  }

  collectorManager = new CollectorManager();

  console.log(`Starting cron job with schedule: ${cronExpression}`);
  
  cronJob = cron.schedule(cronExpression, async () => {
    console.log('Cron job triggered at', new Date().toISOString());
    try {
      const results = await collectorManager!.collectAll();
      console.log('Cron collection completed:', results);
    } catch (error) {
      console.error('Cron collection error:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  });

  console.log('Cron job started successfully');
}

/**
 * 停止定时采集任务
 */
export function stopCronJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Cron job stopped');
  }
}

/**
 * 获取cron任务状态
 */
export function getCronStatus() {
  return {
    running: cronJob !== null,
    schedule: cronJob ? '0 2 * * *' : null,
  };
}
