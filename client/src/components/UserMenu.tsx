import { Link } from "wouter";
import { Check, Languages, LogOut, Loader2, PencilIcon } from "lucide-react";
import HoldingsEditor from "@/components/HoldingsEditor";
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
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function UserMenu() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { lang, toggleLang } = useLanguage();
  const t = useT(lang);

  if (isLoading) {
    return (
      <div className="flex items-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Link href="/login">
        <Button variant="outline" size="sm" className="h-8 text-xs">
          {t.user.signIn}
        </Button>
      </Link>
    );
  }

  const displayText = user?.displayName || user?.email?.split("@")[0] || t.user.fallbackName;
  const avatarLabel = displayText.trim().charAt(0).toUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/8 text-xs font-semibold text-foreground">
            {avatarLabel}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {user?.displayName ? <p className="text-sm font-medium">{user.displayName}</p> : null}
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleLang} className="cursor-pointer">
          <Languages className="mr-2 h-4 w-4" />
          <span>{lang === "zh" ? "English" : "中文"}</span>
          <span className="ml-auto inline-flex items-center text-muted-foreground">
            <Check className="h-3.5 w-3.5" />
          </span>
        </DropdownMenuItem>
        <HoldingsEditor
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()} className="cursor-pointer">
              <PencilIcon className="mr-2 h-4 w-4" />
              <span>{lang === "en" ? "Edit Holdings" : "编辑仓位"}</span>
            </DropdownMenuItem>
          }
        />
        <DropdownMenuItem
          onClick={() => logout()}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t.user.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
