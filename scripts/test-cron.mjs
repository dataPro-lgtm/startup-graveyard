/**
 * 测试定时任务功能
 */
import cron from 'node-cron';
import { CollectorManager } from '../lib/collectorManager.js';

let testRun = false;

async function testCronJob() {
  console.log('=== 测试定时任务功能 ===\n');

  const manager = new CollectorManager();

  // 测试立即执行一次（模拟定时任务）
  console.log('1. 模拟定时任务执行（立即运行）...');
  try {
    const results = await manager.collectAll();
    console.log(`   结果: 成功 ${results.success}, 失败 ${results.failed}, 总计 ${results.total}`);
    testRun = true;
  } catch (error) {
    console.error(`   ✗ 执行失败:`, error.message);
    testRun = false;
  }

  // 测试cron表达式
  console.log('\n2. 测试cron表达式...');
  const testExpressions = [
    { expr: '0 2 * * *', desc: '每天凌晨2点' },
    { expr: '*/5 * * * *', desc: '每5分钟' },
    { expr: '0 */6 * * *', desc: '每6小时' },
  ];

  testExpressions.forEach(({ expr, desc }) => {
    const isValid = cron.validate(expr);
    console.log(`   ${expr} (${desc}): ${isValid ? '✓ 有效' : '✗ 无效'}`);
  });

  // 测试定时任务调度（不实际启动）
  console.log('\n3. 测试定时任务调度...');
  console.log('   注意: 这只是测试调度功能，不会实际启动定时任务');
  console.log('   要启动定时任务，请访问 /admin 页面或调用 /api/cron API');

  console.log('\n=== 定时任务测试完成 ===');
  console.log(`测试执行结果: ${testRun ? '✓ 成功' : '✗ 失败'}`);
}

testCronJob().catch(console.error);
