'use client';

import { useState, useMemo } from 'react';
import { Startup } from '@/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList, Legend } from 'recharts';
import { TrendingDown, DollarSign, Calendar, Building2, Sparkles } from 'lucide-react';

interface StatsPanelProps {
  startups: Startup[];
}

export default function StatsPanel({ startups }: StatsPanelProps) {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [hoveredPie, setHoveredPie] = useState<number | null>(null);

  // 确保startups是数组且不为空
  if (!startups || startups.length === 0) {
    return null;
  }

  // 使用useMemo确保数据计算基于传入的startups
  const statsData = useMemo(() => {
    if (!startups || startups.length === 0) {
      return {
        totalLoss: 0,
        totalFunding: 0,
        avgLifespan: 0,
        industryStats: {},
        reasonStats: {},
        countryStats: {},
      };
    }

    // 行业分布统计
    const industryStats = startups.reduce((acc, startup) => {
      acc[startup.industry] = (acc[startup.industry] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 失败原因统计
    const reasonStats = startups.reduce((acc, startup) => {
      startup.failureReasons.forEach(reason => {
        acc[reason] = (acc[reason] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    // 国家分布
    const countryStats = startups.reduce((acc, startup) => {
      acc[startup.country] = (acc[startup.country] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalLoss = startups.reduce((sum, s) => sum + (s.lossAmount || 0), 0);
    const totalFunding = startups.reduce((sum, s) => sum + (s.totalFunding || 0), 0);
    const avgLifespan = startups.length > 0 
      ? startups.reduce((sum, s) => sum + (s.lifespan || 0), 0) / startups.length 
      : 0;

    return {
      totalLoss,
      totalFunding,
      avgLifespan,
      industryStats,
      reasonStats,
      countryStats,
    };
  }, [startups]);

  // 处理图表数据
  const industryData = Object.entries(statsData.industryStats)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const reasonData = Object.entries(statsData.reasonStats)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const countryData = Object.entries(statsData.countryStats).map(([name, value]) => ({
    name,
    value,
  }));

  // 炫酷渐变色
  const COLORS = [
    'url(#colorRed)',
    'url(#colorOrange)',
    'url(#colorYellow)',
    'url(#colorGreen)',
    'url(#colorBlue)',
    'url(#colorPurple)',
  ];

  const COLOR_SOLID = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

  // 自定义Tooltip组件
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-red-500/50 rounded-xl p-4 shadow-2xl backdrop-blur-sm">
          <p className="text-white font-bold mb-2 text-lg">{label}</p>
          <p className="text-red-400 text-xl font-bold">
            {payload[0].value} {payload[0].name === 'value' ? '个案例' : ''}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-graveyard-darker border-b border-graveyard-light relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 left-10 text-6xl animate-pulse">📊</div>
        <div className="absolute bottom-20 right-10 text-5xl animate-pulse" style={{ animationDelay: '1s' }}>📈</div>
      </div>

      <div className="container mx-auto px-4 py-6 relative z-10">
        {/* Key Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 border-2 border-red-500/30 rounded-xl p-4 hover:border-red-500/60 hover:scale-105 transition-all group cursor-pointer">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <TrendingDown className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">累计亏损</span>
            </div>
            <div className="text-2xl font-bold text-red-400 group-hover:text-red-300 transition-colors">
              ${(statsData.totalLoss / 1000000000).toFixed(1)}B
            </div>
          </div>
          <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border-2 border-yellow-500/30 rounded-xl p-4 hover:border-yellow-500/60 hover:scale-105 transition-all group cursor-pointer">
            <div className="flex items-center gap-2 text-yellow-400 mb-2">
              <DollarSign className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">总融资额</span>
            </div>
            <div className="text-2xl font-bold text-yellow-400 group-hover:text-yellow-300 transition-colors">
              ${(statsData.totalFunding / 1000000000).toFixed(1)}B
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-2 border-blue-500/30 rounded-xl p-4 hover:border-blue-500/60 hover:scale-105 transition-all group cursor-pointer">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">平均存活</span>
            </div>
            <div className="text-2xl font-bold text-blue-400 group-hover:text-blue-300 transition-colors">
              {statsData.avgLifespan.toFixed(1)} 年
            </div>
          </div>
          <div className="bg-gradient-to-br from-gray-800/20 to-gray-700/10 border-2 border-gray-500/30 rounded-xl p-4 hover:border-gray-400/60 hover:scale-105 transition-all group cursor-pointer">
            <div className="flex items-center gap-2 text-gray-400 mb-2">
              <Building2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">失败案例</span>
            </div>
            <div className="text-2xl font-bold text-gray-300 group-hover:text-white transition-colors">
              {startups.length}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Industry Distribution */}
          <div className="bg-gradient-to-br from-graveyard-gray to-graveyard-dark border-2 border-red-500/20 rounded-xl p-6 hover:border-red-500/40 transition-all group">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-red-400" />
              <h3 className="text-lg font-bold text-gray-200">行业分布</h3>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart 
                data={industryData}
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="colorIndustry" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                    <stop offset="100%" stopColor="#991b1b" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 'bold' }}
                  axisLine={{ stroke: '#4b5563', strokeWidth: 2 }}
                />
                <YAxis 
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  axisLine={{ stroke: '#4b5563', strokeWidth: 2 }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(239, 68, 68, 0.1)' }} />
                <Bar 
                  dataKey="value" 
                  fill="url(#colorIndustry)"
                  radius={[8, 8, 0, 0]}
                  animationDuration={1500}
                  animationEasing="ease-out"
                  onMouseEnter={() => setHoveredBar('industry')}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{
                    filter: hoveredBar === 'industry' ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' : 'none',
                    transition: 'filter 0.3s ease',
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Failure Reasons */}
          <div className="bg-gradient-to-br from-graveyard-gray to-graveyard-dark border-2 border-orange-500/20 rounded-xl p-6 hover:border-orange-500/40 transition-all group">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-orange-400" />
              <h3 className="text-lg font-bold text-gray-200">主要失败原因</h3>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart 
                data={reasonData} 
                layout="vertical"
                margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="colorReason" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={1} />
                    <stop offset="100%" stopColor="#ea580c" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <XAxis 
                  type="number" 
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  axisLine={{ stroke: '#4b5563', strokeWidth: 2 }}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 'bold' }} 
                  width={100}
                  axisLine={{ stroke: '#4b5563', strokeWidth: 2 }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(249, 115, 22, 0.1)' }} />
                <Bar 
                  dataKey="value" 
                  fill="url(#colorReason)"
                  radius={[0, 8, 8, 0]}
                  animationDuration={1500}
                  animationEasing="ease-out"
                  onMouseEnter={() => setHoveredBar('reason')}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{
                    filter: hoveredBar === 'reason' ? 'drop-shadow(0 0 8px rgba(249, 115, 22, 0.6))' : 'none',
                    transition: 'filter 0.3s ease',
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Country Distribution */}
          <div className="bg-gradient-to-br from-graveyard-gray to-graveyard-dark border-2 border-purple-500/20 rounded-xl p-6 hover:border-purple-500/40 transition-all group">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-bold text-gray-200">国家/地区分布</h3>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <defs>
                  <linearGradient id="colorRed" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="colorOrange" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={1} />
                    <stop offset="100%" stopColor="#ea580c" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="colorYellow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#eab308" stopOpacity={1} />
                    <stop offset="100%" stopColor="#ca8a04" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="colorGreen" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={1} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="colorBlue" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="colorPurple" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <Pie
                  data={countryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={90}
                  innerRadius={30}
                  fill="#8884d8"
                  dataKey="value"
                  animationDuration={1500}
                  animationEasing="ease-out"
                  onMouseEnter={(_, index) => setHoveredPie(index)}
                  onMouseLeave={() => setHoveredPie(null)}
                >
                  {countryData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]}
                      style={{
                        filter: hoveredPie === index 
                          ? `drop-shadow(0 0 12px ${COLOR_SOLID[index % COLOR_SOLID.length]})` 
                          : 'none',
                        transition: 'filter 0.3s ease, transform 0.3s ease',
                        transform: hoveredPie === index ? 'scale(1.05)' : 'scale(1)',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    border: '2px solid rgba(139, 92, 246, 0.5)',
                    borderRadius: '12px',
                    color: '#e5e7eb',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                  }}
                  labelStyle={{
                    color: '#e5e7eb',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                  itemStyle={{
                    color: '#e5e7eb',
                    fontSize: '13px',
                  }}
                  formatter={(value: number, name: string, props: any) => {
                    const total = countryData.reduce((sum, d) => sum + d.value, 0);
                    const percent = ((value / total) * 100).toFixed(1);
                    return [`${value} 个案例 (${percent}%)`, props.payload.name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* 图例 - 炫酷显示 */}
            <div className="flex flex-wrap gap-3 mt-6 justify-center">
              {countryData.map((entry, index) => {
                const total = countryData.reduce((sum, d) => sum + d.value, 0);
                const percent = ((entry.value / total) * 100).toFixed(1);
                const isHovered = hoveredPie === index;
                const color = COLOR_SOLID[index % COLOR_SOLID.length];
                return (
                  <div 
                    key={index} 
                    className={`flex items-center gap-2 bg-gradient-to-r from-gray-800/80 to-gray-900/80 border-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
                      isHovered 
                        ? 'scale-110 shadow-lg' 
                        : 'hover:border-gray-600'
                    }`}
                    style={{
                      borderColor: isHovered ? `${color}80` : 'rgba(55, 65, 81, 0.5)',
                      boxShadow: isHovered 
                        ? `0 0 20px ${color}40` 
                        : 'none',
                      transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                    }}
                    onMouseEnter={() => setHoveredPie(index)}
                    onMouseLeave={() => setHoveredPie(null)}
                  >
                    <div 
                      className="w-5 h-5 rounded-full shadow-lg transition-all"
                      style={{ 
                        backgroundColor: color,
                        boxShadow: isHovered 
                          ? `0 0 15px ${color}` 
                          : 'none',
                        transform: isHovered ? 'scale(1.2)' : 'scale(1)',
                      }}
                    ></div>
                    <span className={`text-sm font-bold transition-colors ${
                      isHovered ? 'text-white' : 'text-gray-200'
                    }`}>
                      {entry.name}
                    </span>
                    <span className="text-sm text-gray-400">·</span>
                    <span className={`text-sm font-semibold transition-colors ${
                      isHovered ? 'text-white' : 'text-gray-300'
                    }`}>
                      {entry.value} 个
                    </span>
                    <span className={`text-sm transition-colors ${
                      isHovered ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      ({percent}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
