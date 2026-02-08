/**
 * BackToHomeLink Component
 * Navigation link to return to the home page
 * Data Punk styled with neon accent
 */

import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

interface BackToHomeLinkProps {
  className?: string;
}

export default function BackToHomeLink({ className = "" }: BackToHomeLinkProps) {
  return (
    <Link href="/">
      <span
        className={`inline-flex items-center gap-2 text-sm font-mono text-muted-foreground hover:text-primary transition-colors cursor-pointer ${className}`}
      >
        <ArrowLeft className="w-4 h-4" />
        <span>返回主页</span>
      </span>
    </Link>
  );
}
