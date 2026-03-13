import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export const BLIND_BOX = "\u76f2\u76d2";
export const BUBBLE_TEA = "\u5976\u8336";
export const CHINESE_FOOD = "\u4e2d\u9910";
export const LATE_NIGHT = "\u591c\u5bb5";
export const NEW_PLACES = "\u65b0\u5e97\u6253\u5361";

export type CategoryType =
  | typeof BLIND_BOX
  | typeof BUBBLE_TEA
  | typeof CHINESE_FOOD
  | typeof LATE_NIGHT
  | typeof NEW_PLACES;

interface CategoryTabsProps {
  activeCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
  counts?: Record<CategoryType, number>;
}

const CATEGORY_META: Array<{ key: CategoryType; tone: string; blurb: string }> = [
  {
    key: BLIND_BOX,
    tone: "text-fuchsia-300/80",
    blurb: "\u4e0d\u60f3\u9009\uff0c\u76f4\u63a5\u62bd\u4e00\u5bb6\u3002",
  },
  {
    key: BUBBLE_TEA,
    tone: "text-sky-300/80",
    blurb: "\u5feb\u901f\u627e\u4e00\u676f\u7a33\u5982\u8001\u670b\u53cb\u7684\u5976\u8336\u3002",
  },
  {
    key: CHINESE_FOOD,
    tone: "text-amber-300/80",
    blurb: "\u76f4\u63a5\u770b\u4e2d\u9910\u6e05\u5355\uff0c\u4eca\u665a\u5c11\u7ea0\u7ed3\u3002",
  },
  {
    key: LATE_NIGHT,
    tone: "text-rose-300/80",
    blurb: "\u7559\u7ed9\u591c\u91cc\u8fd8\u60f3\u5403\u70ed\u7684\u65f6\u5019\u3002",
  },
  {
    key: NEW_PLACES,
    tone: "text-emerald-300/80",
    blurb: "\u65b0\u5f00\u5e97\u94fa\uff0c\u9002\u5408\u8fd9\u5468\u672b\u53bb\u8bd5\u3002",
  },
];

export default function CategoryTabs({
  activeCategory,
  onCategoryChange,
  counts,
}: CategoryTabsProps) {
  const { lang } = useLanguage();
  const t = useT(lang);

  const labels: Record<CategoryType, string> = {
    [BLIND_BOX]: t.chihe.blindBox,
    [BUBBLE_TEA]: t.chihe.bubbleTea,
    [CHINESE_FOOD]: t.chihe.chinese,
    [LATE_NIGHT]: t.chihe.lateNight,
    [NEW_PLACES]: t.chihe.newPlaces,
  };

  return (
    <Tabs
      value={activeCategory}
      onValueChange={(value) => onCategoryChange(value as CategoryType)}
      className="w-full"
    >
      <TabsList className="grid h-auto w-full gap-2 rounded-[1.15rem] border border-white/10 bg-white/5 p-2 md:grid-cols-5">
        {CATEGORY_META.map((category) => {
          const isActive = activeCategory === category.key;

          return (
            <TabsTrigger
              key={category.key}
              value={category.key}
              className="h-auto rounded-[0.95rem] border border-transparent px-3 py-3 text-left transition-colors data-[state=active]:border-white/16 data-[state=active]:bg-white/10 data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <div className="flex w-full items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-sm font-semibold text-foreground ${category.tone}`}>
                    {labels[category.key]}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground/80">
                    {category.blurb}
                  </div>
                </div>
                <div
                  className={`rounded-full px-2.5 py-1 text-[11px] tabular-nums ${
                    isActive ? "bg-primary/14 text-primary" : "bg-white/8 text-muted-foreground"
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
