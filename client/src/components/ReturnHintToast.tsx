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
    ? "已打开外部链接，点击返回按钮返回" 
    : "已在新标签打开，回到此页继续刷";

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

interface ReturnToDashboardToastProps {
  show: boolean;
  onDismiss: () => void;
  onClick: () => void;
}

export function ReturnToDashboardToast({ show, onDismiss, onClick }: ReturnToDashboardToastProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 5000); // Auto dismiss after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 md:hidden">
      <button
        onClick={onClick}
        className="bg-card border border-border/60 shadow-lg rounded-sm px-4 py-2.5 max-w-[90vw] flex items-center gap-2 hover:bg-card/80 transition-colors"
      >
        <span className="text-xs font-mono font-normal text-foreground/90 whitespace-nowrap">
          ← 继续刷湾区仪表盘
        </span>
        <X 
          className="w-3 h-3 text-muted-foreground hover:text-foreground" 
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        />
      </button>
    </div>
  );
}
