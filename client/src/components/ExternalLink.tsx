/**
 * ExternalLink component - Wrapper for external links with mobile return hint
 * Ensures consistent behavior: opens in new tab, shows hint on mobile first click
 */

import { ReactNode } from "react";
import { useExternalLink } from "@/hooks/useExternalLink";

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  [key: string]: any; // Allow other props
}

export default function ExternalLink({ 
  href, 
  children, 
  className = "",
  target = "_blank",
  rel = "noopener noreferrer",
  ...props 
}: ExternalLinkProps) {
  const { handleExternalLinkClick } = useExternalLink();

  // Don't intercept if it's a same-origin link or placeholder
  const isExternal = typeof window !== "undefined" && 
    href && 
    !href.startsWith(window.location.origin) && 
    href !== "#" &&
    !href.startsWith("javascript:") &&
    !href.startsWith("mailto:");

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      onClick={isExternal ? handleExternalLinkClick : undefined}
      className={className}
      {...props}
    >
      {children}
    </a>
  );
}
