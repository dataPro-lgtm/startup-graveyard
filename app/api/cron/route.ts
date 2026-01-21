import { NextRequest, NextResponse } from 'next/server';
import { startCronJob, stopCronJob, getCronStatus } from '@/lib/cron';

/**
 * POST /api/cron/start
 * 启动定时采集任务
 */
export async function POST(request: NextRequest) {
  try {
    const { action, schedule } = await request.json().catch(() => ({}));

    if (action === 'start') {
      startCronJob(schedule || '0 2 * * *');
      return NextResponse.json({
        success: true,
        message: 'Cron job started',
        status: getCronStatus(),
      });
    } else if (action === 'stop') {
      stopCronJob();
      return NextResponse.json({
        success: true,
        message: 'Cron job stopped',
        status: getCronStatus(),
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }
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

/**
 * GET /api/cron/status
 * 获取定时任务状态
 */
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      status: getCronStatus(),
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
