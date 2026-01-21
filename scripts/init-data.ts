/**
 * 初始化数据脚本
 * 将startups.ts中的默认数据导入到startups.json
 */
import { defaultStartups } from '../data/startups';
import { saveStartups } from '../lib/database';

// 只在JSON文件为空时导入默认数据
const fs = require('fs');
const path = require('path');

const STARTUPS_FILE = path.join(process.cwd(), 'data', 'startups.json');

if (!fs.existsSync(STARTUPS_FILE) || fs.readFileSync(STARTUPS_FILE, 'utf-8').trim() === '[]') {
  console.log('Initializing default data...');
  // 需要从startups.ts导出defaultStartups
  // 这里先手动导入
  const { startups } = require('../data/startups');
  saveStartups(startups);
  console.log(`Imported ${startups.length} default startups`);
} else {
  console.log('Data file already exists, skipping initialization');
}
