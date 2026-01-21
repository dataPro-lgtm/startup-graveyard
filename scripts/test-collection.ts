/**
 * 测试数据采集功能
 */
import { CollectorManager } from '../lib/collectorManager';
import { getStartups, getCollectionRecords } from '../lib/database';

async function testCollection() {
  console.log('=== 测试数据采集功能 ===\n');

  // 1. 检查当前数据状态
  console.log('1. 检查当前数据状态...');
  const beforeStartups = getStartups();
  const beforeRecords = getCollectionRecords();
  console.log(`   当前案例数: ${beforeStartups.length}`);
  console.log(`   当前采集记录数: ${beforeRecords.length}\n`);

  // 2. 测试采集器状态
  console.log('2. 检查采集器状态...');
  const manager = new CollectorManager();
  const status = manager.getCollectorStatus();
  console.log('   采集器状态:');
  status.forEach(collector => {
    console.log(`   - ${collector.name}: ${collector.enabled ? '✓ 启用' : '✗ 禁用'}`);
  });
  console.log('');

  // 3. 执行采集
  console.log('3. 开始执行采集...');
  try {
    const results = await manager.collectAll();
    
    console.log('\n4. 采集结果:');
    console.log(`   成功: ${results.success}`);
    console.log(`   失败: ${results.failed}`);
    console.log(`   总计: ${results.total}`);

    // 4. 检查采集后的数据
    console.log('\n5. 检查采集后的数据...');
    const afterStartups = getStartups();
    const afterRecords = getCollectionRecords();
    console.log(`   采集后案例数: ${afterStartups.length}`);
    console.log(`   新增案例数: ${afterStartups.length - beforeStartups.length}`);
    console.log(`   采集记录数: ${afterRecords.length}`);
    console.log(`   新增记录数: ${afterRecords.length - beforeRecords.length}`);

    // 5. 显示最新的采集记录
    if (afterRecords.length > beforeRecords.length) {
      console.log('\n6. 最新采集记录:');
      const newRecords = afterRecords.slice(beforeRecords.length);
      newRecords.forEach(record => {
        console.log(`   - ${record.source}: ${record.status === 'success' ? '✓' : '✗'} ${record.count} 个案例`);
        if (record.error) {
          console.log(`     错误: ${record.error}`);
        }
      });
    }

    console.log('\n=== 测试完成 ===');
  } catch (error) {
    console.error('\n✗ 采集测试失败:', error);
    process.exit(1);
  }
}

testCollection();
