import fs from 'fs';
import path from 'path';
import { Startup } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const STARTUPS_FILE = path.join(DATA_DIR, 'startups.json');
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 读取startups数据
export function getStartups(): Startup[] {
  try {
    if (fs.existsSync(STARTUPS_FILE)) {
      const data = fs.readFileSync(STARTUPS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading startups file:', error);
  }
  return [];
}

// 保存startups数据
export function saveStartups(startups: Startup[]): void {
  try {
    fs.writeFileSync(STARTUPS_FILE, JSON.stringify(startups, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving startups file:', error);
    throw error;
  }
}

// 添加新的startup
export function addStartup(startup: Startup): void {
  const startups = getStartups();
  // 检查是否已存在（根据ID或名称）
  const exists = startups.some(s => s.id === startup.id || s.name === startup.name);
  if (!exists) {
    startups.push(startup);
    saveStartups(startups);
  }
}

// 更新startup
export function updateStartup(id: string, updates: Partial<Startup>): void {
  const startups = getStartups();
  const index = startups.findIndex(s => s.id === id);
  if (index !== -1) {
    startups[index] = { ...startups[index], ...updates };
    saveStartups(startups);
  }
}

// 获取采集记录
export interface CollectionRecord {
  id: string;
  date: string;
  source: string;
  count: number;
  status: 'success' | 'failed';
  error?: string;
  createdAt: string;
}

export function getCollectionRecords(): CollectionRecord[] {
  try {
    if (fs.existsSync(COLLECTIONS_FILE)) {
      const data = fs.readFileSync(COLLECTIONS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading collections file:', error);
  }
  return [];
}

export function addCollectionRecord(record: CollectionRecord): void {
  try {
    const records = getCollectionRecords();
    records.push(record);
    fs.writeFileSync(COLLECTIONS_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving collection record:', error);
  }
}
