import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

interface SectionHeaderProps {
  title: string;
  href?: string;
  linkText?: string;
  tone?: "default" | "market" | "food" | "ent";
}

const toneClasses = {
  default: "text-foreground/78",
  market: "text-cyan-300/90",
  food: "text-amber-300/90",
  ent: "text-violet-300/90",
} as const;

export default function SectionHeader({
  title,
  href,
  linkText,
  tone = "default",
}: SectionHeaderProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const resolvedLinkText = linkText ?? t.common.viewMore;

  return (
    <div className="mb-2">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-2">Briefing</div>
          <h3 className={`text-[15px] font-semibold tracking-[0.02em] ${toneClasses[tone]}`}>
            {title}
          </h3>
        </div>
        {href && (
          <a
            href={href}
            className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            {resolvedLinkText}
          </a>
        )}
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-border/80 to-transparent" />
    </div>
  );
}
