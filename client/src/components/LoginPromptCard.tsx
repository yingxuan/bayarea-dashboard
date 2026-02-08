/**
 * Login Prompt Card
 * Shows when user is not logged in, prompts to login to view portfolio
 */

import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Lock, TrendingUp } from "lucide-react";

interface LoginPromptCardProps {
  className?: string;
}

export default function LoginPromptCard({ className }: LoginPromptCardProps) {
  return (
    <div
      className={`bg-card rounded-sm shadow-md border border-border/40 p-6 ${className || ""}`}
    >
      <div className="flex flex-col items-center justify-center text-center space-y-4 py-4">
        <div className="relative">
          <TrendingUp className="w-12 h-12 text-muted-foreground/50" />
          <Lock className="w-5 h-5 text-primary absolute -bottom-1 -right-1" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">
            登录查看您的资产
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            登录后可以管理您的持仓，查看实时市值和收益情况
          </p>
        </div>
        <Link href="/login">
          <Button size="lg" className="mt-2">
            立即登录
          </Button>
        </Link>
      </div>
    </div>
  );
}
