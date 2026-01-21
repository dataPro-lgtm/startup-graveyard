/**
 * 快速测试采集功能
 */
import { CollectorManager } from '../lib/collectorManager.js';
import { getStartups, getCollectionRecords } from '../lib/database.js';

async function quickTest() {
  console.log('=== 快速测试数据采集功能 ===\n');

  // 1. 检查当前数据
  console.log('1. 当前数据状态:');
  const beforeStartups = getStartups();
  const beforeRecords = getCollectionRecords();
  console.log(`   - 案例数: ${beforeStartups.length}`);
  console.log(`   - 采集记录数: ${beforeRecords.length}\n`);

  // 2. 检查采集器
  console.log('2. 采集器状态:');
  const manager = new CollectorManager();
  const status = manager.getCollectorStatus();
  status.forEach(c => {
    console.log(`   - ${c.name}: ${c.enabled ? '✓' : '✗'}`);
  });
  console.log('');

  // 3. 执行采集
  console.log('3. 执行采集...');
  try {
    const results = await manager.collectAll();
    console.log(`   结果: 成功 ${results.success}, 失败 ${results.failed}, 总计 ${results.total}\n`);

    // 4. 检查结果
    const afterStartups = getStartups();
    const afterRecords = getCollectionRecords();
    console.log('4. 采集后数据:');
    console.log(`   - 案例数: ${afterStartups.length} (新增 ${afterStartups.length - beforeStartups.length})`);
    console.log(`   - 采集记录数: ${afterRecords.length} (新增 ${afterRecords.length - beforeRecords.length})`);

    if (afterRecords.length > beforeRecords.length) {
      console.log('\n5. 最新采集记录:');
      afterRecords.slice(beforeRecords.length).forEach(r => {
        console.log(`   - ${r.source}: ${r.status} (${r.count} 个)`);
      });
    }

    console.log('\n✓ 测试完成！');
  } catch (error) {
    console.error('\n✗ 测试失败:', error.message);
    console.error(error.stack);
  }
}

quickTest();
