import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

interface BackToHomeLinkProps {
  className?: string;
}

export default function BackToHomeLink({ className = "" }: BackToHomeLinkProps) {
  const { lang } = useLanguage();
  const t = useT(lang);

  return (
    <Link href="/">
      <span
        className={`inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border/45 bg-card/55 px-3 py-2 text-sm font-medium text-foreground/82 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-card/80 hover:text-primary ${className}`}
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{t.common.backHome}</span>
      </span>
    </Link>
  );
}
