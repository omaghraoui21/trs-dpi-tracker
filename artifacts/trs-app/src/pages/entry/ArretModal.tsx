import { useState, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { timeToMin, nowHHMM } from "./utils";

const FAMILLE_ORDER = [
  "Panne équipement",
  "Attente matière/article",
  "Réglage/changement",
  "Contrôle qualité",
  "Nettoyage",
  "Autre",
];

export function ArrêtModal({
  open,
  mode,
  categories,
  onClose,
  onConfirmLive,
  onConfirmMicro,
}: {
  open: boolean;
  mode: "live" | number | null;
  categories: {
    id: string;
    code: string;
    label: string;
    isPlanned: boolean;
    famille: string | null;
  }[];
  onClose: () => void;
  onConfirmLive: (categoryId: string) => Promise<void>;
  onConfirmMicro: (
    categoryId: string,
    minutes: number,
    startTime: string,
    comment?: string,
  ) => Promise<void>;
}) {
  const [selectedCat, setSelectedCat] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedFamille, setExpandedFamille] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof categories>();
    for (const c of categories) {
      const key = c.famille ?? "Autre";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    const sorted: { famille: string; items: typeof categories }[] = [];
    for (const f of FAMILLE_ORDER) {
      const items = map.get(f);
      if (items) sorted.push({ famille: f, items });
      map.delete(f);
    }
    for (const [famille, items] of map) {
      sorted.push({ famille, items });
    }
    return sorted;
  }, [categories]);

  useEffect(() => {
    if (open) {
      setSelectedCat("");
      setComment("");
      setExpandedFamille(null);
    }
  }, [open]);

  async function handleConfirm() {
    if (!selectedCat) return;
    setSaving(true);
    try {
      if (mode === "live") {
        await onConfirmLive(selectedCat);
      } else if (typeof mode === "number") {
        const sm = timeToMin(nowHHMM()) - mode;
        const hh = Math.floor((((sm % 1440) + 1440) % 1440) / 60);
        const mm = (((sm % 1440) + 1440) % 1440) % 60;
        const startTime = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        await onConfirmMicro(selectedCat, mode, startTime, comment || undefined);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "live" ? "Démarrer un arrêt" : `Micro-arrêt ${mode ?? 0} min`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="max-h-64 overflow-y-auto space-y-1">
            {grouped.map(({ famille, items }) => (
              <div key={famille}>
                <button
                  onClick={() => setExpandedFamille((prev) => (prev === famille ? null : famille))}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/40 flex items-center justify-between"
                >
                  <span>
                    {famille} ({items.length})
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      expandedFamille === famille && "rotate-180",
                    )}
                  />
                </button>
                {expandedFamille === famille && (
                  <div className="grid grid-cols-1 gap-1 pl-1 pb-1">
                    {items.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCat(c.id)}
                        className={cn(
                          "text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                          selectedCat === c.id
                            ? c.isPlanned
                              ? "border-blue-500 bg-blue-500/10 text-blue-300"
                              : "border-red-500 bg-red-500/10 text-red-300"
                            : "border-border bg-card text-muted-foreground hover:border-border/80",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              c.isPlanned ? "bg-blue-400" : "bg-red-400",
                            )}
                          />
                          <span className="font-medium">[{c.code}]</span>
                          <span className="truncate">{c.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {typeof mode === "number" && (
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Commentaire (optionnel)"
              className="resize-none text-sm"
              rows={2}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!selectedCat || saving} onClick={handleConfirm}>
            {saving ? "…" : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
