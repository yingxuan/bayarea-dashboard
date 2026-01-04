/**
 * Toast components for mobile external link hints
 * - First click hint: shows when user clicks external link for first time
 * - Return hint: shows when user returns to the dashboard tab
 */

import { useEffect } from "react";
import { X } from "lucide-react";

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
    ? "已打开外部链接，点击浏览器返回按钮可返回仪表盘" 
    : "已在新标签打开，切换回此标签页继续刷";

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[9999] w-full max-w-sm px-4">
      <div className="bg-card border-2 border-primary/50 shadow-xl rounded-sm px-4 py-3 animate-in slide-in-from-bottom-2">
        <p className="text-sm font-mono font-semibold text-primary text-center">
          {message}
        </p>
      </div>
    </div>
  );
}

interface ReturnToDashboardToastProps {
  show: boolean;
  onDismiss: () => void;
  onClick: () => void;
}

export function ReturnToDashboardToast({ show, onDismiss, onClick }: ReturnToDashboardToastProps) {
  useEffect(() => {
    if (show) {
      // Make it more persistent - show for 10 seconds instead of 5
      const timer = setTimeout(() => {
        onDismiss();
      }, 10000); // Auto dismiss after 10 seconds
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] w-full max-w-sm px-4">
      <button
        onClick={onClick}
        className="w-full bg-card border-2 border-primary/50 shadow-xl rounded-sm px-4 py-3 flex items-center justify-between gap-2 hover:bg-card/90 hover:border-primary transition-all animate-in slide-in-from-top-2"
      >
        <span className="text-sm font-mono font-semibold text-primary whitespace-nowrap flex items-center gap-2">
          <span className="text-lg">←</span>
          <span>继续刷湾区仪表盘</span>
        </span>
        <X 
          className="w-4 h-4 text-muted-foreground hover:text-foreground flex-shrink-0" 
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        />
      </button>
    </div>
  );
}
