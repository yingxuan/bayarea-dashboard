import { BriefcaseBusiness, ChartColumnBig, Home, House, Soup } from "lucide-react";
import { Link, useLocation } from "wouter";
import UserMenu from "./UserMenu";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function Navigation() {
  const [location] = useLocation();
  const { lang } = useLanguage();
  const t = useT(lang);

  const navItems = [
    { label: t.nav.home, path: "/", icon: Home },
    { label: t.nav.finance, path: "/piaozi", icon: ChartColumnBig },
    { label: t.nav.dining, path: "/chihe", icon: Soup },
    { label: t.nav.work, path: "/baoguo", icon: BriefcaseBusiness },
    { label: t.nav.housing, path: "/fangzi", icon: House },
  ];

  return (
    <>
      <nav className="app-nav sticky top-0 z-50 backdrop-blur-xl">
        <div className="container">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link href="/">
              <div className="flex cursor-pointer items-center gap-3">
                <div className="flex min-w-0 max-w-[11.5rem] flex-col gap-0.5 sm:max-w-none">
                  <div className="text-[15px] font-semibold leading-[1.1] tracking-[0.01em] text-foreground">
                    {t.nav.brand}
                  </div>
                  <div className="text-[10px] leading-[1.2] tracking-[0.08em] text-muted-foreground/70">
                    {lang === "zh" ? "湾区情报与生存" : "Bay Area survival guide"}
                  </div>
                </div>
              </div>
            </Link>

            <div className="nav-surface hidden items-center gap-2 rounded-full p-1.5 md:flex">
              {navItems.map((item) => {
                const isActive = location === item.path;
                return (
                  <Link key={item.path} href={item.path}>
                    <div
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-primary/14 text-primary shadow-[inset_0_0_0_1px_rgba(140,206,222,0.24)]"
                          : "text-muted-foreground hover:bg-white/6 hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <UserMenu />
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <div className="nav-surface rounded-full p-1">
                <UserMenu />
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="mobile-tab-bar fixed inset-x-0 bottom-0 z-50 border-t border-border/40 bg-background/92 backdrop-blur-xl md:hidden">
        <div className="mobile-tab-bar-inner mx-auto grid max-w-6xl grid-cols-5 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-primary/14 text-primary shadow-[inset_0_0_0_1px_rgba(140,206,222,0.24)]"
                      : "text-muted-foreground hover:bg-white/6 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
