/**
 * CategoryTabs Component
 * Tab navigation for switching between food categories
 *
 * Categories:
 * - 奶茶 (Bubble Tea)
 * - 中餐 (Chinese Food)
 * - 夜宵 (Late Night)
 * - 新店打卡 (New Places)
 */

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CategoryType = '奶茶' | '中餐' | '夜宵' | '新店打卡';

interface CategoryTabsProps {
  activeCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
  counts?: Record<CategoryType, number>;
}

const CATEGORIES: { key: CategoryType; label: string; emoji: string }[] = [
  { key: '奶茶', label: '奶茶', emoji: '' },
  { key: '中餐', label: '中餐', emoji: '' },
  { key: '夜宵', label: '夜宵', emoji: '' },
  { key: '新店打卡', label: '新店打卡', emoji: '' },
];

export default function CategoryTabs({ activeCategory, onCategoryChange, counts }: CategoryTabsProps) {
  return (
    <Tabs
      value={activeCategory}
      onValueChange={(value) => onCategoryChange(value as CategoryType)}
      className="w-full"
    >
      <TabsList className="w-full justify-start bg-card/50 border border-border/40 p-1 h-auto flex-wrap gap-1">
        {CATEGORIES.map((cat) => (
          <TabsTrigger
            key={cat.key}
            value={cat.key}
            className="flex-1 min-w-[80px] px-4 py-2 text-sm font-mono data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-primary/50 data-[state=active]:shadow-none border border-transparent transition-all"
          >
            <span className="flex items-center gap-1.5">
              {cat.emoji && <span>{cat.emoji}</span>}
              <span>{cat.label}</span>
              {counts && counts[cat.key] !== undefined && (
                <span className="text-[10px] opacity-60 tabular-nums ml-1">
                  ({counts[cat.key]})
                </span>
              )}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
