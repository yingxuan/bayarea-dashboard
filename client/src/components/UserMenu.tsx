/**
 * User Menu Component
 * Shows login button when not authenticated, user dropdown when authenticated
 */

import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, LogOut, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function UserMenu() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { lang } = useLanguage();
  const t = useT(lang);

  if (isLoading) {
    return (
      <div className="flex items-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Link href="/login">
        <Button variant="outline" size="sm" className="text-xs h-8">
          {t.user.signIn}
        </Button>
      </Link>
    );
  }

  const displayText = user?.displayName || user?.email?.split("@")[0] || t.user.fallbackName;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5">
          <User className="w-4 h-4" />
          <span className="text-xs font-mono max-w-[80px] truncate">
            {displayText}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {user?.displayName && (
              <p className="text-sm font-medium">{user.displayName}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logout()}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t.user.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
