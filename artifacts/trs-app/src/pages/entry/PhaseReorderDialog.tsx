import { useState, useEffect } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Phase } from "./types";
import { getPhase } from "./constants";

export function PhaseReorderDialog({
  open,
  onOpenChange,
  order,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Phase[];
  onApply: (newOrder: Phase[]) => void;
}) {
  const [draft, setDraft] = useState<Phase[]>(order);

  useEffect(() => {
    if (open) setDraft(order);
  }, [open, order]);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...draft];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5 text-sky-500" />
            Réorganiser le cycle
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Modifie l'ordre des phases pour cette session uniquement. L'ordre par défaut (admin) ne
          sera pas modifié.
        </p>
        <div className="space-y-2 my-2">
          {draft.map((phaseId, idx) => {
            const def = getPhase(phaseId);
            return (
              <div
                key={phaseId}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2.5",
                  def.bg,
                  def.borderActive,
                )}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background/60 font-semibold text-xs">
                  {idx + 1}
                </div>
                <span className={cn("shrink-0", def.color)}>{def.icon}</span>
                <span className="flex-1 text-sm font-medium truncate">{def.label}</span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    aria-label="Monter"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => move(idx, 1)}
                    disabled={idx === draft.length - 1}
                    aria-label="Descendre"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => onApply(draft)}>Appliquer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
