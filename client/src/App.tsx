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
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import Home from "./pages/Home";
import Piaozi from "./pages/Piaozi";
import Chihe from "./pages/Chihe";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/piaozi"} component={Piaozi} />
      <Route path={"/chihe"} component={Chihe} />
      <Route path={"/login"} component={LoginPage} />
      <Route path={"/forgot-password"} component={ForgotPasswordPage} />
      <Route path={"/reset-password"} component={ResetPasswordPage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
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
