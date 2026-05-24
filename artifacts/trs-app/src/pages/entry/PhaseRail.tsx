import { CheckCircle2, Building2, Cpu, Clock, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Room } from "@workspace/api-client-react";
import type { Phase, PhaseStatus } from "./types";
import { getPhase } from "./constants";
import { fmtSeconds } from "./utils";

export function PhaseRail({
  room,
  equipment,
  cycleOrder,
  phaseStatuses,
  activePhase,
  onPhaseClick,
  onReorder,
  elapsed,
}: {
  room: Room;
  equipment: { id: string; code: string; name: string };
  cycleOrder: Phase[];
  phaseStatuses: Record<Phase, PhaseStatus>;
  activePhase: Phase;
  onPhaseClick: (p: Phase) => void;
  onReorder: () => void;
  elapsed: number;
}) {
  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
      {/* Context bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">
          {room.code} — {room.name}
        </span>
        <Cpu className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
        <span className="text-sm text-muted-foreground truncate">{equipment.name}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            onClick={onReorder}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2 py-1 hover:bg-muted/40 transition"
            aria-label="Réorganiser les phases"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Réorganiser</span>
          </button>
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Clock className="h-3.5 w-3.5" />
            <span className="tabular-nums font-mono">{fmtSeconds(elapsed)}</span>
          </div>
        </div>
      </div>

      {/* Phase stepper horizontal */}
      <div className="flex items-center gap-0 overflow-x-auto px-2 py-2 no-scrollbar">
        {cycleOrder.map((phaseId, idx) => {
          const def = getPhase(phaseId);
          const status = phaseStatuses[phaseId];
          const isActive = phaseId === activePhase;

          return (
            <button
              key={phaseId}
              onClick={() => onPhaseClick(phaseId)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0",
                isActive && `${def.bg} ${def.color} ${def.borderActive} border`,
                !isActive && status === "done" && "text-emerald-500",
                !isActive && status === "todo" && "text-muted-foreground hover:text-foreground",
                !isActive && status === "skipped" && "text-muted-foreground/40 line-through",
              )}
            >
              {status === "done" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : isActive ? (
                <span className={def.color}>{def.icon}</span>
              ) : (
                <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">
                  {idx + 1}
                </span>
              )}
              <span className="hidden sm:block">{def.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
