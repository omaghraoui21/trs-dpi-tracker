import { useState, useEffect } from "react";
import { Play, StopCircle, CheckCircle2, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Phase } from "./types";
import { getPhase } from "./constants";
import { fmtSeconds, fmtDur } from "./utils";

export function SimplePhasePanel({
  phase,
  onDone,
  onSkip,
  onNext,
  hasNext,
}: {
  phase: Phase;
  onDone: (durationMin: number, comment: string) => void;
  onSkip: () => void;
  onNext: () => void;
  hasNext: boolean;
}) {
  const def = getPhase(phase);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [doneMin, setDoneMin] = useState(0);

  useEffect(() => {
    if (!running || !startedAt) return;
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [running, startedAt]);

  function handleStart() {
    setStartedAt(new Date());
    setRunning(true);
    setElapsed(0);
  }

  function handleStop() {
    setRunning(false);
    const min = Math.ceil(elapsed / 60);
    setDoneMin(min);
    setDone(true);
  }

  function handleConfirm() {
    onDone(doneMin, comment);
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-5">
      {/* Phase header */}
      <div className={cn("rounded-2xl border p-5 space-y-2 text-center", def.bg, def.borderActive)}>
        <div className={cn("flex justify-center", def.color)}>{def.icon}</div>
        <h2 className="text-xl font-bold">{def.label}</h2>
        <p className="text-sm text-muted-foreground">{def.description}</p>
      </div>

      {!done ? (
        <>
          {/* Timer */}
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4">
            <div className="text-5xl font-mono font-bold tabular-nums">{fmtSeconds(elapsed)}</div>
            {!running ? (
              <Button
                className={cn("h-14 px-10 font-bold text-base gap-2", def.bg, def.color)}
                variant="outline"
                onClick={handleStart}
              >
                <Play className="h-5 w-5" /> Démarrer le chrono
              </Button>
            ) : (
              <Button
                className="h-14 px-10 font-bold text-base gap-2 bg-red-600 hover:bg-red-500 text-white"
                onClick={handleStop}
              >
                <StopCircle className="h-5 w-5" /> Terminer
              </Button>
            )}
          </div>

          {/* Skip */}
          {!running && (
            <button
              onClick={onSkip}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2"
            >
              <SkipForward className="h-3.5 w-3.5" /> Passer cette phase
            </button>
          )}
        </>
      ) : (
        <>
          {/* Summary + comment */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              Phase terminée — {fmtDur(doneMin)}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Commentaire / observations (optionnel)</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="resize-none text-sm"
                rows={3}
                placeholder="Ex: RAS — conforme au protocole"
              />
            </div>
          </div>

          <Button
            className="w-full h-14 font-bold text-base gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={handleConfirm}
          >
            <CheckCircle2 className="h-5 w-5" />
            Valider et {hasNext ? "passer à la suite" : "terminer le cycle"}
          </Button>
        </>
      )}
    </div>
  );
}
