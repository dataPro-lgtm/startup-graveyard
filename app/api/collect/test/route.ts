import { NextResponse } from 'next/server';
import { CollectorManager } from '@/lib/collectorManager';

/**
 * GET /api/collect/test
 * 测试数据采集（不需要认证）
 */
export async function GET() {
  try {
    console.log('Starting test collection...');
    const collectorManager = new CollectorManager();
    const results = await collectorManager.collectAll();

    return NextResponse.json({
      success: true,
      message: 'Test collection completed',
      results,
      note: 'This is a test endpoint. Use /api/collect for production.',
    });
  } catch (error) {
    console.error('Test collection error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
