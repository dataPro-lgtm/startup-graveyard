'use client';

import { useState, useEffect } from 'react';
import { Startup } from '@/types';
import Link from 'next/link';
import { ArrowLeft, Calendar, DollarSign, TrendingDown, MapPin, Users, Tag, BookOpen, Skull, Cross, Ghost, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { defaultStartups } from '@/data/startups';

interface PageProps {
  params: { id: string };
}

export default function StartupDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { id } = params;
  const [startups, setStartups] = useState<Startup[]>(defaultStartups);
  const [startup, setStartup] = useState<Startup | undefined>(undefined);

  useEffect(() => {
    // 从API加载数据
    fetch('/api/startups')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.startups) {
          setStartups(data.startups);
          setStartup(data.startups.find((s: Startup) => s.id === id));
        } else {
          // Fallback到默认数据
          setStartup(defaultStartups.find(s => s.id === id));
        }
      })
      .catch(() => {
        // Fallback到默认数据
        setStartup(defaultStartups.find(s => s.id === id));
      });
  }, [id]);

  useEffect(() => {
    if (startup === undefined) {
      // 还在加载中
      return;
    }
    if (!startup) {
      router.push('/not-found');
    }
  }, [startup, router]);

  if (startup === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">💀</div>
          <p className="text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!startup) {
    return null;
  }

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000000) {
      return `$${(amount / 1000000000).toFixed(2)} 亿美元`;
    } else if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(2)} 百万美元`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)} 千美元`;
    }
    return `$${amount}`;
  };

  const getDangerLevel = (loss: number) => {
    if (loss >= 1000000000) return { emoji: '💀', level: '极度危险', color: 'from-red-600 to-red-500' };
    if (loss >= 100000000) return { emoji: '⚰️', level: '非常危险', color: 'from-orange-600 to-orange-500' };
    if (loss >= 10000000) return { emoji: '🪦', level: '危险', color: 'from-yellow-600 to-yellow-500' };
    return { emoji: '💸', level: '一般', color: 'from-gray-600 to-gray-500' };
  };

  const danger = getDangerLevel(startup.lossAmount);

  return (
    <div className="min-h-screen bg-gradient-to-b from-graveyard-dark via-graveyard-darker to-graveyard-dark">
      {/* Header */}
      <header className="border-b border-graveyard-light bg-graveyard-darker relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-10 text-6xl">{danger.emoji}</div>
          <div className="absolute top-0 right-10 text-5xl">⚰️</div>
        </div>
        <div className="container mx-auto px-4 py-4 relative z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-red-400 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>返回坟场</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Title Section */}
        <div className="mb-8">
          <div className="bg-gradient-to-r from-graveyard-gray to-graveyard-dark border-2 border-red-500/30 rounded-xl p-6 mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 text-8xl opacity-10">{danger.emoji}</div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-5xl">{danger.emoji}</span>
                    <div>
                      <h1 className="text-4xl font-bold gradient-text mb-1">{startup.name}</h1>
                      {startup.nameEn && (
                        <p className="text-xl text-gray-400 italic">{startup.nameEn}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`px-3 py-1 bg-gradient-to-r ${danger.color} rounded-full text-xs text-white font-medium`}>
                      {danger.level}
                    </span>
                    <span className="text-sm text-gray-400">·</span>
                    <span className="text-sm text-gray-400">{startup.industry}</span>
                  </div>
                </div>
                <div className="text-right bg-graveyard-dark/50 backdrop-blur-sm border border-red-500/30 rounded-lg p-4 pulse-glow">
                  <div className="text-3xl font-bold text-red-500 mb-1 flex items-center justify-end gap-2">
                    <TrendingDown className="w-6 h-6" />
                    {formatCurrency(startup.lossAmount)}
                  </div>
                  <div className="text-xs text-gray-500">R.I.P. 💀</div>
                </div>
              </div>
            </div>
          </div>

          {/* Key Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/30 rounded-lg p-4 hover:border-blue-500/50 transition-all">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <MapPin className="w-4 h-4" />
                <span className="text-sm">国家/地区</span>
              </div>
              <div className="text-lg font-semibold text-blue-300">{startup.country}</div>
            </div>
            <div className="bg-gradient-to-br from-purple-900/20 to-purple-800/10 border border-purple-500/30 rounded-lg p-4 hover:border-purple-500/50 transition-all">
              <div className="flex items-center gap-2 text-purple-400 mb-2">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">存活时间</span>
              </div>
              <div className="text-lg font-semibold text-purple-300">
                {startup.foundedYear}-{startup.closedYear}
              </div>
              <div className="text-xs text-purple-400 mt-1">({startup.lifespan} 年)</div>
            </div>
            <div className="bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-500/30 rounded-lg p-4 hover:border-green-500/50 transition-all">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm">总融资</span>
              </div>
              <div className="text-lg font-semibold text-green-300">{formatCurrency(startup.totalFunding)}</div>
            </div>
            <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border border-yellow-500/30 rounded-lg p-4 hover:border-yellow-500/50 transition-all">
              <div className="flex items-center gap-2 text-yellow-400 mb-2">
                <Tag className="w-4 h-4" />
                <span className="text-sm">行业</span>
              </div>
              <div className="text-lg font-semibold text-yellow-300">{startup.industry}</div>
            </div>
          </div>
        </div>

        {/* Description */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-400" />
            <span>项目简介</span>
            <span className="text-lg ml-2">📖</span>
          </h2>
          <div className="bg-gradient-to-br from-graveyard-gray to-graveyard-dark border-2 border-blue-500/20 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 text-6xl opacity-5">📚</div>
            <p className="text-gray-300 leading-relaxed relative z-10 italic text-lg">
              {startup.description}
            </p>
          </div>
        </section>

        {/* Detailed Analysis */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-orange-400" />
            <span>深度验尸报告</span>
            <span className="text-lg ml-2">🔍</span>
          </h2>
          <div className="bg-gradient-to-br from-orange-900/10 to-red-900/10 border-2 border-orange-500/30 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 text-6xl opacity-5">🔬</div>
            <p className="text-gray-300 leading-relaxed whitespace-pre-line relative z-10">
              {startup.detailedAnalysis}
            </p>
          </div>
        </section>

        {/* Failure Reasons */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Skull className="w-6 h-6 text-red-500" />
            <span>死亡原因</span>
            <span className="text-lg ml-2">💀</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {startup.failureReasons.map((reason, idx) => (
              <div
                key={idx}
                className="bg-gradient-to-br from-red-900/30 to-red-800/20 border-2 border-red-500/40 rounded-xl p-4 hover:border-red-500/60 hover:scale-105 transition-all relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 text-4xl opacity-10 group-hover:opacity-20 transition-opacity">💀</div>
                <div className="flex items-center gap-3 relative z-10">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-red-500/50">
                    {idx + 1}
                  </div>
                  <span className="text-red-200 font-medium text-lg">{reason}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Lessons Learned */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <span className="text-2xl">💡</span>
            <span>经验教训</span>
            <span className="text-lg ml-2">📚</span>
          </h2>
          <div className="space-y-4">
            {startup.lessons.map((lesson, idx) => (
              <div
                key={idx}
                className="bg-gradient-to-r from-yellow-900/30 to-orange-900/20 border-2 border-yellow-500/40 rounded-xl p-5 flex items-start gap-4 hover:border-yellow-500/60 hover:scale-[1.02] transition-all relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 text-5xl opacity-10 group-hover:opacity-20 transition-opacity">💡</div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-yellow-500/50 flex-shrink-0 relative z-10">
                  {idx + 1}
                </div>
                <p className="text-yellow-100 text-lg leading-relaxed relative z-10 flex-1">{lesson}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Investors & Founders */}
        <section className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">💰</span>
                <span>主要投资者</span>
              </h2>
              <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-2 border-blue-500/30 rounded-xl p-5">
                {startup.investors.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {startup.investors.map((investor, idx) => (
                      <span
                        key={idx}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600/30 to-blue-500/20 border border-blue-500/50 rounded-full text-sm text-blue-200 hover:scale-110 transition-transform font-medium"
                      >
                        💵 {investor}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 flex items-center gap-2">
                    <Ghost className="w-4 h-4" />
                    暂无数据
                  </p>
                )}
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">👤</span>
                <span>创始人</span>
              </h2>
              <div className="bg-gradient-to-br from-green-900/20 to-green-800/10 border-2 border-green-500/30 rounded-xl p-5">
                {startup.founders.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {startup.founders.map((founder, idx) => (
                      <span
                        key={idx}
                        className="px-4 py-2 bg-gradient-to-r from-green-600/30 to-green-500/20 border border-green-500/50 rounded-full text-sm text-green-200 hover:scale-110 transition-transform font-medium"
                      >
                        👨‍💼 {founder}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 flex items-center gap-2">
                    <Ghost className="w-4 h-4" />
                    暂无数据
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Tags */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-purple-400" />
            <span>标签</span>
          </h2>
          <div className="flex flex-wrap gap-3">
            {startup.tags.map((tag, idx) => (
              <span
                key={idx}
                className="px-4 py-2 bg-gradient-to-r from-purple-900/30 to-purple-800/20 border-2 border-purple-500/40 rounded-full text-sm text-purple-200 hover:border-purple-500/60 hover:scale-110 transition-all font-medium"
              >
                🏷️ {tag}
              </span>
            ))}
          </div>
        </section>

        {/* Epitaph */}
        <section className="mt-12 mb-8">
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-2 border-gray-700 rounded-xl p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 left-4 text-4xl">🪦</div>
              <div className="absolute top-4 right-4 text-4xl">💀</div>
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-5xl">⚰️</div>
            </div>
            <div className="relative z-10">
              <div className="text-4xl mb-4">R.I.P.</div>
              <p className="text-gray-300 text-lg italic">
                {startup.name} ({startup.foundedYear} - {startup.closedYear})
              </p>
              <p className="text-gray-400 text-sm mt-2">
                愿后人能从这次失败中汲取教训，避免重蹈覆辙
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
