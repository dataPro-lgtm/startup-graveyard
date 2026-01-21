import { FilterOption } from '@/types';
import { X } from 'lucide-react';

interface FilterPanelProps {
  filters: FilterOption;
  onFiltersChange: (filters: FilterOption) => void;
  industries: string[];
  reasons: string[];
  countries: string[];
}

export default function FilterPanel({
  filters,
  onFiltersChange,
  industries,
  reasons,
  countries,
}: FilterPanelProps) {
  const decades = ['2000', '2010', '2020'];

  const updateFilter = (key: keyof FilterOption, value: string | undefined) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilter = (key: keyof FilterOption) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    onFiltersChange(newFilters);
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="bg-graveyard-gray border border-graveyard-light rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">筛选条件</h3>
        {hasActiveFilters && (
          <button
            onClick={() => onFiltersChange({})}
            className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            清除所有
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Industry Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            行业
          </label>
          <select
            value={filters.industry || ''}
            onChange={(e) => updateFilter('industry', e.target.value || undefined)}
            className="w-full px-3 py-2 bg-graveyard-dark border border-graveyard-light rounded text-gray-100 focus:outline-none focus:border-red-500"
          >
            <option value="">全部</option>
            {industries.map(industry => (
              <option key={industry} value={industry}>{industry}</option>
            ))}
          </select>
        </div>

        {/* Reason Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            失败原因
          </label>
          <select
            value={filters.reason || ''}
            onChange={(e) => updateFilter('reason', e.target.value || undefined)}
            className="w-full px-3 py-2 bg-graveyard-dark border border-graveyard-light rounded text-gray-100 focus:outline-none focus:border-red-500"
          >
            <option value="">全部</option>
            {reasons.map(reason => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
        </div>

        {/* Country Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            国家/地区
          </label>
          <select
            value={filters.country || ''}
            onChange={(e) => updateFilter('country', e.target.value || undefined)}
            className="w-full px-3 py-2 bg-graveyard-dark border border-graveyard-light rounded text-gray-100 focus:outline-none focus:border-red-500"
          >
            <option value="">全部</option>
            {countries.map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
        </div>

        {/* Decade Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            关闭年代
          </label>
          <select
            value={filters.decade || ''}
            onChange={(e) => updateFilter('decade', e.target.value || undefined)}
            className="w-full px-3 py-2 bg-graveyard-dark border border-graveyard-light rounded text-gray-100 focus:outline-none focus:border-red-500"
          >
            <option value="">全部</option>
            {decades.map(decade => (
              <option key={decade} value={decade}>{decade}年代</option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Filters */}
      {hasActiveFilters && (
        <div className="mt-4 pt-4 border-t border-graveyard-light">
          <div className="flex flex-wrap gap-2">
            {filters.industry && (
              <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded text-sm text-red-400 flex items-center gap-2">
                {filters.industry}
                <button onClick={() => clearFilter('industry')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.reason && (
              <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded text-sm text-red-400 flex items-center gap-2">
                {filters.reason}
                <button onClick={() => clearFilter('reason')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.country && (
              <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded text-sm text-red-400 flex items-center gap-2">
                {filters.country}
                <button onClick={() => clearFilter('country')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.decade && (
              <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded text-sm text-red-400 flex items-center gap-2">
                {filters.decade}年代
                <button onClick={() => clearFilter('decade')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
