/**
 * Section Header Component
 * Unified section header with title and optional "查看更多" link
 * Uses standardized typography: text-sm font-semibold for title, text-xs opacity-70 for link
 */

interface SectionHeaderProps {
  title: string;
  href?: string;
  linkText?: string;
}

export default function SectionHeader({ title, href, linkText = "查看更多" }: SectionHeaderProps) {
  return (
    <div className="mb-1.5">
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-[13px] font-mono font-medium text-foreground/80">{title}</h3>
        {href && (
          <a
            href={href}
            className="text-xs opacity-60 font-mono font-normal hover:opacity-100 transition-opacity"
          >
            {linkText}
          </a>
        )}
      </div>
      <div className="border-b border-border/30"></div>
    </div>
  );
}
