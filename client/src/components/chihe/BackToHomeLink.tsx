/**
 * BackToHomeLink Component
 * Navigation link to return to the home page
 * Data Punk styled with neon accent
 */

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
        className={`inline-flex items-center gap-2 text-sm font-mono text-muted-foreground hover:text-primary transition-colors cursor-pointer ${className}`}
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t.common.backHome}</span>
      </span>
    </Link>
  );
}
