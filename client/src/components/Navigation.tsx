import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import UserMenu from "./UserMenu";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function Navigation() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { lang, toggleLang } = useLanguage();
  const t = useT(lang);

  const navItems = [
    { label: t.nav.home, path: "/" },
    { label: t.nav.work, path: "/baoguo" },
    { label: t.nav.housing, path: "/fangzi" },
    { label: t.nav.finance, path: "/piaozi" },
    { label: t.nav.dining, path: "/chihe" },
  ];

  useEffect(() => {
    if (!mobileOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <nav className="app-nav sticky top-0 z-50 backdrop-blur-xl">
      <div className="container">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-2xl text-[11px] font-semibold tracking-[0.18em]">
                BA
              </div>
              <div className="flex flex-col leading-none">
                <div className="text-[15px] font-semibold tracking-[0.01em] text-foreground">
                  {t.nav.brand}
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                  Daily decision helper
                </div>
              </div>
            </div>
          </Link>

          <div className="nav-surface hidden md:flex items-center gap-2 rounded-full p-1.5">
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

          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLang}
              className="nav-surface rounded-full px-2.5 py-1 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground"
            >
              {lang === "zh" ? "EN" : "中"}
            </button>
            <UserMenu />
          </div>

          <div className="md:hidden" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="nav-surface rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={mobileOpen ? t.nav.closeMenu : t.nav.openMenu}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>

            <AnimatePresence>
              {mobileOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute left-0 right-0 top-16 z-50 overflow-hidden border-b border-border/40 bg-background/95 backdrop-blur-xl"
                >
                  <div className="container flex flex-col gap-2 py-3">
                    {navItems.map((item) => {
                      const isActive = location === item.path;
                      return (
                        <Link key={item.path} href={item.path}>
                          <div
                            className={`nav-surface rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${
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
                    <div className="mt-1 flex items-center justify-between border-t border-border/30 px-1 pt-3">
                      <UserMenu />
                      <button
                        type="button"
                        onClick={toggleLang}
                        className="nav-surface rounded-full px-2.5 py-1 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {lang === "zh" ? "EN" : "中"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </nav>
  );
}
