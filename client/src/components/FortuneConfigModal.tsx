import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FortuneConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBirthdate?: string;
  onSave: (value: string) => void;
}

const getTodayInLA = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());

export default function FortuneConfigModal({
  open,
  onOpenChange,
  currentBirthdate,
  onSave,
}: FortuneConfigModalProps) {
  const [value, setValue] = useState(currentBirthdate || "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const maxDate = useMemo(() => getTodayInLA(), []);

  useEffect(() => {
    if (open) {
      setValue(currentBirthdate || "");
      setError("");
    }
  }, [open, currentBirthdate]);

  const validateDate = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return "请输入合法的 YYYY-MM-DD 日期";
    }
    if (date < "1900-01-01") {
      return "生日必须在 1900-01-01 之后";
    }
    if (date > maxDate) {
      return "生日不能晚于今天（洛杉矶时间）";
    }
    return "";
  };

  const handleSave = async () => {
    const normalized = value.trim();
    const validationError = validateDate(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    try {
      // TODO: After login feature exists, move fortune config to user profile.
      onSave(normalized);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>配置生日</DialogTitle>
          <DialogDescription>用来生成个性化的今日运势（仅娱乐）</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="fortune-birthdate">出生日期</Label>
          <Input
            id="fortune-birthdate"
            type="date"
            value={value}
            max={maxDate}
            onChange={(event) => setValue(event.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving} type="button">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
