/**
 * 初始化默认数据脚本
 * 将startups.ts中的默认数据导入到startups.json
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STARTUPS_FILE = path.join(DATA_DIR, 'startups.json');

// 读取startups.ts中的默认数据（简化版，实际应该用TypeScript编译）
// 这里直接读取JSON，如果为空则从代码中导入
if (!fs.existsSync(STARTUPS_FILE) || fs.readFileSync(STARTUPS_FILE, 'utf-8').trim() === '[]') {
  console.log('Initializing default data...');
  
  // 这里需要手动导入默认数据
  // 实际项目中应该从编译后的JS文件导入
  const defaultData = require('../data/startups.ts');
  
  // 如果无法导入，使用空数组（首次运行会从代码中读取）
  const data = defaultData.defaultStartups || [];
  
  if (data.length > 0) {
    fs.writeFileSync(STARTUPS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✓ Imported ${data.length} default startups`);
  } else {
    console.log('⚠ No default data found, will use empty array');
  }
} else {
  console.log('✓ Data file already exists, skipping initialization');
}
