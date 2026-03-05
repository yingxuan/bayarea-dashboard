/**
 * Reset Password Page
 * Allows users to set a new password using a valid reset token from the URL
 */

import { useState } from "react";
import { useLocation, useSearch } from "wouter";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { resetPassword } = useAuth();
  const { lang } = useLanguage();
  const t = useT(lang);

  const params = new URLSearchParams(searchString);
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-mono neon-text-blue">
              {t.auth.invalidLink}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t.auth.invalidLinkDesc}
              </AlertDescription>
            </Alert>
            <Button
              className="w-full"
              onClick={() => navigate("/forgot-password")}
            >
              {t.auth.requestNewReset}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t.auth.passwordMismatch);
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPassword(token, password);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || t.auth.resetFailed);
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
            {t.auth.setNewPassword}
          </CardTitle>
          <CardDescription>{t.auth.newPasswordDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  {t.auth.resetSuccessMsg}
                </AlertDescription>
              </Alert>
              <Button className="w-full" onClick={() => navigate("/login")}>
                {t.auth.goToLogin}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-password">{t.auth.newPassword}</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder={t.auth.newPasswordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">{t.auth.confirmNewPassword}</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  placeholder={t.auth.confirmNewPasswordPlaceholder}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.auth.resetting}
                  </>
                ) : (
                  t.auth.resetPasswordAction
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t.auth.backToLogin}
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
