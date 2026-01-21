import Link from 'next/link';
import { Startup } from '@/types';
import { Calendar, DollarSign, TrendingDown, MapPin, Skull, Cross } from 'lucide-react';

interface StartupCardProps {
  startup: Startup;
}

export default function StartupCard({ startup }: StartupCardProps) {
  const formatCurrency = (amount: number) => {
    if (amount >= 1000000000) {
      return `$${(amount / 1000000000).toFixed(1)}B`;
    } else if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount}`;
  };

  // 根据亏损金额计算"危险等级"
  const getDangerLevel = (loss: number) => {
    if (loss >= 1000000000) return { level: '💀', color: 'text-red-500', glow: 'shadow-red-500/50' };
    if (loss >= 100000000) return { level: '⚰️', color: 'text-orange-500', glow: 'shadow-orange-500/50' };
    if (loss >= 10000000) return { level: '🪦', color: 'text-yellow-500', glow: 'shadow-yellow-500/50' };
    return { level: '💸', color: 'text-gray-400', glow: 'shadow-gray-500/50' };
  };

  const danger = getDangerLevel(startup.lossAmount);

  return (
    <Link href={`/startup/${startup.id}`}>
      <div className="tombstone-card group cursor-pointer">
        {/* 墓碑顶部装饰 */}
        <div className="tombstone-top flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{danger.level}</span>
              <h3 className="text-xl font-bold group-hover:text-red-400 transition-colors">
                {startup.name}
              </h3>
            </div>
            {startup.nameEn && (
              <p className="text-sm text-gray-400 italic">{startup.nameEn}</p>
            )}
          </div>
          <div className="text-right relative">
            <div className={`text-3xl font-bold ${danger.color} pulse-glow`}>
              {formatCurrency(startup.lossAmount)}
            </div>
            <div className="text-xs text-gray-500 mt-1">R.I.P.</div>
          </div>
        </div>

        {/* 死亡日期 */}
        <div className="mb-4 pb-4 border-b border-graveyard-light/50">
          <div className="flex items-center gap-2 text-sm">
            <Cross className="w-4 h-4 text-red-500/50" />
            <span className="text-gray-400">
              {startup.foundedYear} - {startup.closedYear}
            </span>
            <span className="text-gray-600 mx-2">|</span>
            <span className="text-gray-400">存活 {startup.lifespan} 年</span>
          </div>
        </div>

        {/* 墓志铭（描述） */}
        <p className="text-gray-300 text-sm mb-4 line-clamp-2 italic">
          {startup.description}
        </p>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 bg-graveyard-dark/50 p-2 rounded">
            <MapPin className="w-4 h-4 text-blue-400" />
            <span>{startup.country}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400 bg-graveyard-dark/50 p-2 rounded">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span>融资 {formatCurrency(startup.totalFunding)}</span>
          </div>
        </div>

        {/* 失败原因标签 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1 bg-gradient-to-r from-gray-700 to-gray-800 rounded-full text-xs text-gray-300 border border-gray-600">
            {startup.industry}
          </span>
          {startup.failureReasons.slice(0, 2).map((reason, idx) => (
            <span
              key={idx}
              className="px-3 py-1 bg-gradient-to-r from-red-900/40 to-red-800/40 border border-red-700/50 rounded-full text-xs text-red-300 hover:scale-110 transition-transform"
            >
              💀 {reason}
            </span>
          ))}
          {startup.failureReasons.length > 2 && (
            <span className="px-2 py-1 bg-gray-800/50 rounded-full text-xs text-gray-500 border border-gray-700">
              +{startup.failureReasons.length - 2} 更多
            </span>
          )}
        </div>

        {/* Hover 时的装饰线 */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500/0 to-transparent group-hover:via-red-500/50 transition-all"></div>
      </div>
    </Link>
  );
}
