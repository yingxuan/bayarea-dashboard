/**
 * Link helper utilities
 * Ensures all external links have consistent behavior
 */

/**
 * Check if a URL is external (not same-origin)
 */
export function isExternalUrl(href: string | undefined | null): boolean {
  if (!href || typeof window === "undefined") return false;
  
  return (
    !href.startsWith(window.location.origin) &&
    href !== "#" &&
    !href.startsWith("javascript:") &&
    !href.startsWith("mailto:") &&
    !href.startsWith("/") // Relative paths are internal
  );
}

/**
 * Ensure external link has proper attributes
 * Use this helper when creating <a> tags directly (instead of ExternalLink component)
 */
export function ensureExternalLinkAttributes(
  href: string,
  target?: string,
  rel?: string
): { target: string; rel: string } {
  const isExternal = isExternalUrl(href);
  
  if (isExternal) {
    return {
      target: "_blank",
      rel: "noopener noreferrer",
    };
  }
  
  return {
    target: target || "_self",
    rel: rel || "",
  };
}
