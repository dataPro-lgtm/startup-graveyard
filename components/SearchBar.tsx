import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative group">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-red-500 transition-colors" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="🔍 搜索公司名称、行业、失败原因..."
        className="w-full pl-10 pr-4 py-3 bg-graveyard-gray border border-graveyard-light rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all text-gray-100 placeholder-gray-500 hover:border-gray-500"
      />
      {value && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">
          💀
        </div>
      )}
    </div>
  );
}
