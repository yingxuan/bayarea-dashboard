/**
 * Holdings Editor Component
 * Dialog/Drawer for editing user stock holdings
 */

import { useState, useEffect } from "react";
import { useHoldings, type Holding } from "@/hooks/useHoldings";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Download, Upload, Copy, X } from "lucide-react";
import { toast } from "sonner";

interface HoldingsEditorProps {
  trigger?: React.ReactNode;
}

export default function HoldingsEditor({ trigger }: HoldingsEditorProps) {
  const [open, setOpen] = useState(false);
  const {
    holdings,
    isLoaded,
    addHolding,
    updateHolding,
    deleteHolding,
    importHoldings,
    exportHoldings,
    addExampleHoldings,
  } = useHoldings();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Holding>>({
    ticker: "",
    shares: 0,
    avgCost: undefined,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastImportError, setLastImportError] = useState<string | null>(null);

  // Debug info (dev-only or behind ?debug=1)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.get('debug') === '1' || import.meta.env.DEV;
    
    if (debugMode) {
      const userAgent = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(userAgent);
      const isAndroid = /Android/.test(userAgent);
      
      console.log('[HoldingsEditor] Debug Info:', {
        userAgent,
        isIOS,
        isAndroid,
        fileInputSupported: typeof HTMLInputElement !== 'undefined' && 'files' in document.createElement('input'),
        fileTextSupported: typeof File !== 'undefined' && 'text' in File.prototype,
        lastImportError,
      });
    }
  }, [lastImportError]);

  // Reset form when drawer opens/closes
  useEffect(() => {
    if (!open) {
      setFormData({ ticker: "", shares: 0, avgCost: undefined });
      setEditingId(null);
      setErrors({});
    }
  }, [open]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.ticker || formData.ticker.trim() === "") {
      newErrors.ticker = "Ticker is required";
    }

    if (typeof formData.shares !== "number" || formData.shares <= 0) {
      newErrors.shares = "Shares must be a positive number";
    }

    if (formData.avgCost !== undefined && formData.avgCost !== null) {
      const costValue = typeof formData.avgCost === "string" 
        ? (formData.avgCost === "" ? undefined : parseFloat(formData.avgCost))
        : formData.avgCost;
      if (costValue !== undefined && (isNaN(costValue) || costValue <= 0)) {
        newErrors.avgCost = "Average cost must be a positive number";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    try {
      const shares = typeof formData.shares === "string" ? parseFloat(formData.shares) : formData.shares || 0;
      const avgCost =
        formData.avgCost !== undefined && formData.avgCost !== null
          ? (typeof formData.avgCost === "string" 
              ? (formData.avgCost === "" ? undefined : parseFloat(formData.avgCost))
              : formData.avgCost)
          : undefined;

      if (editingId) {
        updateHolding(editingId, {
          ticker: formData.ticker || "",
          shares,
          avgCost,
        });
        toast.success("Holding updated");
      } else {
        addHolding({
          ticker: formData.ticker || "",
          shares,
          avgCost,
        });
        toast.success("Holding added");
      }

      setFormData({ ticker: "", shares: 0, avgCost: undefined });
      setEditingId(null);
      setErrors({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save holding");
    }
  };

  const handleEdit = (holding: Holding) => {
    setFormData({
      ticker: holding.ticker,
      shares: holding.shares,
      avgCost: holding.avgCost,
    });
    setEditingId(holding.id);
    setErrors({});
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this holding?")) {
      deleteHolding(id);
      toast.success("Holding deleted");
    }
  };

  const handleExport = () => {
    try {
      const json = exportHoldings();
      // Download as file
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "holdings.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Holdings exported");
    } catch (error) {
      toast.error("Failed to export holdings");
    }
  };

  const handleCopy = () => {
    try {
      const json = exportHoldings();
      navigator.clipboard.writeText(json);
      toast.success("Holdings copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy holdings");
    }
  };

  const handleImport = async () => {
    if (typeof window === 'undefined') {
      toast.error("文件导入仅在客户端可用");
      return;
    }

    try {
      const input = document.createElement("input");
      input.type = "file";
      // More permissive accept: .json, application/json, text/plain (iOS may set empty or octet-stream)
      input.accept = ".json,application/json,text/plain";
      
      // Ensure file picker is triggered directly by user click
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          // Reset input value so selecting same file again works
          input.value = "";
          return;
        }

        // Debug: log file info
        const urlParams = new URLSearchParams(window.location.search);
        const debugMode = urlParams.get('debug') === '1' || import.meta.env.DEV;
        if (debugMode) {
          console.log('[HoldingsEditor] File selected:', {
            name: file.name,
            type: file.type,
            size: file.size,
          });
        }

        try {
          let text: string;
          
          // Option A: Use file.text() (preferred modern way, mobile-safe)
          if (typeof file.text === 'function') {
            text = await file.text();
          } else {
            // Option B: Fallback to FileReader (for older browsers)
            text = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) => {
                const result = event.target?.result;
                if (typeof result === 'string') {
                  resolve(result);
                } else {
                  reject(new Error("读取文件失败：无法读取文件内容"));
                }
              };
              reader.onerror = (error) => {
                reject(new Error(`读取文件失败：${error.target?.error?.message || '未知错误'}`));
              };
              reader.readAsText(file);
            });
          }

          // Parse JSON with good error message
          let data: any;
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            throw new Error(`JSON 解析失败：${parseError instanceof Error ? parseError.message : '无效的 JSON 格式'}`);
          }

          // Validate schema (expected keys)
          if (!Array.isArray(data)) {
            throw new Error("无效格式：期望数组格式");
          }

          // Validate each item has required fields
          const invalidItems = data.filter((item: any) => 
            !item || typeof item !== 'object' || typeof item.ticker !== 'string' || typeof item.shares !== 'number'
          );
          if (invalidItems.length > 0) {
            throw new Error(`数据格式错误：${invalidItems.length} 个项目缺少必需字段 (ticker, shares)`);
          }

          const merge = confirm("合并到现有持仓？(取消以替换)");
          importHoldings(data, merge);
          setLastImportError(null);
          toast.success(`持仓${merge ? "已合并" : "已导入"}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "导入持仓失败";
          setLastImportError(errorMessage);
          console.error('[HoldingsEditor] Import error:', error);
          toast.error(`读取文件失败：${errorMessage}`);
        } finally {
          // Reset input value so selecting same file again works
          input.value = "";
        }
      };
      
      // Trigger file picker (must be direct user click)
      input.click();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "无法打开文件选择器";
      setLastImportError(errorMessage);
      console.error('[HoldingsEditor] File picker error:', error);
      toast.error(`读取文件失败：${errorMessage}`);
    }
  };

  const handlePaste = async () => {
    if (typeof window === 'undefined') {
      toast.error("粘贴功能仅在客户端可用");
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      
      // Parse JSON with good error message
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`JSON 解析失败：${parseError instanceof Error ? parseError.message : '无效的 JSON 格式'}`);
      }

      // Validate schema
      if (!Array.isArray(data)) {
        throw new Error("无效格式：期望数组格式");
      }

      // Validate each item has required fields
      const invalidItems = data.filter((item: any) => 
        !item || typeof item !== 'object' || typeof item.ticker !== 'string' || typeof item.shares !== 'number'
      );
      if (invalidItems.length > 0) {
        throw new Error(`数据格式错误：${invalidItems.length} 个项目缺少必需字段 (ticker, shares)`);
      }

      const merge = confirm("合并到现有持仓？(取消以替换)");
      importHoldings(data, merge);
      setLastImportError(null);
      toast.success(`持仓${merge ? "已合并" : "已导入"}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "读取剪贴板失败";
      setLastImportError(errorMessage);
      console.error('[HoldingsEditor] Paste error:', error);
      toast.error(`读取文件失败：${errorMessage}`);
    }
  };

  if (!isLoaded) {
    return null;
  }

  const defaultTrigger = (
    <Button variant="outline" size="sm">
      编辑仓位
    </Button>
  );

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger || defaultTrigger}</DrawerTrigger>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>编辑仓位</DrawerTitle>
          <DrawerDescription>
            管理您的股票持仓。输入股票代码、股数和平均成本。
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Debug Banner (dev-only or behind ?debug=1) */}
          {typeof window !== 'undefined' && (() => {
            const urlParams = new URLSearchParams(window.location.search);
            const debugMode = urlParams.get('debug') === '1' || import.meta.env.DEV;
            if (!debugMode) return null;
            
            const userAgent = navigator.userAgent;
            const isIOS = /iPad|iPhone|iPod/.test(userAgent);
            const isAndroid = /Android/.test(userAgent);
            const fileInputSupported = typeof HTMLInputElement !== 'undefined' && 'files' in document.createElement('input');
            const fileTextSupported = typeof File !== 'undefined' && 'text' in File.prototype;
            
            return (
              <div className="mb-4 p-3 bg-muted rounded-lg text-xs font-mono space-y-1">
                <div><strong>Debug Info:</strong></div>
                <div>UserAgent: {userAgent.substring(0, 50)}...</div>
                <div>isIOS: {String(isIOS)}, isAndroid: {String(isAndroid)}</div>
                <div>fileInputSupported: {String(fileInputSupported)}, fileTextSupported: {String(fileTextSupported)}</div>
                {lastImportError && (
                  <div className="text-destructive">
                    Last Error: {lastImportError}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Empty State */}
          {holdings.length === 0 && !editingId && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-4">暂无持仓</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={addExampleHoldings}>
                  添加示例
                </Button>
                <Button variant="outline" size="sm" onClick={() => setFormData({ ticker: "", shares: 0, avgCost: undefined })}>
                  新增一行
                </Button>
              </div>
            </div>
          )}

          {/* Holdings Table */}
          {holdings.length > 0 && (
            <div className="mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>股票代码</TableHead>
                    <TableHead>股数</TableHead>
                    <TableHead>平均成本</TableHead>
                    <TableHead className="w-[100px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((holding) => (
                    <TableRow key={holding.id}>
                      <TableCell className="font-mono">{holding.ticker}</TableCell>
                      <TableCell>{holding.shares}</TableCell>
                      <TableCell>
                        {holding.avgCost ? `$${holding.avgCost.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(holding)}
                          >
                            <span className="text-xs">编辑</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(holding.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Add/Edit Form */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-medium">{editingId ? "编辑持仓" : "新增持仓"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">股票代码 *</label>
                <Input
                  value={formData.ticker || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, ticker: e.target.value.toUpperCase() })
                  }
                  placeholder="AAPL, MSFT, NVDA..."
                  aria-invalid={!!errors.ticker}
                />
                {errors.ticker && (
                  <p className="text-xs text-destructive mt-1">{errors.ticker}</p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">股数 *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.shares || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      shares: e.target.value ? parseFloat(e.target.value) : 0,
                    })
                  }
                  placeholder="10"
                  aria-invalid={!!errors.shares}
                />
                {errors.shares && (
                  <p className="text-xs text-destructive mt-1">{errors.shares}</p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">平均成本 (可选)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.avgCost || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      avgCost: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  placeholder="150.00"
                  aria-invalid={!!errors.avgCost}
                />
                {errors.avgCost && (
                  <p className="text-xs text-destructive mt-1">{errors.avgCost}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} size="sm">
                {editingId ? "更新" : "添加"}
              </Button>
              {editingId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFormData({ ticker: "", shares: 0, avgCost: undefined });
                    setEditingId(null);
                    setErrors({});
                  }}
                >
                  取消
                </Button>
              )}
            </div>
          </div>

          {/* Import/Export */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              导出 JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-2" />
              复制到剪贴板
            </Button>
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Upload className="h-4 w-4 mr-2" />
              导入文件
            </Button>
            <Button variant="outline" size="sm" onClick={handlePaste}>
              <Upload className="h-4 w-4 mr-2" />
              从剪贴板导入
            </Button>
          </div>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button>关闭</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
