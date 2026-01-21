/**
 * 测试数据采集脚本
 */
import { CollectorManager } from '../lib/collectorManager.js';

async function main() {
  console.log('Starting data collection test...\n');
  
  const manager = new CollectorManager();
  
  try {
    const results = await manager.collectAll();
    
    console.log('\n=== Collection Results ===');
    console.log(`Total collected: ${results.total}`);
    console.log(`Success: ${results.success}`);
    console.log(`Failed: ${results.failed}`);
    
    if (results.total > 0) {
      console.log('\n✓ Collection completed successfully!');
    } else {
      console.log('\n⚠ No new data collected. This is normal if:');
      console.log('  - Web sources are blocked or require authentication');
      console.log('  - AI API keys are not configured');
      console.log('  - Manual collectors need API keys');
    }
  } catch (error) {
    console.error('\n✗ Collection failed:', error);
    process.exit(1);
  }
}

main();
