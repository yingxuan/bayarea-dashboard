/**
 * Hook for handling external links with mobile return hint
 * Shows toast on first external link click per session (mobile only)
 * Shows return hint when user comes back to the tab
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useIsMobile } from "./useMobile";

const SESSION_STORAGE_KEY = "external_link_hint_shown";
const LAST_OUTBOUND_CLICK_KEY = "last_outbound_click_time";
const RETURN_HINT_SHOWN_KEY = "return_hint_shown";

// Check if app is running in PWA/standalone mode
function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  // Check for standalone display mode
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // Check for iOS standalone mode
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

export function useExternalLink() {
  const isMobile = useIsMobile();
  const [showHint, setShowHint] = useState(false);
  const [showReturnHint, setShowReturnHint] = useState(false);
  const isStandalone = typeof window !== "undefined" ? isStandaloneMode() : false;
  const lastOutboundClickRef = useRef<number | null>(null);

  // Check if hint was already shown this session
  const hasShownHint = typeof window !== "undefined" && 
    sessionStorage.getItem(SESSION_STORAGE_KEY) === "true";

  // Track outbound clicks and show return hint when user comes back
  // Show on all devices, not just mobile
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // User returned to the tab
        const lastClickTime = lastOutboundClickRef.current;
        if (lastClickTime) {
          const timeSinceClick = Date.now() - lastClickTime;
          const tenMinutes = 10 * 60 * 1000;
          
          // Show return hint if click was within last 10 minutes
          if (timeSinceClick < tenMinutes) {
            const returnHintShown = sessionStorage.getItem(RETURN_HINT_SHOWN_KEY);
            if (!returnHintShown || returnHintShown !== String(lastClickTime)) {
              // Small delay to ensure page is fully visible
              setTimeout(() => {
                setShowReturnHint(true);
                sessionStorage.setItem(RETURN_HINT_SHOWN_KEY, String(lastClickTime));
              }, 300);
            }
          }
        }
      } else {
        // Tab became hidden - don't show hint when user leaves
        setShowReturnHint(false);
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      // Handle back/forward navigation
      if (e.persisted || document.visibilityState === "visible") {
        handleVisibilityChange();
      }
    };

    const handleFocus = () => {
      // Also check on window focus (user switched back to tab)
      handleVisibilityChange();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Global click handler for all external links
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a') as HTMLAnchorElement;
      
      if (!link || !link.href) return;
      
      const href = link.href;
      const currentOrigin = window.location.origin;
      
      // Only handle external links (not same-origin, not placeholder)
      const isExternal = href && 
        !href.startsWith(currentOrigin) && 
        href !== "#" && 
        !href.startsWith("javascript:") &&
        !href.startsWith("mailto:");
      
      if (isExternal) {
        // Track outbound click time
        const clickTime = Date.now();
        lastOutboundClickRef.current = clickTime;
        sessionStorage.setItem(LAST_OUTBOUND_CLICK_KEY, String(clickTime));
        sessionStorage.removeItem(RETURN_HINT_SHOWN_KEY); // Reset return hint flag
        
        // Ensure link opens in new tab (always for external links)
        if (link.target !== "_blank") {
          link.target = "_blank";
        }
        if (!link.rel || !link.rel.includes("noopener")) {
          link.rel = link.rel ? `${link.rel} noopener noreferrer` : "noopener noreferrer";
        }
        
        // In standalone/PWA mode, use same-tab navigation so back button works
        // In regular browsers, use new tab to preserve dashboard
        if (isStandalone) {
          // Standalone mode: open in same tab so back button can return to dashboard
          e.preventDefault();
          e.stopPropagation();
          
          // Show hint on first click (mobile only)
          if (isMobile && !hasShownHint) {
            setShowHint(true);
            sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
            setTimeout(() => {
              window.location.href = href;
            }, 100);
          } else {
            // Direct navigation for subsequent clicks
            window.location.href = href;
          }
        } else {
          // Regular browser: open in new tab
          // Show first-click hint on mobile (only once per session)
          if (isMobile && !hasShownHint) {
            e.preventDefault();
            e.stopPropagation();
            setShowHint(true);
            sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
            
            setTimeout(() => {
              window.open(href, "_blank", "noopener,noreferrer");
            }, 100);
          }
          // For non-mobile or after first hint, let the browser handle it naturally
          // The link already has target="_blank" set above
        }
      }
    };

    document.addEventListener("click", handleClick, true); // Use capture phase
    return () => document.removeEventListener("click", handleClick, true);
  }, [isMobile, hasShownHint, isStandalone]);

  // Restore last outbound click time from sessionStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(LAST_OUTBOUND_CLICK_KEY);
    if (stored) {
      lastOutboundClickRef.current = parseInt(stored, 10);
    }
  }, []);

  const handleExternalLinkClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    // This is a fallback for components that explicitly use it
    // The global handler should catch most cases
    if (typeof window === "undefined") return;
    
    const href = e.currentTarget.href;
    const currentOrigin = window.location.origin;
    
    const isExternal = href && 
      !href.startsWith(currentOrigin) && 
      href !== "#" && 
      !href.startsWith("javascript:") &&
      !href.startsWith("mailto:");
    
      if (isExternal) {
        // Track outbound click
        const clickTime = Date.now();
        lastOutboundClickRef.current = clickTime;
        sessionStorage.setItem(LAST_OUTBOUND_CLICK_KEY, String(clickTime));
        sessionStorage.removeItem(RETURN_HINT_SHOWN_KEY);
        
        // Ensure proper attributes
        e.currentTarget.target = "_blank";
        e.currentTarget.rel = "noopener noreferrer";
        
        if (isStandalone) {
          // Standalone mode: open in same tab so back button can return to dashboard
          e.preventDefault();
          if (isMobile && !hasShownHint) {
            setShowHint(true);
            sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
            setTimeout(() => {
              window.location.href = href;
            }, 100);
          } else {
            window.location.href = href;
          }
        } else if (isMobile && !hasShownHint) {
          // Regular browser: open in new tab
          e.preventDefault();
          setShowHint(true);
          sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
          
          setTimeout(() => {
            window.open(href, "_blank", "noopener,noreferrer");
          }, 100);
        }
      }
  }, [isMobile, hasShownHint, isStandalone]);

  const dismissHint = useCallback(() => {
    setShowHint(false);
  }, []);

  const dismissReturnHint = useCallback(() => {
    setShowReturnHint(false);
  }, []);

  const handleReturnHintClick = useCallback(() => {
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
    setShowReturnHint(false);
  }, []);

  return {
    showHint,
    dismissHint,
    showReturnHint,
    dismissReturnHint,
    handleReturnHintClick,
    handleExternalLinkClick,
    isStandalone,
  };
}
