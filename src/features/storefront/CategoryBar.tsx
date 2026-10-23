import React from 'react';
import { Flame, Utensils, Drumstick, Salad, CupSoda, IceCream, Sparkles } from 'lucide-react';
import { Category } from '../../types';

interface CategoryBarProps {
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
}) => {
  const getCategoryIcon = (slug: string) => {
    switch (slug) {
      case 'burgers':
        return <Flame className="w-5 h-5" />;
      case 'starters':
        return <Utensils className="w-5 h-5" />;
      case 'chicken':
        return <Drumstick className="w-5 h-5" />;
      case 'salads':
        return <Salad className="w-5 h-5" />;
      case 'drinks':
        return <CupSoda className="w-5 h-5" />;
      case 'desserts':
        return <IceCream className="w-5 h-5" />;
      default:
        return <Sparkles className="w-5 h-5" />;
    }
  };

  return (
    <div className="w-full bg-[#11131a] py-6 border-y border-zinc-800/80 sticky top-20 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-3 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => onSelectCategory('all')}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold tracking-wide transition whitespace-nowrap cursor-pointer ${
              selectedCategoryId === 'all'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 ring-2 ring-red-400/40'
                : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Cardápio Completo</span>
          </button>

          {categories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`flex items-center space-x-2.5 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold tracking-wide transition whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 ring-2 ring-red-400/40 scale-102'
                    : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                <span className={isSelected ? 'text-amber-300' : 'text-zinc-400'}>
                  {getCategoryIcon(cat.slug)}
                </span>
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
