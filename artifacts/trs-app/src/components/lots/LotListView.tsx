import { useMemo } from "react";
import {
  useListProductionEntries,
  type ProductionEntryWithDetails,
} from "@workspace/api-client-react";
import { Plus, Timer, Play, CheckCircle2, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LotListViewProps {
  onNew: () => void;
  onResume: (id: string) => void;
}

export function LotListView({ onNew, onResume }: LotListViewProps) {
  const today = new Date().toISOString().split("T")[0];
  const { data: entries, isLoading } = useListProductionEntries({
    dateFrom: today,
    dateTo: today,
  });

  const active = useMemo(() => (entries ?? []).filter((e) => e.status === "draft"), [entries]);
  const closed = useMemo(() => (entries ?? []).filter((e) => e.status !== "draft"), [entries]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Activité du jour</h1>
          <p className="text-sm text-muted-foreground">Aujourd'hui · {today}</p>
        </div>
        <Button className="h-12 px-5 font-semibold gap-2" onClick={onNew}>
          <Plus className="h-5 w-5" /> Nouveau cycle
        </Button>
      </div>

      {isLoading && <div className="text-center py-10 text-muted-foreground">Chargement…</div>}

      {active.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-2">
            <Timer className="h-4 w-4" /> Lot actif ({active.length})
          </h2>
          {active.map((e) => (
            <div
              key={e.id}
              className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-medium">
                  {(e as ProductionEntryWithDetails).equipmentName ?? "—"} ·{" "}
                  {(e as ProductionEntryWithDetails).productName ?? "—"}
                </div>
                <div className="text-sm text-muted-foreground">
                  Lot {e.batchNumber} · {e.shift}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {e.quantityProduced} u. · {e.quantityConforming} conf.
                </div>
              </div>
              <Button
                className="h-11 bg-amber-500 hover:bg-amber-400 text-white font-semibold shrink-0 gap-2"
                onClick={() => onResume(e.id)}
              >
                <Play className="h-4 w-4" /> Reprendre
              </Button>
            </div>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Lots du jour ({closed.length})
          </h2>
          {closed.map((e) => {
            const statusLabel =
              e.status === "submitted"
                ? "Clôturé"
                : e.status === "validated"
                  ? "Revu ✓"
                  : "Corrigé";
            const statusClass =
              e.status === "submitted"
                ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                : e.status === "validated"
                  ? "bg-green-500/20 text-green-400 border-green-500/30"
                  : "bg-orange-500/20 text-orange-400 border-orange-500/30";
            return (
              <div
                key={e.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {(e as ProductionEntryWithDetails).equipmentName ?? "—"} ·{" "}
                    {(e as ProductionEntryWithDetails).productName ?? "—"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Lot {e.batchNumber} · {e.shift}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {e.quantityProduced} u. · {e.quantityConforming} conf.
                  </div>
                </div>
                <span
                  className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-full border shrink-0",
                    statusClass,
                  )}
                >
                  {statusLabel}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && (entries ?? []).length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <PackageOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-medium text-muted-foreground">Aucune activité aujourd'hui</p>
          <p className="text-sm text-muted-foreground mt-1">
            Cliquez sur "Nouveau cycle" pour commencer
          </p>
        </div>
      )}
    </div>
  );
}
