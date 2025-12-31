/**
 * Data Punk Design: Fixed top navigation with neon border
 * - Dark background with subtle glow
 * - Monospace font for brand
 * - Neon blue accent on active items
 */

import { Link, useLocation } from "wouter";

const navItems = [
  { label: "主页", path: "/" },
  { label: "房子", path: "/house" },
  { label: "票子", path: "/money" },
  { label: "包裹", path: "/package" },
  { label: "吃喝", path: "/food" },
  { label: "税", path: "/tax" },
  { label: "羊毛", path: "/deals" },
  { label: "吃瓜", path: "/gossip" },
];

export default function Navigation() {
  const [location] = useLocation();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="container">
        <div className="flex h-14 items-center justify-between">
          {/* Brand */}
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="text-xl font-bold font-mono neon-text-blue">
                湾区仪表盘
              </div>
            </div>
          </Link>

          {/* Navigation Items */}
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

          {/* Mobile menu button - placeholder */}
          <div className="md:hidden">
            <button className="p-2 text-muted-foreground hover:text-foreground">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
