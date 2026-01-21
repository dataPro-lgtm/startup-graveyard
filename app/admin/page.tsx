'use client';

import { useState, useEffect } from 'react';
import { Play, Square, RefreshCw, BarChart3, Clock, CheckCircle, XCircle } from 'lucide-react';

interface CollectionRecord {
  id: string;
  date: string;
  source: string;
  count: number;
  status: 'success' | 'failed';
  error?: string;
  createdAt: string;
}

interface CollectionStats {
  total: number;
  success: number;
  failed: number;
  totalCollected: number;
}

export default function AdminPage() {
  const [collecting, setCollecting] = useState(false);
  const [cronRunning, setCronRunning] = useState(false);
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [dailyStats, setDailyStats] = useState<any[]>([]);

  useEffect(() => {
    loadStatus();
    loadCollections();
  }, []);

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/cron/status');
      const data = await res.json();
      if (data.success) {
        setCronRunning(data.status.running);
      }
    } catch (error) {
      console.error('Error loading cron status:', error);
    }
  };

  const loadCollections = async () => {
    try {
      const res = await fetch('/api/collections');
      const data = await res.json();
      if (data.success) {
        setRecords(data.records);
        setStats(data.summary);
        setDailyStats(data.dailyStats);
      }
    } catch (error) {
      console.error('Error loading collections:', error);
    }
  };

  const handleCollect = async () => {
    setCollecting(true);
    try {
      // 先尝试使用测试端点（不需要认证）
      let res = await fetch('/api/collect/test', {
        method: 'GET',
      });
      
      // 如果测试端点失败，尝试正式端点
      if (!res.ok) {
        res = await fetch('/api/collect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      
      const data = await res.json();
      
      if (data.success) {
        alert(`采集完成！成功: ${data.results.success}, 失败: ${data.results.failed}, 总计: ${data.results.total}`);
        // 刷新页面数据
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        alert(`采集失败: ${data.error}`);
      }
    } catch (error) {
      alert(`采集错误: ${error}`);
    } finally {
      setCollecting(false);
    }
  };

  const handleCronToggle = async () => {
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: cronRunning ? 'stop' : 'start',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCronRunning(data.status.running);
        alert(cronRunning ? '定时任务已停止' : '定时任务已启动');
      }
    } catch (error) {
      alert(`操作失败: ${error}`);
    }
  };

  return (
    <div className="min-h-screen bg-graveyard-dark p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">数据采集管理</h1>
          <p className="text-gray-400">管理自动数据采集任务和查看采集记录</p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-graveyard-gray to-graveyard-dark border-2 border-blue-500/30 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Play className="w-5 h-5 text-blue-400" />
              手动采集
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              立即执行一次数据采集任务
            </p>
            <button
              onClick={handleCollect}
              disabled={collecting}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {collecting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  采集中...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  开始采集
                </>
              )}
            </button>
          </div>

          <div className="bg-gradient-to-br from-graveyard-gray to-graveyard-dark border-2 border-purple-500/30 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-400" />
              定时任务
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              每天凌晨2点自动采集数据
            </p>
            <button
              onClick={handleCronToggle}
              className={`w-full px-6 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                cronRunning
                  ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600'
                  : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600'
              }`}
            >
              {cronRunning ? (
                <>
                  <Square className="w-5 h-5" />
                  停止定时任务
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  启动定时任务
                </>
              )}
            </button>
            {cronRunning && (
              <p className="text-green-400 text-sm mt-2 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                定时任务运行中
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-400">{stats.total}</div>
              <div className="text-sm text-gray-400 mt-1">总采集次数</div>
            </div>
            <div className="bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-500/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">{stats.success}</div>
              <div className="text-sm text-gray-400 mt-1">成功次数</div>
            </div>
            <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 border border-red-500/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
              <div className="text-sm text-gray-400 mt-1">失败次数</div>
            </div>
            <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-400">{stats.totalCollected}</div>
              <div className="text-sm text-gray-400 mt-1">采集案例数</div>
            </div>
          </div>
        )}

        {/* Daily Stats */}
        {dailyStats.length > 0 && (
          <div className="bg-gradient-to-br from-graveyard-gray to-graveyard-dark border-2 border-gray-700 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              每日采集统计
            </h2>
            <div className="space-y-3">
              {dailyStats.slice(0, 7).map((day: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 bg-graveyard-dark/50 rounded-lg border border-gray-700"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-lg font-bold text-gray-300">{day.date}</div>
                    <div className="text-sm text-gray-400">
                      成功: <span className="text-green-400 font-bold">{day.success}</span>
                    </div>
                    <div className="text-sm text-gray-400">
                      失败: <span className="text-red-400 font-bold">{day.failed}</span>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-blue-400">{day.total} 个</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Records */}
        <div className="bg-gradient-to-br from-graveyard-gray to-graveyard-dark border-2 border-gray-700 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            最近采集记录
          </h2>
          <div className="space-y-2">
            {records.length === 0 ? (
              <p className="text-gray-500 text-center py-8">暂无采集记录</p>
            ) : (
              records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-4 bg-graveyard-dark/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {record.status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                    <div>
                      <div className="font-medium text-gray-200">{record.source}</div>
                      <div className="text-sm text-gray-400">
                        {new Date(record.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg text-gray-200">{record.count} 个</div>
                    {record.error && (
                      <div className="text-xs text-red-400 mt-1">{record.error}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
