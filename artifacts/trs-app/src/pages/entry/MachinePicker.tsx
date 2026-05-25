import { useMemo } from "react";
import { useListProductionEntries } from "@workspace/api-client-react";
import type { ProductionEntryWithDetails, Room } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Cpu, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MachinePicker({
  room,
  onSelect,
  onBack,
}: {
  room: Room;
  onSelect: (eq: { id: string; code: string; name: string }) => void;
  onBack: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const { data: entries } = useListProductionEntries({ dateFrom: today, dateTo: today });

  const activeLotByEquip = useMemo(() => {
    const m = new Map<string, ProductionEntryWithDetails>();
    (entries ?? []).filter((e) => e.status === "draft").forEach((e) => m.set(e.equipmentId, e));
    return m;
  }, [entries]);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-muted-foreground">{room.code}</span>
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className="flex items-center gap-1">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-[10px]">
                2
              </span>
              <span className="font-medium text-foreground">Machine</span>
            </span>
            <ChevronRight className="h-3 w-3 opacity-40" />
            <span className="flex items-center gap-1 opacity-40">
              <span className="w-5 h-5 rounded-full border border-muted-foreground flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Lot</span>
            </span>
          </div>
          <h1 className="text-xl font-bold">Sélectionner une machine</h1>
        </div>
      </div>

      <div className="grid gap-3">
        {room.equipments.map((eq) => {
          const activeLot = activeLotByEquip.get(eq.id);
          return (
            <button
              key={eq.id}
              onClick={() => onSelect(eq)}
              className={cn(
                "w-full text-left rounded-2xl border p-5 transition-all hover:border-primary/60 hover:bg-primary/5 group",
                activeLot ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-card",
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    activeLot ? "bg-amber-500/20" : "bg-muted",
                  )}
                >
                  <Cpu
                    className={cn(
                      "h-6 w-6",
                      activeLot ? "text-amber-400" : "text-muted-foreground",
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    <span className="font-mono text-muted-foreground text-sm">[{eq.code}]</span>
                    <span className="truncate">{eq.name}</span>
                  </div>
                  {activeLot ? (
                    <div className="text-xs text-amber-400 mt-0.5">
                      Lot actif :{" "}
                      <span className="font-mono">
                        {(activeLot as { batchNumber?: string }).batchNumber ?? "—"}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      TRS obj. {eq.trsObjective}%
                    </div>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
