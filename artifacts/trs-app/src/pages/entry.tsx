import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  useListEquipments,
  useListProducts,
  useListDowntimeCategories,
  useListCadences,
  useCreateProductionEntry,
  useUpdateProductionEntry,
  useSubmitProductionEntry,
  useListProductionEntries,
  getListProductionEntriesQueryKey,
  customFetch,
  useListRooms,
  useCycleOrder,
} from "@workspace/api-client-react";
import type { ProductionEntryWithDetails, Room } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Play,
  StopCircle,
  Clock,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  Gauge,
  PackageOpen,
  Timer,
  Edit3,
  AlarmClock,
  ChevronDown,
  Droplets,
  Wind,
  FlaskConical,
  ShieldCheck,
  ArrowRight,
  SkipForward,
  Building2,
  Cpu,
  ArrowUpDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Phase definitions ─────────────────────────────────────────────────────────
type Phase = "VIDE_LIGNE" | "REMPLISSAGE" | "LOT" | "NETTOYAGE" | "DESINFECTION";
type PhaseStatus = "todo" | "active" | "done" | "skipped";

interface PhaseDef {
  id: Phase;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  borderActive: string;
}

const PHASE_DEFS: PhaseDef[] = [
  {
    id: "VIDE_LIGNE",
    label: "Vide de ligne",
    shortLabel: "Vide ligne",
    description: "Vérification et vide de la ligne avant production",
    icon: <Wind className="h-4 w-4" />,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    borderActive: "border-sky-500",
  },
  {
    id: "REMPLISSAGE",
    label: "Remplissage / Chargement",
    shortLabel: "Remplissage",
    description: "Chargement matière première et articles de conditionnement",
    icon: <PackageOpen className="h-4 w-4" />,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    borderActive: "border-amber-500",
  },
  {
    id: "LOT",
    label: "Production du lot",
    shortLabel: "Lot",
    description: "Fabrication en cours — saisie quantités et arrêts",
    icon: <Gauge className="h-4 w-4" />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    borderActive: "border-emerald-500",
  },
  {
    id: "NETTOYAGE",
    label: "Nettoyage équipement",
    shortLabel: "Nettoyage",
    description: "Nettoyage et démontage de l'équipement après production",
    icon: <Droplets className="h-4 w-4" />,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    borderActive: "border-cyan-500",
  },
  {
    id: "DESINFECTION",
    label: "Désinfection local",
    shortLabel: "Désinfection",
    description: "Désinfection du local et libération de zone",
    icon: <ShieldCheck className="h-4 w-4" />,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    borderActive: "border-violet-500",
  },
];

const DEFAULT_CYCLE: Phase[] = ["VIDE_LIGNE", "REMPLISSAGE", "LOT", "NETTOYAGE", "DESINFECTION"];

function getPhase(id: Phase) {
  return PHASE_DEFS.find((p) => p.id === id)!;
}

// ─── Shift Schedules ──────────────────────────────────────────────────────────
type ShiftMode = "standard" | "exc_2p" | "ram_1p" | "ram_2p";
interface PosteDef {
  label: string;
  shift: string;
  start: string;
  end: string;
}

const SHIFT_MODES: Record<ShiftMode, { label: string; subtitle: string; postes: PosteDef[] }> = {
  standard: {
    label: "Standard",
    subtitle: "08:00 – 17:00",
    postes: [{ label: "Poste journée", shift: "Standard", start: "08:00", end: "17:00" }],
  },
  exc_2p: {
    label: "2 Postes exceptionnels",
    subtitle: "07:00 – 23:00",
    postes: [
      { label: "Poste 1", shift: "Exceptionnel – P1", start: "07:00", end: "15:00" },
      { label: "Poste 2", shift: "Exceptionnel – P2", start: "15:00", end: "23:00" },
    ],
  },
  ram_1p: {
    label: "Ramadan",
    subtitle: "08:00 – 14:30",
    postes: [{ label: "Poste Ramadan", shift: "Ramadan", start: "08:00", end: "14:30" }],
  },
  ram_2p: {
    label: "Ramadan 2 postes",
    subtitle: "05:00 – 17:00",
    postes: [
      { label: "Poste 1", shift: "Ramadan – P1", start: "05:00", end: "11:00" },
      { label: "Poste 2", shift: "Ramadan – P2", start: "11:00", end: "17:00" },
    ],
  },
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function timeToMin(t: string) {
  const [h, m] = (t ?? "").split(":").map(Number);
  return isNaN(h) || isNaN(m) ? 0 : h * 60 + m;
}
function durationMin(start: string, end: string) {
  const s = timeToMin(start),
    e = timeToMin(end);
  return e >= s ? e - s : 1440 - s + e;
}
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtSeconds(sec: number) {
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtDur(min: number) {
  const h = Math.floor(min / 60),
    m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}
function trsHex(v: number) {
  return v >= 0.75 ? "#22c55e" : v >= 0.55 ? "#f97316" : "#ef4444";
}

// ─── Equipment-Specific Configuration ─────────────────────────────────────────
type EquipCfg = { unit: string; lotSize: number; increments: number[]; cadenceInMin: boolean };
const EQUIP_CFG: Record<string, EquipCfg> = {
  A27: {
    unit: "gélules",
    lotSize: 360_000,
    increments: [10_000, 50_000, 100_000, 360_000],
    cadenceInMin: true,
  },
  A28: {
    unit: "blisters",
    lotSize: 36_000,
    increments: [1_000, 5_000, 10_000, 36_000],
    cadenceInMin: false,
  },
};
const DEFAULT_CFG: EquipCfg = {
  unit: "unités",
  lotSize: 0,
  increments: [100, 500, 1_000, 5_000],
  cadenceInMin: false,
};

function fmtCadence(c: number, cfg: EquipCfg): string {
  if (c <= 0) return "—";
  return cfg.cadenceInMin ? `${Math.round(c / 60)} gél/min` : `${c} u/h`;
}

function computeWeightedCadence(
  base: number,
  changes: { time: string; value: number }[],
  shiftStart: string,
  shiftEnd: string,
): number {
  if (base <= 0 && changes.length === 0) return 0;
  const total = durationMin(shiftStart, shiftEnd);
  if (total <= 0) return base;
  const sorted = [...changes].sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
  let sum = 0,
    prevT = timeToMin(shiftStart),
    prevC = base;
  for (const ch of sorted) {
    const t = Math.max(prevT, Math.min(timeToMin(ch.time), timeToMin(shiftEnd)));
    sum += (t - prevT) * prevC;
    prevT = t;
    prevC = ch.value;
  }
  sum += (timeToMin(shiftEnd) - prevT) * prevC;
  return sum / total;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type DowntimeEvent = {
  id: string;
  categoryId: string;
  categoryCode: string | null;
  categoryLabel: string | null;
  categoryIsPlanned: boolean | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: "open" | "closed";
  comment: string | null;
};

// ─── TRS Live Calculation ─────────────────────────────────────────────────────
function computeTrs(params: {
  shiftStart: string;
  shiftEnd: string;
  produced: number;
  conforming: number;
  downtimes: DowntimeEvent[];
  cadence: number;
}) {
  const { shiftStart, shiftEnd, produced, conforming, downtimes, cadence } = params;
  const tO = durationMin(shiftStart, shiftEnd);
  if (tO <= 0 || cadence <= 0) return null;
  const closed = downtimes.filter((d) => d.status === "closed");
  const planned = closed
    .filter((d) => d.categoryIsPlanned)
    .reduce((s, d) => s + d.durationMinutes, 0);
  const unplanned = closed
    .filter((d) => !d.categoryIsPlanned)
    .reduce((s, d) => s + d.durationMinutes, 0);
  const tR = Math.max(0, tO - planned);
  const tF = Math.max(0, tR - unplanned);
  const cpm = cadence / 60;
  const tN = produced / cpm;
  const tU = conforming / cpm;
  const TRS = tR > 0 ? Math.min(1, tU / tR) : 0;
  const TRG = tO > 0 ? Math.min(1, tU / tO) : 0;
  const DO = tR > 0 ? Math.min(1, tF / tR) : 0;
  const TP = tF > 0 ? Math.min(1, tN / tF) : 0;
  const TQ = produced > 0 ? Math.min(1, conforming / produced) : 1;
  return { TRS, TRG, DO, TP, TQ, tO };
}

// ─── Arrêt Modal ──────────────────────────────────────────────────────────────
function ArrêtModal({
  open,
  mode,
  categories,
  onClose,
  onConfirmLive,
  onConfirmMicro,
}: {
  open: boolean;
  mode: "live" | number | null;
  categories: { id: string; code: string; label: string; isPlanned: boolean }[];
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

  useEffect(() => {
    if (open) {
      setSelectedCat("");
      setComment("");
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
          <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCat(c.id)}
                className={cn(
                  "text-left px-3 py-2.5 rounded-lg border text-sm transition-colors",
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

// ─── Phase Reorder Dialog ─────────────────────────────────────────────────────
function PhaseReorderDialog({
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

// ─── Phase Rail (sticky header) ────────────────────────────────────────────────
function PhaseRail({
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

// ─── Simple Phase Panel (for VIDE_LIGNE, REMPLISSAGE, NETTOYAGE, DESINFECTION) ─
function SimplePhasePanel({
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

// ─── Lot Active Tracker ────────────────────────────────────────────────────────
function LotActiveTracker({
  lotId,
  onClosed,
  onBack,
}: {
  lotId: string;
  onClosed: () => void;
  onBack: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const qc = useQueryClient();

  const { data: entries } = useListProductionEntries({ dateFrom: today, dateTo: today });
  const entry = useMemo(
    () => (entries ?? []).find((e) => e.id === lotId) as ProductionEntryWithDetails | undefined,
    [entries, lotId],
  );

  const { data: allCategories } = useListDowntimeCategories();
  const { data: allCadences } = useListCadences();
  const updateEntry = useUpdateProductionEntry();
  const submitEntry = useSubmitProductionEntry();

  const [downtimes, setDowntimes] = useState<DowntimeEvent[]>([]);
  const [produced, setProduced] = useState(0);
  const [conforming, setConforming] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cadenceChanges, setCadenceChanges] = useState<{ time: string; value: number }[]>([]);
  const [openDtSec, setOpenDtSec] = useState(0);
  const [arrêtModal, setArrêtModal] = useState<"live" | number | null>(null);
  const [quickCatModal, setQuickCatModal] = useState<{ categoryId: string; label: string } | null>(
    null,
  );
  const [quickCatMin, setQuickCatMin] = useState("5");
  const [quickCatComment, setQuickCatComment] = useState("");
  const [showCadenceModal, setShowCadenceModal] = useState(false);
  const [cadenceInput, setCadenceInput] = useState("");
  const [showCloture, setShowCloture] = useState(false);
  const [clotureError, setClotureError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const initializedRef = useRef(false);
  const [pauseDismissed, setPauseDismissed] = useState(false);
  const [isPauseTime, setIsPauseTime] = useState(false);

  useEffect(() => {
    function check() {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      setIsPauseTime(mins >= 720 && mins < 780);
    }
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, []);

  const loadDowntimes = useCallback(async () => {
    try {
      const data = await customFetch<DowntimeEvent[]>(`/api/downtime-events?entryId=${lotId}`);
      setDowntimes(data);
    } catch {
      /* silent */
    }
  }, [lotId]);

  useEffect(() => {
    loadDowntimes();
  }, [loadDowntimes]);

  useEffect(() => {
    if (entry && !initializedRef.current) {
      setProduced(entry.quantityProduced ?? 0);
      setConforming(entry.quantityConforming ?? 0);
      initializedRef.current = true;
    }
  }, [entry]);

  const openDowntime = useMemo(
    () => downtimes.find((d) => d.status === "open") ?? null,
    [downtimes],
  );

  useEffect(() => {
    if (!openDowntime) {
      setOpenDtSec(0);
      return;
    }
    function calc() {
      const [h, m] = openDowntime!.startTime.split(":").map(Number);
      const sm = h * 60 + m;
      const now = new Date();
      const nm = now.getHours() * 60 + now.getMinutes();
      const dm = nm >= sm ? nm - sm : nm + 1440 - sm;
      return dm * 60 + now.getSeconds();
    }
    setOpenDtSec(calc());
    const iv = setInterval(() => setOpenDtSec(calc()), 1000);
    return () => clearInterval(iv);
  }, [openDowntime?.id]);

  useEffect(() => {
    if (!entry?.shiftStart) return;
    function calc() {
      const [h, m] = (entry!.shiftStart ?? "08:00").split(":").map(Number);
      const sm = h * 60 + m;
      const now = new Date();
      const nm = now.getHours() * 60 + now.getMinutes();
      const dm = nm >= sm ? nm - sm : nm + 1440 - sm;
      return Math.max(0, dm * 60 + now.getSeconds());
    }
    setElapsed(calc());
    const iv = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(iv);
  }, [entry?.shiftStart]);

  const { data: allEquipments } = useListEquipments();

  const equipCode = useMemo(() => {
    const eq = (allEquipments ?? []).find((e) => e.id === entry?.equipmentId);
    return (eq as { code?: string } | undefined)?.code ?? "";
  }, [allEquipments, entry]);

  const equipCfg = useMemo(() => EQUIP_CFG[equipCode] ?? DEFAULT_CFG, [equipCode]);

  const baseCadence = useMemo(() => {
    const c = (allCadences ?? []).find(
      (c) => c.productId === entry?.productId && c.equipmentId === entry?.equipmentId,
    );
    return c ? Number(c.validatedCadence) : 0;
  }, [allCadences, entry]);

  const currentCadence = useMemo(
    () =>
      cadenceChanges.length > 0 ? cadenceChanges[cadenceChanges.length - 1].value : baseCadence,
    [baseCadence, cadenceChanges],
  );

  const effectiveCadence = useMemo(() => {
    if (!entry?.shiftStart || !entry?.shiftEnd || cadenceChanges.length === 0) return baseCadence;
    return computeWeightedCadence(baseCadence, cadenceChanges, entry.shiftStart, entry.shiftEnd);
  }, [baseCadence, cadenceChanges, entry]);

  const trs = useMemo(() => {
    if (!entry?.shiftStart || !entry?.shiftEnd) return null;
    return computeTrs({
      shiftStart: entry.shiftStart,
      shiftEnd: entry.shiftEnd,
      produced,
      conforming,
      downtimes,
      cadence: effectiveCadence,
    });
  }, [entry, produced, conforming, downtimes, effectiveCadence]);

  const categories = useMemo(
    () =>
      (allCategories ?? []).map((c) => ({
        id: c.id,
        code: c.code,
        label: c.label,
        isPlanned: c.isPlanned,
        isQuickShortcut: (c as unknown as { isQuickShortcut?: boolean }).isQuickShortcut ?? false,
        shortcutEquipments:
          (c as unknown as { shortcutEquipments?: string | null }).shortcutEquipments ?? null,
      })),
    [allCategories],
  );

  const quickDtCodes = useMemo(
    () =>
      categories
        .filter((c) => {
          if (!c.isQuickShortcut) return false;
          if (!c.shortcutEquipments) return true;
          return c.shortcutEquipments
            .split(",")
            .map((s) => s.trim())
            .includes(equipCode);
        })
        .map((c) => c.code),
    [categories, equipCode],
  );

  function addProduced(n: number) {
    setProduced((p) => p + n);
    setDirty(true);
  }

  async function saveQty() {
    if (!entry) return;
    setSaving(true);
    try {
      await updateEntry.mutateAsync({
        id: lotId,
        data: {
          quantityProduced: produced,
          quantityConforming: conforming,
          quantityRejected: Math.max(0, produced - conforming),
        },
      });
      setDirty(false);
      qc.invalidateQueries({
        queryKey: getListProductionEntriesQueryKey({ dateFrom: today, dateTo: today }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function startArrêt(categoryId: string) {
    const data = await customFetch<DowntimeEvent>("/api/downtime-events/start", {
      method: "POST",
      body: JSON.stringify({ entryId: lotId, categoryId, startTime: nowHHMM() }),
    });
    setDowntimes((prev) => [...prev, data]);
  }

  async function stopArrêt() {
    if (!openDowntime) return;
    const data = await customFetch<DowntimeEvent>(`/api/downtime-events/${openDowntime.id}/stop`, {
      method: "PATCH",
      body: JSON.stringify({ endTime: nowHHMM() }),
    });
    setDowntimes((prev) => prev.map((d) => (d.id === data.id ? data : d)));
  }

  async function addMicroArrêt(
    categoryId: string,
    _minutes: number,
    startTime: string,
    comment?: string,
  ) {
    const endTime = nowHHMM();
    const data = await customFetch<DowntimeEvent>("/api/downtime-events", {
      method: "POST",
      body: JSON.stringify({
        entryId: lotId,
        categoryId,
        startTime,
        endTime,
        ...(comment ? { comment } : {}),
      }),
    });
    setDowntimes((prev) => [...prev, data]);
  }

  async function deleteArrêt(id: string) {
    await customFetch(`/api/downtime-events/${id}`, { method: "DELETE" });
    setDowntimes((prev) => prev.filter((d) => d.id !== id));
  }

  async function cloturerLot() {
    setClotureError("");
    try {
      await submitEntry.mutateAsync({ id: lotId });
      qc.invalidateQueries({
        queryKey: getListProductionEntriesQueryKey({ dateFrom: today, dateTo: today }),
      });
      onClosed();
    } catch (e) {
      setClotureError((e as Error).message);
    }
  }

  if (!entry) {
    return <div className="p-8 text-center text-muted-foreground">Chargement du lot…</div>;
  }

  const closedDt = downtimes.filter((d) => d.status === "closed");
  const totalArrêtMin = closedDt.reduce((s, d) => s + d.durationMinutes, 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">
            {entry.equipmentName ?? "—"} · Lot {entry.batchNumber}
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {entry.productName ?? "—"} · {entry.shift}
          </p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Poste</div>
          <div className="text-sm font-medium tabular-nums">{fmtSeconds(elapsed)}</div>
        </div>
      </div>

      {/* Rappel pause déjeuner */}
      {isPauseTime && !pauseDismissed && !openDowntime && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AlarmClock className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">
                Rappel pause déjeuner (12h–13h)
              </p>
              <p className="text-xs text-muted-foreground">
                Pensez à déclarer un arrêt planifié si la machine est à l'arrêt.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setPauseDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Arrêt actif banner */}
      {openDowntime && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-400">Arrêt en cours</p>
              <p className="text-xs text-muted-foreground truncate">
                {openDowntime.categoryLabel ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xl font-bold tabular-nums text-red-400">
              {fmtSeconds(openDtSec)}
            </span>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-500 text-white h-10 px-4 font-semibold"
              onClick={stopArrêt}
            >
              <StopCircle className="h-4 w-4 mr-1.5" /> Stop
            </Button>
          </div>
        </div>
      )}

      {/* Live TRS */}
      {trs && (
        <div className="bg-card border border-border rounded-xl px-4 py-3 space-y-2">
          <div className="grid grid-cols-5 gap-2 text-center">
            {(
              [
                { label: "TRS", v: trs.TRS, sub: "tU/tR" },
                { label: "TRG", v: trs.TRG, sub: "tU/tO" },
                { label: "DO", v: trs.DO, sub: "tF/tR" },
                { label: "TP", v: trs.TP, sub: "tN/tF" },
                { label: "TQ", v: trs.TQ, sub: "tU/tN" },
              ] as const
            ).map(({ label, v, sub }) => (
              <div key={label}>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {label}
                </div>
                <div className="text-base font-bold tabular-nums" style={{ color: trsHex(v) }}>
                  {(v * 100).toFixed(0)}%
                </div>
                <div className="text-[9px] text-muted-foreground/60">{sub}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground text-center border-t border-border pt-1.5">
            tO = {trs.tO} min — TO calculé automatiquement depuis l'horaire poste
          </div>
        </div>
      )}
      {!trs && baseCadence === 0 && (
        <div className="bg-muted/50 border border-border rounded-xl px-4 py-2 text-xs text-muted-foreground text-center">
          Aucune cadence validée pour cet équipement / produit — TRS non calculé
        </div>
      )}

      {/* Quantity section */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quantités · {equipCfg.unit}
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Cadence:</span>
            <span className="text-xs font-medium">{fmtCadence(currentCadence, equipCfg)}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setCadenceInput(
                  equipCfg.cadenceInMin
                    ? String(Math.round(currentCadence / 60) || "")
                    : String(currentCadence || ""),
                );
                setShowCadenceModal(true);
              }}
            >
              <Edit3 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {cadenceChanges.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {cadenceChanges.map((ch, i) => (
              <span
                key={i}
                className="text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-full px-2 py-0.5 font-mono"
              >
                {ch.time} → {fmtCadence(ch.value, equipCfg)}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {equipCfg.increments.map((n) => (
            <Button
              key={n}
              variant="outline"
              className="h-12 font-semibold text-sm"
              onClick={() => addProduced(n)}
              disabled={!!openDowntime}
            >
              +{n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}k` : n}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Produit total</Label>
            <Input
              type="number"
              min={0}
              value={produced}
              onChange={(e) => {
                setProduced(Math.max(0, parseInt(e.target.value, 10) || 0));
                setDirty(true);
              }}
              className="h-11 text-center text-base font-semibold"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Conforme</Label>
            <Input
              type="number"
              min={0}
              max={produced}
              value={conforming}
              onChange={(e) => {
                setConforming(Math.max(0, Math.min(produced, parseInt(e.target.value, 10) || 0)));
                setDirty(true);
              }}
              className="h-11 text-center text-base font-semibold"
            />
          </div>
        </div>

        {equipCfg.lotSize > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Avancement lot</span>
              <span className="tabular-nums">
                {produced.toLocaleString("fr-FR")} / {equipCfg.lotSize.toLocaleString("fr-FR")} ·{" "}
                {Math.round(Math.min(100, (produced / equipCfg.lotSize) * 100))}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (produced / equipCfg.lotSize) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Rebus:{" "}
            <span className="font-medium text-foreground">
              {Math.max(0, produced - conforming)} {equipCfg.unit}
            </span>
          </span>
          <Button
            className={cn(
              "h-10 px-5",
              dirty ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
            disabled={!dirty || saving}
            onClick={saveQty}
          >
            {saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré ✓"}
          </Button>
        </div>
      </div>

      {/* Arrêts section */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" /> Arrêts ({closedDt.length}) · {fmtDur(totalArrêtMin)}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-11 border-red-500/40 text-red-500 hover:bg-red-500/10 font-semibold"
            onClick={() => setArrêtModal("live")}
            disabled={!!openDowntime}
          >
            <Play className="h-4 w-4 mr-2" /> Démarrer arrêt
          </Button>
          <span className="text-xs text-muted-foreground self-center">Micro-arrêt:</span>
          {[5, 10, 15].map((n) => (
            <Button
              key={n}
              variant="outline"
              className="h-11 w-14 font-semibold text-sm"
              onClick={() => setArrêtModal(n)}
            >
              {n}'
            </Button>
          ))}
        </div>

        {quickDtCodes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center whitespace-nowrap">
              Raccourcis :
            </span>
            {quickDtCodes
              .map((code) => categories.find((c) => c.code === code))
              .filter(Boolean)
              .map((cat) => (
                <Button
                  key={cat!.id}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 text-xs font-medium px-3",
                    cat!.isPlanned
                      ? "border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                      : "border-orange-500/40 text-orange-400 hover:bg-orange-500/10",
                  )}
                  disabled={!!openDowntime}
                  onClick={() => {
                    setQuickCatMin("5");
                    setQuickCatModal({
                      categoryId: cat!.id,
                      label: `[${cat!.code}] ${cat!.label}`,
                    });
                  }}
                >
                  {cat!.code}
                </Button>
              ))}
          </div>
        )}

        {closedDt.length > 0 ? (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {closedDt.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2 bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      d.categoryIsPlanned ? "bg-blue-400" : "bg-red-400",
                    )}
                  />
                  <span className="truncate">{d.categoryLabel ?? d.categoryCode ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground tabular-nums">
                    {d.startTime}→{d.endTime}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {fmtDur(d.durationMinutes)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-500"
                    onClick={() => deleteArrêt(d.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">Aucun arrêt enregistré</p>
        )}
      </div>

      <Button
        className="w-full h-14 bg-green-600 hover:bg-green-500 text-white font-bold text-base"
        onClick={() => setShowCloture(true)}
        disabled={!!openDowntime}
      >
        <CheckCircle2 className="h-5 w-5 mr-2" />
        Clôturer le lot
      </Button>

      <ArrêtModal
        open={arrêtModal !== null}
        mode={arrêtModal}
        categories={categories}
        onClose={() => setArrêtModal(null)}
        onConfirmLive={startArrêt}
        onConfirmMicro={addMicroArrêt}
      />

      <Dialog open={showCadenceModal} onOpenChange={setShowCadenceModal}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Changement de cadence</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Enregistre la nouvelle cadence à partir de maintenant. L'impact TRS est calculé au
              prorata du temps.
            </p>
            <div className="space-y-1">
              <Label>Nouvelle cadence ({equipCfg.cadenceInMin ? "gél/min" : "u/h"})</Label>
              <Input
                value={cadenceInput}
                onChange={(e) => setCadenceInput(e.target.value)}
                type="number"
                min={1}
                className="h-11"
                placeholder={equipCfg.cadenceInMin ? "Ex: 1020" : "Ex: 61200"}
              />
            </div>
            {cadenceChanges.length > 0 && (
              <div className="border border-border rounded-lg p-2 bg-muted/30 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Historique
                </p>
                {[
                  { time: entry?.shiftStart ?? "08:00", value: baseCadence },
                  ...cadenceChanges,
                ].map((ch, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{ch.time}</span>
                    <span className="font-mono">{fmtCadence(ch.value, equipCfg)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCadenceChanges([]);
                setShowCadenceModal(false);
              }}
            >
              Réinitialiser
            </Button>
            <Button
              onClick={() => {
                const n = parseInt(cadenceInput, 10);
                if (n > 0)
                  setCadenceChanges((prev) => [
                    ...prev,
                    { time: nowHHMM(), value: equipCfg.cadenceInMin ? n * 60 : n },
                  ]);
                setShowCadenceModal(false);
              }}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={quickCatModal !== null}
        onOpenChange={(v) => {
          if (!v) {
            setQuickCatModal(null);
            setQuickCatComment("");
          }
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm leading-snug">{quickCatModal?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">Durée de l'arrêt (minutes)</p>
            <div className="grid grid-cols-4 gap-2">
              {["5", "10", "15", "30"].map((v) => (
                <Button
                  key={v}
                  variant={quickCatMin === v ? "default" : "outline"}
                  className="h-11 font-semibold"
                  onClick={() => setQuickCatMin(v)}
                >
                  {v}'
                </Button>
              ))}
            </div>
            <Input
              value={quickCatMin}
              onChange={(e) => setQuickCatMin(e.target.value)}
              type="number"
              min={1}
              max={480}
              className="h-11"
              placeholder="Durée personnalisée (min)"
            />
            <Textarea
              value={quickCatComment}
              onChange={(e) => setQuickCatComment(e.target.value)}
              placeholder="Commentaire (optionnel)"
              className="resize-none text-sm"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setQuickCatModal(null);
                setQuickCatComment("");
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={async () => {
                const min = parseInt(quickCatMin, 10);
                if (!quickCatModal || min <= 0) return;
                const now = nowHHMM();
                const sm = timeToMin(now) - min;
                const hh = Math.floor((((sm % 1440) + 1440) % 1440) / 60);
                const mm = (((sm % 1440) + 1440) % 1440) % 60;
                const startTime = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
                await addMicroArrêt(
                  quickCatModal.categoryId,
                  min,
                  startTime,
                  quickCatComment.trim() || undefined,
                );
                setQuickCatModal(null);
                setQuickCatComment("");
              }}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCloture} onOpenChange={setShowCloture}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clôturer le lot ?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-muted-foreground">
              Le lot sera clôturé et intégré au calcul TRS. Cette action est irréversible.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Produit total</span>
                <span className="font-medium">{produced} u.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conforme</span>
                <span className="font-medium">{conforming} u.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Arrêts</span>
                <span className="font-medium">
                  {closedDt.length} ({fmtDur(totalArrêtMin)})
                </span>
              </div>
              {trs && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TRS estimé</span>
                  <span className="font-bold" style={{ color: trsHex(trs.TRS) }}>
                    {(trs.TRS * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            {dirty && (
              <p className="text-xs text-amber-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Quantités non enregistrées — elles seront
                sauvegardées à la clôture.
              </p>
            )}
            {clotureError && <p className="text-sm text-red-500">{clotureError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloture(false)}>
              Annuler
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-500 text-white font-semibold"
              disabled={submitEntry.isPending}
              onClick={async () => {
                if (dirty) await saveQty();
                await cloturerLot();
              }}
            >
              {submitEntry.isPending ? "Clôture en cours…" : "Confirmer la clôture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Lot Start Form (embedded in LOT phase) ────────────────────────────────────
function LotStartForm({
  equipmentId,
  onStarted,
  onCancel,
}: {
  equipmentId: string;
  onStarted: (id: string) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [productId, setProductId] = useState("");
  const [presentationId, setPresentationId] = useState<string>("");
  const [batchNumber, setBatchNumber] = useState("");
  const [batchSuggested, setBatchSuggested] = useState(false);
  const [shiftMode, setShiftMode] = useState<ShiftMode>("standard");
  const [posteIdx, setPosteIdx] = useState(0);
  const [showOtherShifts, setShowOtherShifts] = useState(false);
  const [error, setError] = useState("");
  const [activityType, setActivityType] = useState<"production" | "nettoyage">("production");

  const { data: products } = useListProducts();
  const createEntry = useCreateProductionEntry();
  const qc = useQueryClient();
  const { data: allEquipments } = useListEquipments();

  const nettProduct = useMemo(
    () => (products ?? []).find((p) => (p as { code?: string }).code === "NETT"),
    [products],
  );

  const equipCode = useMemo(() => {
    const eq = (allEquipments ?? []).find((e) => e.id === equipmentId);
    return (eq as { code?: string } | undefined)?.code ?? "";
  }, [allEquipments, equipmentId]);
  const startCfg = useMemo(() => EQUIP_CFG[equipCode] ?? DEFAULT_CFG, [equipCode]);

  useEffect(() => {
    if (activityType !== "production" || !productId) return;
    customFetch<{ suggestion: string }>(
      `/api/production-entries/next-batch-number?productId=${encodeURIComponent(productId)}`,
    )
      .then((d) => {
        setBatchNumber(d.suggestion);
        setBatchSuggested(true);
      })
      .catch(() => {});
  }, [productId, activityType]);

  const currentProduct = useMemo(
    () => (products ?? []).find((p) => p.id === productId),
    [products, productId],
  );
  const productPresentations = useMemo(
    () =>
      (currentProduct as { presentations?: Array<{ id: string; name: string }> } | undefined)
        ?.presentations ?? [],
    [currentProduct],
  );
  useEffect(() => {
    if (productPresentations.length === 1) {
      setPresentationId(productPresentations[0].id);
    } else {
      setPresentationId("");
    }
  }, [productId, productPresentations.length]);

  useEffect(() => {
    if (activityType === "nettoyage" && nettProduct) {
      setProductId(nettProduct.id);
      customFetch<{ suggestion: string }>(
        `/api/production-entries/next-batch-number?productId=${encodeURIComponent(nettProduct.id)}`,
      )
        .then((d) => {
          setBatchNumber("NT" + d.suggestion);
          setBatchSuggested(true);
        })
        .catch(() => {});
    } else if (activityType === "production") {
      setProductId("");
      setBatchNumber("");
      setBatchSuggested(false);
    }
  }, [activityType, nettProduct?.id]);

  const mode = SHIFT_MODES[shiftMode];
  const poste = mode.postes[posteIdx];

  async function handleStart() {
    if (activityType === "production") {
      if (!productId) {
        setError("Sélectionner un produit");
        return;
      }
      if (!batchNumber.trim()) {
        setError("Saisir un numéro de lot");
        return;
      }
    } else {
      if (!nettProduct) {
        setError("Produit Nettoyage introuvable — contactez l'administrateur");
        return;
      }
    }
    setError("");
    try {
      const result = await createEntry.mutateAsync({
        data: {
          date: today,
          equipmentId,
          productId: activityType === "nettoyage" ? nettProduct!.id : productId,
          presentationId: activityType === "production" && presentationId ? presentationId : null,
          batchNumber:
            batchNumber.trim() ||
            (activityType === "nettoyage" ? `NT${today.replace(/-/g, "")}` : ""),
          shift: poste.shift,
          shiftStart: poste.start,
          shiftEnd: poste.end,
          quantityProduced: 0,
          quantityConforming: 0,
          quantityRejected: 0,
        },
      });
      qc.invalidateQueries({
        queryKey: getListProductionEntriesQueryKey({ dateFrom: today, dateTo: today }),
      });
      onStarted(result.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel} className="h-10 w-10">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">
            {activityType === "nettoyage" ? "Démarrer un nettoyage" : "Démarrer un lot"}
          </h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Type d'activité */}
        <div className="space-y-2">
          <Label>Type d'activité</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActivityType("production")}
              className={cn(
                "p-3 rounded-xl border text-sm font-medium transition-colors flex items-center gap-2 justify-center",
                activityType === "production"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50",
              )}
            >
              <PackageOpen className="h-4 w-4 shrink-0" /> Production
              {activityType === "production" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />
              )}
            </button>
            <button
              onClick={() => setActivityType("nettoyage")}
              className={cn(
                "p-3 rounded-xl border text-sm font-medium transition-colors flex items-center gap-2 justify-center",
                activityType === "nettoyage"
                  ? "border-cyan-500 bg-cyan-500/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-cyan-500/50",
              )}
            >
              <Droplets className="h-4 w-4 shrink-0" /> Nettoyage
              {activityType === "nettoyage" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-500 ml-auto" />
              )}
            </button>
          </div>
        </div>

        {activityType === "nettoyage" && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 flex items-start gap-3 text-sm">
            <Droplets className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-cyan-300">Nettoyage / CIP</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Lot auto :{" "}
                <span className="font-mono text-foreground">{batchNumber || "génération…"}</span>
                {batchSuggested && (
                  <span className="text-cyan-400 ml-1">· suggéré automatiquement</span>
                )}
              </div>
            </div>
          </div>
        )}

        {activityType === "production" && (
          <>
            <div className="space-y-2">
              <Label>Produit</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? [])
                    .filter((p) => p.isActive !== false && (p as { code?: string }).code !== "NETT")
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id} className="py-3">
                        [{(p as { code?: string }).code}] {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {productPresentations.length >= 2 && (
              <div className="space-y-2">
                <Label>Présentation</Label>
                <Select value={presentationId} onValueChange={setPresentationId}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Sélectionner la présentation…" />
                  </SelectTrigger>
                  <SelectContent>
                    {productPresentations.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="py-3">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Détermine la cadence appliquée pour ce lot.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Numéro de lot
                {batchSuggested && (
                  <span className="text-xs text-sky-400 font-normal">
                    · suggéré automatiquement
                  </span>
                )}
              </Label>
              <Input
                value={batchNumber}
                onChange={(e) => {
                  setBatchNumber(e.target.value);
                  setBatchSuggested(false);
                }}
                className="h-12 text-base font-mono tracking-widest"
                placeholder={`Ex: ${new Date().getFullYear().toString().slice(-2)}001`}
              />
              <p className="text-xs text-muted-foreground">
                Format AAXXX — {new Date().getFullYear().toString().slice(-2)}001,{" "}
                {new Date().getFullYear().toString().slice(-2)}002, …
              </p>
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label>Horaire de travail</Label>
          <button
            onClick={() => {
              setShiftMode("standard");
              setPosteIdx(0);
              setShowOtherShifts(false);
            }}
            className={cn(
              "w-full text-left p-3 rounded-xl border text-sm transition-colors flex items-center justify-between",
              shiftMode === "standard"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50",
            )}
          >
            <div>
              <div className="font-medium">Standard</div>
              <div className="text-xs mt-0.5 opacity-70">08:00 – 17:00 · Poste journée</div>
            </div>
            {shiftMode === "standard" && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
          </button>

          <button
            type="button"
            onClick={() => setShowOtherShifts((s) => !s)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 w-full"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showOtherShifts && "rotate-180")}
            />
            Horaires exceptionnels / Ramadan
            {shiftMode !== "standard" && (
              <span className="ml-1 text-xs text-primary font-medium">
                ({SHIFT_MODES[shiftMode].label})
              </span>
            )}
          </button>

          {showOtherShifts && (
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
              {(Object.entries(SHIFT_MODES) as [ShiftMode, (typeof SHIFT_MODES)[ShiftMode]][])
                .filter(([k]) => k !== "standard")
                .map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => {
                      setShiftMode(k);
                      setPosteIdx(0);
                    }}
                    className={cn(
                      "text-left p-3 rounded-lg border text-sm transition-colors",
                      shiftMode === k
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    <div className="font-medium">{v.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">{v.subtitle}</div>
                  </button>
                ))}
            </div>
          )}
        </div>

        {mode.postes.length > 1 && (
          <div className="space-y-2">
            <Label>Poste</Label>
            <div className="flex gap-2">
              {mode.postes.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setPosteIdx(i)}
                  className={cn(
                    "flex-1 p-3 rounded-xl border text-sm font-medium transition-colors",
                    posteIdx === i
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {p.label}
                  <div className="text-xs font-normal mt-0.5">
                    {p.start}–{p.end}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-muted/50 rounded-xl p-3 flex items-center gap-3 text-sm">
          <Gauge className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            Poste: <span className="font-medium text-foreground">{poste.shift}</span>
          </span>
          <span className="text-muted-foreground ml-auto">
            {poste.start}–{poste.end} ({fmtDur(durationMin(poste.start, poste.end))})
          </span>
        </div>

        {activityType === "production" && startCfg.lotSize > 0 && (
          <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-3 flex items-center gap-3 text-sm">
            <PackageOpen className="h-4 w-4 text-sky-400 shrink-0" />
            <span className="font-medium text-sky-400">Taille de lot :</span>
            <span className="text-muted-foreground">
              {startCfg.lotSize.toLocaleString("fr-FR")} {startCfg.unit}
            </span>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
        )}
      </div>

      <Button
        className={cn(
          "w-full h-14 font-bold text-base",
          activityType === "nettoyage" && "bg-cyan-600 hover:bg-cyan-700 text-white",
        )}
        onClick={handleStart}
        disabled={createEntry.isPending}
      >
        {createEntry.isPending ? (
          "Démarrage…"
        ) : activityType === "nettoyage" ? (
          <>
            <Droplets className="h-5 w-5 mr-2" /> Démarrer nettoyage
          </>
        ) : (
          <>
            <Play className="h-5 w-5 mr-2" /> Démarrer le lot
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Session View (cycle complet du local) ────────────────────────────────────
function SessionView({
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

// ─── Local Picker ──────────────────────────────────────────────────────────────
function LocalPicker({ onSelect }: { onSelect: (room: Room) => void }) {
  const { data: rooms, isLoading } = useListRooms();
  const today = new Date().toISOString().split("T")[0];
  const { data: entries } = useListProductionEntries({ dateFrom: today, dateTo: today });

  const activeEquipIds = useMemo(
    () => new Set((entries ?? []).filter((e) => e.status === "draft").map((e) => e.equipmentId)),
    [entries],
  );

  const productionRooms = useMemo(
    () => (rooms ?? []).filter((r) => r.equipments.length > 0),
    [rooms],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Chargement des locaux…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Sélectionner un local</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {productionRooms.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-medium text-muted-foreground">Aucun local disponible</p>
          <p className="text-sm text-muted-foreground mt-1">
            Contactez l'administrateur pour configurer les locaux.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {productionRooms.map((room) => {
            const hasActive = room.equipments.some((e) => activeEquipIds.has(e.id));
            return (
              <button
                key={room.id}
                onClick={() => onSelect(room)}
                className={cn(
                  "w-full text-left rounded-2xl border p-4 transition-all hover:border-primary/60 hover:bg-primary/5 group",
                  hasActive ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        hasActive ? "bg-amber-500/20" : "bg-muted",
                      )}
                    >
                      <Building2
                        className={cn(
                          "h-5 w-5",
                          hasActive ? "text-amber-400" : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        <span className="font-mono text-muted-foreground text-xs">{room.code}</span>
                        <span className="truncate">{room.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {room.equipments.length} équipement
                        {room.equipments.length > 1 ? "s" : ""}
                        {room.equipments.map((e) => ` · ${e.code}`).join("")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasActive && (
                      <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
                        En cours
                      </span>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Machine Picker ────────────────────────────────────────────────────────────
function MachinePicker({
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
        <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Sélectionner une machine</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{room.code}</span> — {room.name}
          </p>
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

// ─── Legacy List View (kept for supervisor/admin browsing) ────────────────────
function LotListView({ onNew, onResume }: { onNew: () => void; onResume: (id: string) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const { data: entries, isLoading } = useListProductionEntries({ dateFrom: today, dateTo: today });

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

// ─── Entry Page Root ──────────────────────────────────────────────────────────
type EntryView = "list" | "local" | "machine" | "session" | "active-lot";

export default function EntryPage() {
  const [view, setView] = useState<EntryView>("list");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<{
    id: string;
    code: string;
    name: string;
  } | null>(null);
  const [resumeLotId, setResumeLotId] = useState<string | null>(null);

  // Resume a lot directly (from list view)
  if (view === "active-lot" && resumeLotId) {
    return (
      <LotActiveTracker
        lotId={resumeLotId}
        onClosed={() => {
          setResumeLotId(null);
          setView("list");
        }}
        onBack={() => {
          setResumeLotId(null);
          setView("list");
        }}
      />
    );
  }

  // New operator cycle flow
  if (view === "local") {
    return (
      <LocalPicker
        onSelect={(room) => {
          setSelectedRoom(room);
          setView("machine");
        }}
      />
    );
  }

  if (view === "machine" && selectedRoom) {
    return (
      <MachinePicker
        room={selectedRoom}
        onSelect={(eq) => {
          setSelectedEquipment(eq);
          setView("session");
        }}
        onBack={() => setView("local")}
      />
    );
  }

  if (view === "session" && selectedRoom && selectedEquipment) {
    return (
      <SessionView
        room={selectedRoom}
        equipment={selectedEquipment}
        onExit={() => {
          setSelectedRoom(null);
          setSelectedEquipment(null);
          setView("list");
        }}
      />
    );
  }

  return (
    <LotListView
      onNew={() => setView("local")}
      onResume={(id) => {
        setResumeLotId(id);
        setView("active-lot");
      }}
    />
  );
}
