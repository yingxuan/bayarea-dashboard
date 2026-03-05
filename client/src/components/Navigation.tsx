/**
 * Data Punk Design: Fixed top navigation with neon border
 * - Dark background with subtle glow
 * - Monospace font for brand
 * - Neon blue accent on active items
 * - Functional mobile slide-down menu
 */

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
    { label: t.nav.finance, path: "/piaozi" },
    { label: t.nav.dining, path: "/chihe" },
  ];

  // Close on outside click
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

  // Close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="container">
        <div className="flex h-14 items-center justify-between">
          {/* Brand */}
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="text-xl font-bold font-mono neon-text-blue">
                {t.nav.brand}
              </div>
            </div>
          </Link>

          {/* Desktop Navigation Items */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link key={item.path} href={item.path}>
                  <div
                    className={`
                      px-3 py-2 text-sm font-medium transition-all duration-150
                      ${
                        isActive
                          ? "text-primary border-b-2 border-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop: Lang toggle + User Menu */}
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLang}
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1"
            >
              {lang === "zh" ? "EN" : "中"}
            </button>
            <UserMenu />
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
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

            {/* Mobile dropdown panel */}
            <AnimatePresence>
              {mobileOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute left-0 right-0 top-14 z-50 overflow-hidden border-b border-border bg-card/95 backdrop-blur-sm"
                >
                  <div className="container flex flex-col gap-1 py-3">
                    {navItems.map((item) => {
                      const isActive = location === item.path;
                      return (
                        <Link key={item.path} href={item.path}>
                          <div
                            className={`px-3 py-2.5 text-sm font-medium rounded-sm transition-colors ${
                              isActive
                                ? "text-primary bg-primary/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                            }`}
                          >
                            {item.label}
                          </div>
                        </Link>
                      );
                    })}
                    <div className="border-t border-border/30 mt-1 pt-2 px-3 flex items-center justify-between">
                      <UserMenu />
                      <button
                        type="button"
                        onClick={toggleLang}
                        className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1"
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
