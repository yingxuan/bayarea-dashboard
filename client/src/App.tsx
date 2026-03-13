/**
 * Data Punk Design Style:
 * - Dark cyberpunk theme with neon accents
 * - High information density like financial terminals
 * - Neon green for gains, neon red for losses, electric blue for interactions
 * - Monospace fonts for data/numbers
 * - Grid background patterns
 * - Real-time data animations with glow effects
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider } from "./contexts/LanguageContext";

const Home = lazy(() => import("./pages/Home"));
const Baoguo = lazy(() => import("./pages/Baoguo"));
const Fangzi = lazy(() => import("./pages/Fangzi"));
const Piaozi = lazy(() => import("./pages/Piaozi"));
const Chihe = lazy(() => import("./pages/Chihe"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageFallback() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="h-6 w-40 animate-pulse rounded bg-muted/50" />
        <div className="mt-4 h-4 w-64 animate-pulse rounded bg-muted/40" />
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/baoguo"} component={Baoguo} />
        <Route path={"/fangzi"} component={Fangzi} />
        <Route path={"/piaozi"} component={Piaozi} />
        <Route path={"/chihe"} component={Chihe} />
        <Route path={"/login"} component={LoginPage} />
        <Route path={"/forgot-password"} component={ForgotPasswordPage} />
        <Route path={"/reset-password"} component={ResetPasswordPage} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <LanguageProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
