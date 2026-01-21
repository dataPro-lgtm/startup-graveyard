import { NextResponse } from 'next/server';
import { getStartups } from '@/lib/database';
import { defaultStartups } from '@/data/startups';

/**
 * GET /api/startups
 * 获取所有startups数据（服务端API）
 */
export async function GET() {
  try {
    // 优先从JSON文件读取
    let startups = getStartups();
    
    // 如果JSON文件为空，返回默认数据
    if (!startups || startups.length === 0) {
      startups = defaultStartups;
    }
    
    return NextResponse.json({
      success: true,
      startups,
      count: startups.length,
    });
  } catch (error) {
    // 出错时返回默认数据
    console.error('Error loading startups:', error);
    return NextResponse.json({
      success: true,
      startups: defaultStartups,
      count: defaultStartups.length,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
