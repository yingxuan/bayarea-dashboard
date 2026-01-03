/**
 * Shared component: Time ago with ISO tooltip
 * Displays relative time, shows ISO timestamp on hover
 */

interface TimeAgoProps {
  isoString: string;
  className?: string;
}

export default function TimeAgo({ isoString, className = "" }: TimeAgoProps) {
  const formatTimeAgo = (dateString: string) => {
    if (!dateString || dateString.trim() === '') {
      return null;
    }
    
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    // Check if diff is reasonable (not negative or too large)
    if (diffMs < 0 || diffMs > 100 * 365 * 24 * 60 * 60 * 1000) {
      return null;
    }
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return "刚刚";
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return `${Math.floor(diffDays / 7)}周前`;
  };

  const relativeTime = formatTimeAgo(isoString);
  
  // If invalid date, return null (don't display anything)
  if (relativeTime === null) {
    return null;
  }

  const isoTime = new Date(isoString).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <span
      className={`text-xs opacity-60 text-muted-foreground font-mono font-normal ${className}`}
      title={`${isoTime} (${isoString})`}
    >
      {relativeTime}
    </span>
  );
}
