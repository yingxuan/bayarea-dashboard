/**
 * ExternalLink component - Wrapper for external links with mobile return hint
 * Ensures consistent behavior: opens in new tab, shows hint on mobile first click
 * 
 * Usage:
 * <ExternalLink href="https://example.com">Link text</ExternalLink>
 * 
 * For same-origin links, use regular <a> tag (this component will not intercept)
 */

import { ReactNode } from "react";
import { useExternalLink } from "@/hooks/useExternalLink";

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  [key: string]: any; // Allow other props
}

export default function ExternalLink({ 
  href, 
  children, 
  className = "",
  target = "_blank",
  rel = "noopener noreferrer",
  onClick,
  ...props 
}: ExternalLinkProps) {
  const { handleExternalLinkClick } = useExternalLink();

  // Check if it's an external link
  const isExternal = typeof window !== "undefined" && 
    href && 
    !href.startsWith(window.location.origin) && 
    href !== "#" &&
    !href.startsWith("javascript:") &&
    !href.startsWith("mailto:");

  // For external links, always use _blank and noopener
  const finalTarget = isExternal ? "_blank" : target;
  const finalRel = isExternal ? "noopener noreferrer" : rel;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Call custom onClick if provided
    if (onClick) {
      onClick(e);
    }
    
    // Handle external link click (for mobile hint)
    if (isExternal) {
      handleExternalLinkClick(e);
    }
  };

  return (
    <a
      href={href}
      target={finalTarget}
      rel={finalRel}
      onClick={handleClick}
      className={className}
      {...props}
    >
      {children}
    </a>
  );
}
