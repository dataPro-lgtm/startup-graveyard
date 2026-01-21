import { NextRequest, NextResponse } from 'next/server';
import { CollectorManager } from '@/lib/collectorManager';

const collectorManager = new CollectorManager();

/**
 * POST /api/collect
 * 手动触发数据采集
 */
export async function POST(request: NextRequest) {
  try {
    // 可以添加认证逻辑
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.COLLECT_API_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Starting manual data collection...');
    const results = await collectorManager.collectAll();

    return NextResponse.json({
      success: true,
      message: 'Collection completed',
      results,
    });
  } catch (error) {
    console.error('Collection error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/collect/status
 * 获取采集器状态
 */
export async function GET() {
  try {
    const status = collectorManager.getCollectorStatus();
    return NextResponse.json({
      success: true,
      collectors: status,
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
