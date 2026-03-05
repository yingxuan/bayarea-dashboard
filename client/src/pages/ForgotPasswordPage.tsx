/**
 * Forgot Password Page
 * Allows users to request a password reset link via email
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function ForgotPasswordPage() {
  const [, navigate] = useLocation();
  const { forgotPassword } = useAuth();
  const { lang } = useLanguage();
  const t = useT(lang);

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await forgotPassword(email);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || t.auth.operationFailed);
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
            {t.auth.resetTitle}
          </CardTitle>
          <CardDescription>
            {t.auth.resetDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  {t.auth.resetSuccess}
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/login")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t.auth.backToLogin}
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
                <Label htmlFor="reset-email">{t.auth.email}</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.auth.sendingReset}
                  </>
                ) : (
                  t.auth.sendReset
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="inline mr-1 h-3 w-3" />
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
