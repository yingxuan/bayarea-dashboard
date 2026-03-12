import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function BackToHomeLink() {
  const { lang } = useLanguage();
  const t = useT(lang);

  return (
    <Link href="/">
      <div className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border/55 bg-card/45 px-3 py-1.5 text-sm font-mono text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        <span>{t.common.backHome}</span>
      </div>
    </Link>
  );
}
