/**
 * Hook for handling external links with mobile return hint
 * Shows toast on first external link click per session (mobile only)
 */

import { useState, useCallback, useEffect } from "react";
import { useIsMobile } from "./useMobile";

const SESSION_STORAGE_KEY = "external_link_hint_shown";

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
  const isStandalone = typeof window !== "undefined" ? isStandaloneMode() : false;

  // Check if hint was already shown this session
  const hasShownHint = typeof window !== "undefined" && 
    sessionStorage.getItem(SESSION_STORAGE_KEY) === "true";

  // Global click handler for all external links
  useEffect(() => {
    if (typeof window === "undefined" || !isMobile || hasShownHint) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[target="_blank"]') as HTMLAnchorElement;
      
      if (!link || !link.href) return;
      
      const href = link.href;
      const currentOrigin = window.location.origin;
      
      // Only show hint for external links (not same-origin, not placeholder)
      const isExternal = href && 
        !href.startsWith(currentOrigin) && 
        href !== "#" && 
        !href.startsWith("javascript:") &&
        !href.startsWith("mailto:");
      
      if (isExternal) {
        // Show hint and open in new tab (works for both regular mobile and standalone)
        e.preventDefault();
        e.stopPropagation();
        setShowHint(true);
        sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
        
        // Open link after showing hint
        setTimeout(() => {
          window.open(href, "_blank", "noopener,noreferrer");
        }, 100);
      }
    };

    document.addEventListener("click", handleClick, true); // Use capture phase
    return () => document.removeEventListener("click", handleClick, true);
  }, [isMobile, hasShownHint, isStandalone]);

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
    
    if (isExternal && isMobile && !hasShownHint) {
      e.preventDefault();
      setShowHint(true);
      sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
      
      setTimeout(() => {
        window.open(href, "_blank", "noopener,noreferrer");
      }, 100);
    }
  }, [isMobile, hasShownHint, isStandalone]);

  const dismissHint = useCallback(() => {
    setShowHint(false);
  }, []);

  return {
    showHint,
    dismissHint,
    handleExternalLinkClick,
    isStandalone,
  };
}
