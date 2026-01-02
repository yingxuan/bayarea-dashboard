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

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const data = JSON.parse(text);
          if (!Array.isArray(data)) {
            throw new Error("Invalid format: expected array");
          }

          const merge = confirm("Merge with existing holdings? (Cancel to replace)");
          importHoldings(data, merge);
          toast.success(`Holdings ${merge ? "merged" : "imported"}`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to import holdings");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      try {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) {
          throw new Error("Invalid format: expected array");
        }

        const merge = confirm("Merge with existing holdings? (Cancel to replace)");
        importHoldings(data, merge);
        toast.success(`Holdings ${merge ? "merged" : "imported"}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to import holdings");
      }
    }).catch(() => {
      toast.error("Failed to read clipboard");
    });
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
