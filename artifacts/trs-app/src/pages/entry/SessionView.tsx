import { useState, useEffect, useRef } from "react";
import { useCycleOrder } from "@workspace/api-client-react";
import { CheckCircle2, X } from "lucide-react";
import type { Room } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import type { Phase, PhaseStatus } from "./types";
import { DEFAULT_CYCLE } from "./constants";
import { fmtDur, fmtSeconds } from "./utils";
import { PhaseRail } from "./PhaseRail";
import { PhaseReorderDialog } from "./PhaseReorderDialog";
import { SimplePhasePanel } from "./SimplePhasePanel";
import { LotStartForm } from "./LotStartForm";
import { LotActiveTracker } from "./LotActiveTracker";

export function SessionView({
  room,
  equipment,
  onExit,
}: {
  room: Room;
  equipment: { id: string; code: string; name: string };
  onExit: () => void;
}) {
  const { data: cycleData } = useCycleOrder();
  const [cycleOrder, setCycleOrder] = useState<Phase[]>(DEFAULT_CYCLE);
  const [phaseStatuses, setPhaseStatuses] = useState<Record<Phase, PhaseStatus>>(
    Object.fromEntries(DEFAULT_CYCLE.map((p, i) => [p, i === 0 ? "active" : "todo"])) as Record<
      Phase,
      PhaseStatus
    >,
  );
  const [activePhase, setActivePhase] = useState<Phase>(DEFAULT_CYCLE[0]);
  const [orderInitialized, setOrderInitialized] = useState(false);
  const [activeLotId, setActiveLotId] = useState<string | null>(null);
  const [lotView, setLotView] = useState<"start" | "active">("start");
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [reorderOpen, setReorderOpen] = useState(false);
  const sessionStartRef = useRef(Date.now());

  // Initialize cycle order from admin default once per mount.
  useEffect(() => {
    if (cycleData && !orderInitialized) {
      const order = cycleData.order as Phase[];
      setCycleOrder(order);
      setPhaseStatuses(
        Object.fromEntries(order.map((p, i) => [p, i === 0 ? "active" : "todo"])) as Record<
          Phase,
          PhaseStatus
        >,
      );
      setActivePhase(order[0]);
      setOrderInitialized(true);
    }
  }, [cycleData, orderInitialized]);

  useEffect(() => {
    const iv = setInterval(() => {
      setSessionElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Uses functional updater to avoid stale-closure bugs on rapid transitions.
  function advancePhase(phase: Phase, newStatus: "done" | "skipped") {
    setPhaseStatuses((prev) => {
      const updated = { ...prev, [phase]: newStatus };
      const idx = cycleOrder.indexOf(phase);
      const next = cycleOrder.slice(idx + 1).find((p) => updated[p] === "todo");
      if (next) {
        updated[next] = "active";
        setActivePhase(next);
      }
      return updated;
    });
  }

  function markPhaseDone(phase: Phase) {
    advancePhase(phase, "done");
  }

  function markPhaseSkipped(phase: Phase) {
    advancePhase(phase, "skipped");
  }

  function handlePhaseClick(phase: Phase) {
    // Allow free navigation including skipped phases (operator may want to revisit).
    setActivePhase(phase);
    setPhaseStatuses((prev) => {
      const status = prev[phase];
      if (status === "skipped" || status === "todo") {
        return { ...prev, [phase]: "active" };
      }
      return prev;
    });
  }

  function applyReorder(newOrder: Phase[]) {
    setCycleOrder(newOrder);
    setReorderOpen(false);
  }

  const currentPhaseIdx = cycleOrder.indexOf(activePhase);
  const hasNext = cycleOrder.slice(currentPhaseIdx + 1).some((p) => phaseStatuses[p] === "todo");

  function renderPhaseContent() {
    if (activePhase === "LOT") {
      if (lotView === "start") {
        return (
          <LotStartForm
            equipmentId={equipment.id}
            onStarted={(id) => {
              setActiveLotId(id);
              setLotView("active");
            }}
            onCancel={() => {
              markPhaseSkipped("LOT");
            }}
          />
        );
      }
      if (lotView === "active" && activeLotId) {
        return (
          <LotActiveTracker
            lotId={activeLotId}
            onClosed={() => {
              markPhaseDone("LOT");
              setLotView("start");
              setActiveLotId(null);
            }}
            onBack={() => setLotView("start")}
          />
        );
      }
    }

    return (
      <SimplePhasePanel
        phase={activePhase}
        onDone={(_min, _comment) => {
          markPhaseDone(activePhase);
        }}
        onSkip={() => markPhaseSkipped(activePhase)}
        onNext={() => {
          const idx = cycleOrder.indexOf(activePhase);
          const next = cycleOrder.slice(idx + 1).find((p) => phaseStatuses[p] !== "skipped");
          if (next) handlePhaseClick(next);
        }}
        hasNext={hasNext}
      />
    );
  }

  const allDoneOrSkipped = cycleOrder.every(
    (p) => phaseStatuses[p] === "done" || phaseStatuses[p] === "skipped",
  );

  return (
    <div className="min-h-screen flex flex-col">
      <PhaseRail
        room={room}
        equipment={equipment}
        cycleOrder={cycleOrder}
        phaseStatuses={phaseStatuses}
        activePhase={activePhase}
        onPhaseClick={handlePhaseClick}
        onReorder={() => setReorderOpen(true)}
        elapsed={sessionElapsed}
      />

      <PhaseReorderDialog
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        order={cycleOrder}
        onApply={applyReorder}
      />

      <div className="flex-1">
        {allDoneOrSkipped ? (
          <div className="p-6 max-w-sm mx-auto text-center space-y-5 pt-16">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Cycle terminé</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Toutes les phases du local {room.code} ont été complétées.
              </p>
              <p className="text-sm text-muted-foreground">
                Durée totale : {fmtDur(Math.floor(sessionElapsed / 60))}
              </p>
            </div>
            <Button className="w-full h-14 font-bold text-base" onClick={onExit}>
              Terminer et revenir à l'accueil
            </Button>
          </div>
        ) : (
          renderPhaseContent()
        )}
      </div>

      {/* Exit session button */}
      {!allDoneOrSkipped && (
        <div className="fixed bottom-4 right-4">
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-muted-foreground gap-1.5 shadow-lg bg-background"
            onClick={onExit}
          >
            <X className="h-3.5 w-3.5" /> Quitter le cycle
          </Button>
        </div>
      )}
    </div>
  );
}
