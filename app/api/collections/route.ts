import { NextResponse } from 'next/server';
import { getCollectionRecords } from '@/lib/database';

/**
 * GET /api/collections
 * 获取采集记录
 */
export async function GET() {
  try {
    const records = getCollectionRecords();
    
    // 按日期分组统计
    const dailyStats = records.reduce((acc, record) => {
      if (!acc[record.date]) {
        acc[record.date] = {
          date: record.date,
          total: 0,
          success: 0,
          failed: 0,
          sources: {} as Record<string, number>,
        };
      }
      acc[record.date].total += record.count;
      if (record.status === 'success') {
        acc[record.date].success += record.count;
      } else {
        acc[record.date].failed += 1;
      }
      acc[record.date].sources[record.source] = 
        (acc[record.date].sources[record.source] || 0) + record.count;
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({
      success: true,
      records: records.slice(-50), // 返回最近50条记录
      dailyStats: Object.values(dailyStats).reverse(),
      summary: {
        total: records.length,
        success: records.filter(r => r.status === 'success').length,
        failed: records.filter(r => r.status === 'failed').length,
        totalCollected: records.reduce((sum, r) => sum + r.count, 0),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
