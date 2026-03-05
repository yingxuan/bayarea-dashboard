/**
 * Section Header Component
 * Unified section header with title and optional "查看更多" link
 * Uses standardized typography: text-sm font-semibold for title, text-xs opacity-70 for link
 */

import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

interface SectionHeaderProps {
  title: string;
  href?: string;
  linkText?: string;
}

export default function SectionHeader({ title, href, linkText }: SectionHeaderProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const resolvedLinkText = linkText ?? t.common.viewMore;

  return (
    <div className="mb-1.5">
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-[13px] font-mono font-medium text-foreground/70">{title}</h3>
        {href && (
          <a
            href={href}
            className="text-xs opacity-60 font-mono font-normal hover:opacity-100 transition-opacity"
          >
            {resolvedLinkText}
          </a>
        )}
      </div>
      <div className="border-b border-border/30"></div>
    </div>
  );
}
