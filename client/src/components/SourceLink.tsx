/**
 * Shared component: Source link
 * Fixed position (bottom-right of card or in title row)
 */

import { ExternalLink } from "lucide-react";

interface SourceLinkProps {
  name: string;
  url: string;
  position?: "card-bottom" | "title-row";
  className?: string;
}

export default function SourceLink({
  name,
  url,
  position = "card-bottom",
  className = "",
}: SourceLinkProps) {
  if (!url || url === "#") {
    return null;
  }

  const baseClasses = "text-xs opacity-60 text-blue-400 hover:text-blue-300 hover:opacity-100 flex items-center gap-1 font-mono font-normal";

  if (position === "title-row") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClasses} ${className}`}
      >
        <ExternalLink className="w-3 h-3" />
        {name && <span>{name}</span>}
      </a>
    );
  }

  // card-bottom (default)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${baseClasses} mt-2 ${className}`}
    >
      <ExternalLink className="w-3 h-3" />
      {name && <span>{name}</span>}
    </a>
  );
}
