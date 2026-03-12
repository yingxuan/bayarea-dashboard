import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export type CategoryType = "奶茶" | "中餐" | "夜宵" | "新店打卡";

interface CategoryTabsProps {
  activeCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
  counts?: Record<CategoryType, number>;
}

export default function CategoryTabs({
  activeCategory,
  onCategoryChange,
  counts,
}: CategoryTabsProps) {
  const { lang } = useLanguage();
  const t = useT(lang);

  const categories: Array<{ key: CategoryType; label: string; tone: string; blurb: string }> = [
    { key: "奶茶", label: t.chihe.bubbleTea, tone: "text-sky-300/80", blurb: "轻松、近、适合顺路买" },
    { key: "中餐", label: t.chihe.chinese, tone: "text-amber-300/80", blurb: "稳妥正餐，适合聚餐或填饱" },
    { key: "夜宵", label: t.chihe.lateNight, tone: "text-rose-300/80", blurb: "下班后还能接得住的一口热量" },
    { key: "新店打卡", label: t.chihe.newPlaces, tone: "text-emerald-300/80", blurb: "最近值得试的新选择" },
  ];

  return (
    <Tabs
      value={activeCategory}
      onValueChange={(value) => onCategoryChange(value as CategoryType)}
      className="w-full"
    >
      <TabsList className="grid h-auto w-full gap-2 rounded-sm border border-border/35 bg-card/45 p-2 md:grid-cols-4">
        {categories.map((category) => {
          const isActive = activeCategory === category.key;

          return (
            <TabsTrigger
              key={category.key}
              value={category.key}
              className="h-auto rounded-sm border border-transparent px-3 py-3 text-left data-[state=active]:border-primary/45 data-[state=active]:bg-background/90 data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <div className="flex w-full items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-[11px] uppercase tracking-[0.16em] ${category.tone}`}>
                    Category
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{category.label}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {category.blurb}
                  </div>
                </div>
                <div
                  className={`mt-1 rounded-sm px-2 py-1 text-[11px] font-mono tabular-nums ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-muted/55 text-muted-foreground"
                  }`}
                >
                  {counts?.[category.key] ?? 0}
                </div>
              </div>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
