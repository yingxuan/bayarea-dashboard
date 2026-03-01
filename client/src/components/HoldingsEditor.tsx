/**
 * Holdings Editor Component
 * Google Finance–style: list-first, inline edit, simple add flow
 */

import { useState, useEffect } from "react";
import { useAuthAwareHoldings, type Holding } from "@/hooks/useAuthAwareHoldings";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Pencil, Trash2, Download, Upload, Copy, MoreHorizontal, Check, X } from "lucide-react";
import { toast } from "sonner";
import { parseAndMergeXueqiuCsvFiles } from "@/utils/xueqiuCsv";

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
    isSyncing,
  } = useAuthAwareHoldings();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
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
      setShowAddForm(false);
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
      setShowAddForm(false);
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

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这条仓位吗？")) return;
    try {
      await deleteHolding(id);
      if (editingId === id) {
        setEditingId(null);
        setFormData({ ticker: "", shares: 0, avgCost: undefined });
        setErrors({});
      }
      toast.success("已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败，请重试");
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

    // Always log for mobile debugging
    console.log('[HoldingsEditor] handleImport called');
    
    try {
      const input = document.createElement("input");
      input.type = "file";
      // More permissive accept: .json, application/json, text/plain (iOS may set empty or octet-stream)
      input.accept = ".json,application/json,text/plain";
      
      // Add multiple event listeners for mobile compatibility
      let fileProcessed = false;
      
      const processFile = async (file: File) => {
        if (fileProcessed) {
          console.log('[HoldingsEditor] File already processed, skipping');
          return;
        }
        fileProcessed = true;
        
        console.log('[HoldingsEditor] Processing file:', {
          name: file.name,
          type: file.type,
          size: file.size,
        });

        try {
          let text: string;
          
          // Option A: Use file.text() (preferred modern way, mobile-safe)
          if (typeof file.text === 'function') {
            console.log('[HoldingsEditor] Using file.text()');
            text = await file.text();
          } else {
            // Option B: Fallback to FileReader (for older browsers)
            console.log('[HoldingsEditor] Using FileReader fallback');
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

          console.log('[HoldingsEditor] File read successfully, length:', text.length);

          // Parse JSON with good error message
          let data: any;
          try {
            data = JSON.parse(text);
            console.log('[HoldingsEditor] JSON parsed successfully, items:', Array.isArray(data) ? data.length : 'not array');
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

          console.log('[HoldingsEditor] Data validated, items:', data.length);
          console.log('[HoldingsEditor] Current holdings before import:', holdings.length);
          
          const merge = window.confirm("合并到现有持仓？(取消以替换)");
          console.log('[HoldingsEditor] Import mode:', merge ? 'merge' : 'replace');

          await importHoldings(data, merge);

          console.log('[HoldingsEditor] importHoldings() completed with', data.length, 'items, merge=', merge);
          setLastImportError(null);

          const itemCount = data.length;
          toast.success(`持仓${merge ? "已合并" : "已导入"} (${itemCount} 项)`, {
            duration: 3000,
          });
          console.log('[HoldingsEditor] Toast shown.');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "导入持仓失败";
          setLastImportError(errorMessage);
          console.error('[HoldingsEditor] Import error:', error);
          console.error('[HoldingsEditor] Error stack:', error instanceof Error ? error.stack : 'N/A');
          toast.error(errorMessage.includes("读取") ? `读取文件失败：${errorMessage}` : `导入持仓失败：${errorMessage}`);
        } finally {
          // Reset input value so selecting same file again works
          input.value = "";
        }
      };
      
      // Cleanup function
      const cleanup = () => {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
          console.log('[HoldingsEditor] Input element cleaned up');
        }
      };
      
      // Wrapped processFile with cleanup
      const wrappedProcessFile = async (file: File) => {
        await processFile(file);
        // Cleanup after processing
        setTimeout(cleanup, 100);
      };
      
      // Use onchange (primary) - wrap in try-catch for mobile
      input.onchange = async (e) => {
        try {
          console.log('[HoldingsEditor] input.onchange triggered');
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            console.log('[HoldingsEditor] No file selected in onchange');
            input.value = "";
            cleanup();
            return;
          }
          await wrappedProcessFile(file);
        } catch (error) {
          console.error('[HoldingsEditor] Error in onchange handler:', error);
          toast.error(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);
          cleanup();
        }
      };
      
      // Also listen to input event (mobile Chrome fallback)
      input.addEventListener('input', async (e) => {
        try {
          console.log('[HoldingsEditor] input event triggered');
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            await wrappedProcessFile(file);
          } else {
            console.log('[HoldingsEditor] No file in input event');
            cleanup();
          }
        } catch (error) {
          console.error('[HoldingsEditor] Error in input event handler:', error);
          toast.error(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);
          cleanup();
        }
      }, { once: true });
      
      // For mobile Chrome: Add to DOM (required for mobile browsers)
      input.style.position = 'fixed';
      input.style.opacity = '0';
      input.style.width = '0';
      input.style.height = '0';
      input.style.overflow = 'hidden';
      input.style.pointerEvents = 'none';
      input.style.top = '-1000px';
      input.style.left = '-1000px';
      document.body.appendChild(input);
      
      console.log('[HoldingsEditor] Input added to DOM, triggering file picker');
      console.log('[HoldingsEditor] UserAgent:', navigator.userAgent);
      console.log('[HoldingsEditor] Is Chrome Mobile:', /Chrome.*Mobile|Android.*Chrome/.test(navigator.userAgent));
      
      // For mobile Chrome: click() must be called synchronously within user gesture
      // Do NOT use setTimeout - it breaks the user gesture context on mobile
      try {
        input.click();
        console.log('[HoldingsEditor] input.click() called successfully');
      } catch (clickError) {
        console.error('[HoldingsEditor] Error calling input.click():', clickError);
        toast.error('无法打开文件选择器，请尝试使用"从剪贴板导入"');
        cleanup();
        return;
      }
      
      // Also update input event listener
      input.removeEventListener('input', input.oninput as any);
      input.addEventListener('input', async (e) => {
        try {
          console.log('[HoldingsEditor] input event triggered');
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            await wrappedProcessFile(file);
          } else {
            console.log('[HoldingsEditor] No file in input event');
            cleanup();
          }
        } catch (error) {
          console.error('[HoldingsEditor] Error in input event handler:', error);
          toast.error(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);
          cleanup();
        }
      }, { once: true });
      
      // Fallback cleanup after 10 seconds
      setTimeout(() => {
        if (!fileProcessed) {
          console.warn('[HoldingsEditor] ⚠️ File not processed after 10s, cleaning up');
          cleanup();
        }
      }, 10000);
      
      // Log if file picker doesn't trigger within 1 second (mobile issue detection)
      setTimeout(() => {
        if (!fileProcessed) {
          console.warn('[HoldingsEditor] ⚠️ File picker may not have opened after 1s');
          console.warn('[HoldingsEditor] Input state:', {
            type: input.type,
            accept: input.accept,
            inDOM: document.body.contains(input),
            files: input.files?.length || 0,
          });
        }
      }, 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "无法打开文件选择器";
      setLastImportError(errorMessage);
      console.error('[HoldingsEditor] File picker error:', error);
      console.error('[HoldingsEditor] Error stack:', error instanceof Error ? error.stack : 'N/A');
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
      await importHoldings(data, merge);
      setLastImportError(null);
      toast.success(`持仓${merge ? "已合并" : "已导入"}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "读取剪贴板失败";
      setLastImportError(errorMessage);
      console.error('[HoldingsEditor] Paste error:', error);
      toast.error(errorMessage.includes("JSON") || errorMessage.includes("格式") ? `读取失败：${errorMessage}` : `导入持仓失败：${errorMessage}`);
    }
  };

  const handleXueqiuImport = () => {
    if (typeof window === "undefined") {
      toast.error("文件导入仅在客户端可用");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.multiple = true;
    input.onchange = async () => {
      const files = input.files ? Array.from(input.files) : [];
      if (files.length === 0) return;
      try {
        const texts = await Promise.all(
          files.map((f) =>
            typeof f.text === "function" ? f.text() : readFileAsText(f)
          )
        );
        const merged = parseAndMergeXueqiuCsvFiles(texts);
        if (merged.length === 0) {
          toast.error("未解析到有效持仓，请确认是雪球导出的 CSV");
          return;
        }
        const data: Holding[] = merged.map((h, i) => ({
          id: `xueqiu_${Date.now()}_${i}`,
          ticker: h.ticker,
          shares: h.shares,
          avgCost: h.avgCost,
        }));
        const mergeWithExisting = window.confirm(
          `已解析 ${merged.length} 条持仓（${files.length} 个文件）。合并到现有持仓？(取消以替换)`
        );
        await importHoldings(data, mergeWithExisting);
        setLastImportError(null);
        toast.success(
          `雪球持仓${mergeWithExisting ? "已合并" : "已导入"}（${merged.length} 条）`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "解析失败";
        toast.error(`从雪球导入失败：${msg}`);
      }
      input.value = "";
    };
    input.click();
  };

  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const r = e.target?.result;
        if (typeof r === "string") resolve(r);
        else reject(new Error("无法读取文件"));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

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
            添加或编辑持仓：代码、股数、平均成本（可选）。
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Debug (only with ?debug=1) */}
          {typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("debug") === "1" &&
            lastImportError && (
              <div className="mb-2 p-2 bg-muted rounded text-xs text-destructive">
                Last import error: {lastImportError}
              </div>
            )}

          {/* Header: Add + More */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <Button
              size="sm"
              onClick={() => {
                setShowAddForm(true);
                setEditingId(null);
                setFormData({ ticker: "", shares: 0, avgCost: undefined });
                setErrors({});
              }}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              添加持仓
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <MoreHorizontal className="h-4 w-4" />
                  更多
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  导出 JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-2" />
                  复制到剪贴板
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleImport}>
                  <Upload className="h-4 w-4 mr-2" />
                  导入文件
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePaste}>
                  <Upload className="h-4 w-4 mr-2" />
                  从剪贴板导入
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleXueqiuImport}>
                  <Upload className="h-4 w-4 mr-2" />
                  导入雪球CSV文件
                </DropdownMenuItem>
                {holdings.length === 0 && (
                  <DropdownMenuItem onClick={addExampleHoldings}>
                    添加示例持仓
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Add form: show when adding (clicked "添加持仓") or when no holdings yet */}
          {(showAddForm || holdings.length === 0) && (
            <div className="border rounded-lg p-3 mb-3 bg-muted/30">
              <div className="grid grid-cols-[1fr_80px_90px_auto] gap-2 items-end">
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">代码</label>
                  <Input
                    className="h-8 font-mono"
                    value={formData.ticker || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, ticker: e.target.value.toUpperCase() })
                    }
                    placeholder="AAPL"
                    aria-invalid={!!errors.ticker}
                  />
                  {errors.ticker && (
                    <p className="text-xs text-destructive mt-0.5">{errors.ticker}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">股数</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8"
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
                    <p className="text-xs text-destructive mt-0.5">{errors.shares}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">成本 (可选)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8"
                    value={formData.avgCost ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        avgCost: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="—"
                    aria-invalid={!!errors.avgCost}
                  />
                  {errors.avgCost && (
                    <p className="text-xs text-destructive mt-0.5">{errors.avgCost}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button onClick={handleSave} size="sm" className="h-8 gap-1">
                    <Check className="h-3.5 w-3" />
                    添加
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setShowAddForm(false);
                      setFormData({ ticker: "", shares: 0, avgCost: undefined });
                      setErrors({});
                    }}
                  >
                    <X className="h-3.5 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Holdings table: view or inline edit per row */}
          {holdings.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>股票代码</TableHead>
                  <TableHead>股数</TableHead>
                  <TableHead>平均成本</TableHead>
                  <TableHead className="w-[90px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding) =>
                  editingId === holding.id ? (
                    <TableRow key={holding.id} className="bg-muted/30">
                      <TableCell className="p-1">
                        <Input
                          className="h-8 font-mono"
                          value={formData.ticker || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, ticker: e.target.value.toUpperCase() })
                          }
                          placeholder="AAPL"
                          aria-invalid={!!errors.ticker}
                        />
                        {errors.ticker && (
                          <p className="text-xs text-destructive">{errors.ticker}</p>
                        )}
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-8"
                          value={formData.shares ?? ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              shares: e.target.value ? parseFloat(e.target.value) : 0,
                            })
                          }
                          aria-invalid={!!errors.shares}
                        />
                        {errors.shares && (
                          <p className="text-xs text-destructive">{errors.shares}</p>
                        )}
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-8"
                          value={formData.avgCost ?? ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              avgCost: e.target.value ? parseFloat(e.target.value) : undefined,
                            })
                          }
                          placeholder="—"
                          aria-invalid={!!errors.avgCost}
                        />
                        {errors.avgCost && (
                          <p className="text-xs text-destructive">{errors.avgCost}</p>
                        )}
                      </TableCell>
                      <TableCell className="p-1">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="h-8 gap-0.5"
                            onClick={handleSave}
                          >
                            <Check className="h-3.5 w-3" />
                            保存
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setEditingId(null);
                              setFormData({ ticker: "", shares: 0, avgCost: undefined });
                              setErrors({});
                            }}
                          >
                            <X className="h-3.5 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={holding.id}>
                      <TableCell className="font-mono">{holding.ticker}</TableCell>
                      <TableCell>{holding.shares}</TableCell>
                      <TableCell>
                        {holding.avgCost != null ? `$${holding.avgCost.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(holding)}
                            title="编辑"
                          >
                            <Pencil className="h-3.5 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(holding.id)}
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          )}
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
