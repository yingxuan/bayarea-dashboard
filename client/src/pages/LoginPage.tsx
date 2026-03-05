/**
 * Login/Register Page
 * Supports both login and registration with tabbed interface
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login, register, isAuthenticated } = useAuth();
  const { lang } = useLanguage();
  const t = useT(lang);

  // Form states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate("/", { replace: true });
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await login(loginEmail, loginPassword);
      if (result.success) {
        navigate("/", { replace: true });
      } else {
        setError(result.error || t.auth.loginError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (registerPassword !== registerConfirmPassword) {
      setError(t.auth.passwordMismatch);
      return;
    }

    setIsLoading(true);

    try {
      const result = await register(
        registerEmail,
        registerPassword,
        displayName || undefined
      );
      if (result.success) {
        navigate("/", { replace: true });
      } else {
        setError(result.error || t.auth.registerError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-mono neon-text-blue">
            {t.auth.brand}
          </CardTitle>
          <CardDescription>{t.auth.brandDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as "login" | "register");
              setError(null);
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t.auth.login}</TabsTrigger>
              <TabsTrigger value="register">{t.auth.register}</TabsTrigger>
            </TabsList>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">{t.auth.email}</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="your@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">{t.auth.password}</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="********"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t.auth.loginLoading}
                    </>
                  ) : (
                    t.auth.login
                  )}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t.auth.forgotPassword}
                  </button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="register-email">{t.auth.email}</Label>
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="your@email.com"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display-name">{t.auth.displayName}</Label>
                  <Input
                    id="display-name"
                    type="text"
                    placeholder={t.auth.displayNamePlaceholder}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">{t.auth.password}</Label>
                  <Input
                    id="register-password"
                    type="password"
                    placeholder={t.auth.passwordPlaceholder}
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-confirm-password">{t.auth.confirmPassword}</Label>
                  <Input
                    id="register-confirm-password"
                    type="password"
                    placeholder={t.auth.confirmPasswordPlaceholder}
                    value={registerConfirmPassword}
                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t.auth.registerLoading}
                    </>
                  ) : (
                    t.auth.register
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="hover:text-foreground transition-colors"
            >
              {t.auth.backToHome}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
