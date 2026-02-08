/**
 * Back To Home Link Component
 * Simple navigation link to return to the home page
 */

import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function BackToHomeLink() {
  return (
    <Link href="/">
      <div className="inline-flex items-center gap-1.5 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <ArrowLeft className="w-4 h-4" />
        <span>返回主页</span>
      </div>
    </Link>
  );
}
