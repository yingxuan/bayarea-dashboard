/**
 * Simple toast component for mobile return hint
 * Shows once per session when user clicks external link
 */

import { useEffect } from "react";

interface ReturnHintToastProps {
  show: boolean;
  onDismiss: () => void;
  isStandalone?: boolean;
}

export default function ReturnHintToast({ show, onDismiss, isStandalone = false }: ReturnHintToastProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 2000); // Auto dismiss after 2 seconds
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  if (!show) return null;

  const message = isStandalone 
    ? "已打开外部链接，点击返回按钮返回" 
    : "已在新标签打开，返回即可继续刷";

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 md:hidden">
      <div className="bg-card border border-border/60 shadow-lg rounded-sm px-4 py-2.5 max-w-[90vw]">
        <p className="text-xs font-mono font-normal text-foreground/90 text-center whitespace-nowrap">
          {message}
        </p>
      </div>
    </div>
  );
}
