/**
 * Back To Home Link Component
 * Simple navigation link to return to the home page
 */

import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function BackToHomeLink() {
  const { lang } = useLanguage();
  const t = useT(lang);

  return (
    <Link href="/">
      <div className="inline-flex items-center gap-1.5 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <ArrowLeft className="w-4 h-4" />
        <span>{t.common.backHome}</span>
      </div>
    </Link>
  );
}
