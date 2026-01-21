'use client';

import { useState, useMemo, useEffect } from 'react';
import { defaultStartups, getIndustries, getFailureReasons, getCountries } from '@/data/startups';
import { Startup, SortOption, FilterOption } from '@/types';
import StartupCard from '@/components/StartupCard';
import SearchBar from '@/components/SearchBar';
import FilterPanel from '@/components/FilterPanel';
import StatsPanel from '@/components/StatsPanel';
import { TrendingDown, Search, Filter, Skull, Ghost, Cross } from 'lucide-react';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('loss');
  const [filters, setFilters] = useState<FilterOption>({});
  const [showFilters, setShowFilters] = useState(false);
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 从API加载数据
    setLoading(true);
    fetch('/api/startups')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.startups && data.startups.length > 0) {
          setStartups(data.startups);
        } else {
          // Fallback到默认数据
          setStartups(defaultStartups);
        }
      })
      .catch(() => {
        // Fallback到默认数据
        setStartups(defaultStartups);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filteredAndSortedStartups = useMemo(() => {
    let result = [...startups];

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(startup => 
        startup.name.toLowerCase().includes(query) ||
        startup.nameEn?.toLowerCase().includes(query) ||
        startup.description.toLowerCase().includes(query) ||
        startup.industry.toLowerCase().includes(query) ||
        startup.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // 筛选
    if (filters.industry) {
      result = result.filter(s => s.industry === filters.industry);
    }
    if (filters.reason) {
      result = result.filter(s => s.failureReasons.includes(filters.reason!));
    }
    if (filters.country) {
      result = result.filter(s => s.country === filters.country);
    }
    if (filters.decade) {
      const decade = parseInt(filters.decade);
      result = result.filter(s => s.closedYear >= decade && s.closedYear < decade + 10);
    }

    // 排序
    result.sort((a, b) => {
      switch (sortBy) {
        case 'loss':
          return b.lossAmount - a.lossAmount;
        case 'funding':
          return b.totalFunding - a.totalFunding;
        case 'lifespan':
          return a.lifespan - b.lifespan;
        case 'closed':
          return b.closedYear - a.closedYear;
        default:
          return 0;
      }
    });

    return result;
  }, [startups, searchQuery, sortBy, filters]);

  // 使用当前过滤后的数据计算统计
  const totalLoss = filteredAndSortedStartups.reduce((sum, s) => sum + s.lossAmount, 0);
  const totalFunding = filteredAndSortedStartups.reduce((sum, s) => sum + s.totalFunding, 0);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="relative border-b border-graveyard-light bg-gradient-to-b from-graveyard-darker via-graveyard-dark to-graveyard-darker overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 text-6xl">💀</div>
          <div className="absolute top-20 right-20 text-5xl">⚰️</div>
          <div className="absolute bottom-10 left-1/4 text-4xl">🪦</div>
          <div className="absolute bottom-20 right-1/3 text-5xl">👻</div>
        </div>
        
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Skull className="w-12 h-12 text-red-500 pulse-glow" />
                <Ghost className="w-8 h-8 text-orange-500 absolute -top-2 -right-2 flicker" />
              </div>
              <div>
                <h1 className="text-4xl font-bold gradient-text mb-1">创业坟场</h1>
                <p className="text-sm text-gray-400 flex items-center gap-2">
                  <Cross className="w-3 h-3" />
                  失败案例数据库 · 以史为鉴 · 避免重蹈覆辙
                </p>
              </div>
            </div>
            <div className="text-right bg-graveyard-gray/50 backdrop-blur-sm border border-red-500/30 rounded-lg p-4 pulse-glow">
              <div className="text-3xl font-bold text-red-500 flex items-center gap-2">
                <TrendingDown className="w-6 h-6" />
                {startups.length > 0 ? `$${(totalLoss / 1000000000).toFixed(1)}B` : '--'}
              </div>
              <div className="text-xs text-gray-400 mt-1">累计亏损 💸</div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Panel */}
      {loading ? (
        <div className="bg-graveyard-darker border-b border-graveyard-light py-8">
          <div className="container mx-auto px-4 text-center text-gray-500">
            <div className="text-4xl mb-4 animate-spin">💀</div>
            <p>正在加载数据...</p>
          </div>
        </div>
      ) : startups.length > 0 ? (
        <StatsPanel key={startups.length} startups={startups} />
      ) : (
        <div className="bg-graveyard-darker border-b border-graveyard-light py-8">
          <div className="container mx-auto px-4 text-center text-gray-500">
            <p>暂无数据</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search and Filter Bar */}
        <div className="mb-8 space-y-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                showFilters 
                  ? 'bg-gradient-to-r from-red-600 to-red-500 border-red-500 text-white shadow-lg shadow-red-500/50' 
                  : 'bg-graveyard-gray border-graveyard-light hover:border-red-500/50 hover:bg-graveyard-light'
              }`}
            >
              <Filter className="w-4 h-4" />
              {showFilters ? '收起筛选' : '筛选'}
            </button>
          </div>

          {showFilters && (
            <FilterPanel
              filters={filters}
              onFiltersChange={setFilters}
              industries={getIndustries(startups)}
              reasons={getFailureReasons(startups)}
              countries={getCountries(startups)}
            />
          )}

          {/* Sort Options */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-gray-400 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              排序：
            </span>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'loss', label: '💀 亏损金额', icon: '💸' },
                { value: 'funding', label: '💰 融资总额', icon: '💵' },
                { value: 'lifespan', label: '⏱️ 存活时间', icon: '⏳' },
                { value: 'closed', label: '📅 关闭时间', icon: '🗓️' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setSortBy(option.value as SortOption)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    sortBy === option.value
                      ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-500/50 scale-105'
                      : 'bg-graveyard-gray hover:bg-graveyard-light border border-graveyard-light hover:border-red-500/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="text-sm text-gray-500 ml-auto flex items-center gap-2">
              <Skull className="w-4 h-4" />
              找到 <span className="text-red-400 font-bold">{filteredAndSortedStartups.length}</span> 个案例
            </span>
          </div>
        </div>

        {/* Startup Grid */}
        {filteredAndSortedStartups.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-8xl mb-4">🪦</div>
            <Search className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
            <p className="text-gray-400 text-lg mb-2">没有找到匹配的案例</p>
            <p className="text-gray-500 text-sm">尝试调整搜索条件或筛选器</p>
            <div className="mt-6 text-4xl opacity-30">
              <span className="inline-block animate-bounce" style={{ animationDelay: '0s' }}>👻</span>
              <span className="inline-block animate-bounce mx-2" style={{ animationDelay: '0.2s' }}>💀</span>
              <span className="inline-block animate-bounce" style={{ animationDelay: '0.4s' }}>⚰️</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedStartups.map((startup, index) => (
              <div
                key={startup.id}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <StartupCard startup={startup} />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-graveyard-light mt-20 py-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-1/4 text-4xl">💀</div>
          <div className="absolute bottom-0 right-1/4 text-4xl">⚰️</div>
        </div>
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm relative z-10">
          <p className="flex items-center justify-center gap-2">
            <span>🪦</span>
            <span>创业坟场 · 记录失败，启迪未来</span>
            <span>🪦</span>
          </p>
          <p className="mt-2 text-gray-600">数据仅供参考，持续更新中</p>
          <p className="mt-4 text-xs text-gray-700">愿所有创业者都能从失败中学习，避免重蹈覆辙 💡</p>
        </div>
      </footer>
    </div>
  );
}
