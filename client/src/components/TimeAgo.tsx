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
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
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
      className={`text-xs text-muted-foreground font-mono ${className}`}
      title={`${isoTime} (${isoString})`}
    >
      {relativeTime}
    </span>
  );
}
