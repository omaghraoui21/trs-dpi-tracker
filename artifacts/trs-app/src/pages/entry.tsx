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
} from "@workspace/api-client-react";
import type { ProductionEntryWithDetails } from "@workspace/api-client-react";
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

// Raccourcis arrêts par équipement (codes catégories)
const QUICK_DT_CODES: Record<string, string[]> = {
  A27: ["AG", "ALIM_GEL", "NET_MIN_EQ", "CHSG"],
  A28: ["AB", "CHG_ALU", "CHG_PVC", "NET_MIN_EQ"],
};
const FALLBACK_DT_CODES = ["ATTENTE-MAT", "NET_MIN_EQ", "PAUSE", "CHSG"];

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
// mode: "live" = start live arrêt | number = micro-arrêt with preset minutes
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
  onConfirmMicro: (categoryId: string, minutes: number, endTime: string) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [customMin, setCustomMin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setCategoryId("");
      setCustomMin("");
      setError("");
    }
  }, [open]);

  const effectiveMin =
    mode === "live" ? null : typeof mode === "number" ? mode : parseInt(customMin, 10) || null;
  const isMicro = mode !== "live";

  async function handleConfirm() {
    if (!categoryId) {
      setError("Veuillez sélectionner une catégorie");
      return;
    }
    if (isMicro && (!effectiveMin || effectiveMin <= 0)) {
      setError("Durée invalide");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (!isMicro) {
        await onConfirmLive(categoryId);
      } else {
        const now = nowHHMM();
        const startMin = timeToMin(now) - effectiveMin!;
        const startHH = Math.floor((((startMin % 1440) + 1440) % 1440) / 60);
        const startMM = (((startMin % 1440) + 1440) % 1440) % 60;
        const startTime = `${String(startHH).padStart(2, "0")}:${String(startMM).padStart(2, "0")}`;
        await onConfirmMicro(categoryId, effectiveMin!, startTime);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isMicro
              ? `Micro-arrêt${typeof mode === "number" ? ` (${mode} min)` : ""}`
              : "Démarrer un arrêt"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Catégorie d'arrêt</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="py-3">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          c.isPlanned ? "bg-blue-500" : "bg-red-500",
                        )}
                      />
                      [{c.code}] {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isMicro && typeof mode !== "number" && (
            <div className="space-y-2">
              <Label>Durée (minutes)</Label>
              <Input
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value)}
                type="number"
                min={1}
                max={60}
                placeholder="Ex: 8"
                className="h-11"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !categoryId}>
            {loading ? "…" : isMicro ? "Enregistrer" : "Démarrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lot Active Tracker ───────────────────────────────────────────────────────
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
      setIsPauseTime(mins >= 720 && mins < 780); // 12:00–13:00
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

  const currentCadence = useMemo(() => {
    return cadenceChanges.length > 0
      ? cadenceChanges[cadenceChanges.length - 1].value
      : baseCadence;
  }, [baseCadence, cadenceChanges]);

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

        {/* Cadence change history chip */}
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

        {/* Quick add buttons — adaptive per equipment */}
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

        {/* Produced / Conforming inputs */}
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

        {/* Lot progress bar */}
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

        {/* Action buttons */}
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

        {/* Raccourcis catégories pré-programmées */}
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

        {/* Closed arrêts list */}
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

      {/* Clôturer lot */}
      <Button
        className="w-full h-14 bg-green-600 hover:bg-green-500 text-white font-bold text-base"
        onClick={() => setShowCloture(true)}
        disabled={!!openDowntime}
      >
        <CheckCircle2 className="h-5 w-5 mr-2" />
        Clôturer le lot
      </Button>

      {/* Arrêt Modal */}
      <ArrêtModal
        open={arrêtModal !== null}
        mode={arrêtModal}
        categories={categories}
        onClose={() => setArrêtModal(null)}
        onConfirmLive={startArrêt}
        onConfirmMicro={addMicroArrêt}
      />

      {/* Cadence Change Modal */}
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

      {/* Quick Downtime Modal */}
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

      {/* Clôturer Confirmation */}
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

// ─── Lot Start Form ───────────────────────────────────────────────────────────
function LotStartForm({
  onStarted,
  onCancel,
}: {
  onStarted: (id: string) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [activityType, setActivityType] = useState<"production" | "nettoyage">("production");
  const [equipmentId, setEquipmentId] = useState("");
  const [productId, setProductId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [batchSuggested, setBatchSuggested] = useState(false);
  const [shiftMode, setShiftMode] = useState<ShiftMode>("standard");
  const [posteIdx, setPosteIdx] = useState(0);
  const [showOtherShifts, setShowOtherShifts] = useState(false);
  const [error, setError] = useState("");

  const { data: equipments } = useListEquipments();
  const { data: products } = useListProducts();
  const createEntry = useCreateProductionEntry();
  const qc = useQueryClient();

  const nettProduct = useMemo(
    () => (products ?? []).find((p) => (p as { code?: string }).code === "NETT"),
    [products],
  );

  // Auto-set productId and fetch batch suggestion when productId changes (production mode)
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

  // When switching to nettoyage: auto-assign NETT product and fetch batch suggestion
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

  const equipCode = useMemo(() => {
    const eq = (equipments ?? []).find((e) => e.id === equipmentId);
    return (eq as { code?: string } | undefined)?.code ?? "";
  }, [equipments, equipmentId]);
  const startCfg = useMemo(() => EQUIP_CFG[equipCode] ?? DEFAULT_CFG, [equipCode]);

  const mode = SHIFT_MODES[shiftMode];
  const poste = mode.postes[posteIdx];

  async function handleStart() {
    if (!equipmentId) {
      setError("Sélectionner un équipement");
      return;
    }
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

        {/* Bannière info nettoyage */}
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

        <div className="space-y-2">
          <Label>Équipement</Label>
          <Select value={equipmentId} onValueChange={setEquipmentId}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {(equipments ?? [])
                .filter((e) => e.isActive !== false)
                .map((e) => (
                  <SelectItem key={e.id} value={e.id} className="py-3">
                    [{e.code}] {e.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Produit + lot — masqués en mode nettoyage */}
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
          {/* Standard — affiché en premier */}
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

          {/* Autres horaires — collapsible */}
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

// ─── Lot List View ────────────────────────────────────────────────────────────
function LotListView({ onNew, onResume }: { onNew: () => void; onResume: (id: string) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const { data: entries, isLoading } = useListProductionEntries({ dateFrom: today, dateTo: today });

  const active = useMemo(() => (entries ?? []).filter((e) => e.status === "draft"), [entries]);
  const closed = useMemo(() => (entries ?? []).filter((e) => e.status !== "draft"), [entries]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Lot en cours</h1>
          <p className="text-sm text-muted-foreground">Aujourd'hui · {today}</p>
        </div>
        <Button className="h-12 px-5 font-semibold gap-2" onClick={onNew}>
          <Plus className="h-5 w-5" /> Nouveau lot
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
          <p className="font-medium text-muted-foreground">Aucun lot aujourd'hui</p>
          <p className="text-sm text-muted-foreground mt-1">
            Cliquez sur "Nouveau lot" pour commencer
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Entry Page Root ──────────────────────────────────────────────────────────
export default function EntryPage() {
  const [view, setView] = useState<"list" | "start" | "active">("list");
  const [activeLotId, setActiveLotId] = useState<string | null>(null);

  if (view === "start") {
    return (
      <LotStartForm
        onStarted={(id) => {
          setActiveLotId(id);
          setView("active");
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "active" && activeLotId) {
    return (
      <LotActiveTracker
        lotId={activeLotId}
        onClosed={() => {
          setActiveLotId(null);
          setView("list");
        }}
        onBack={() => setView("list")}
      />
    );
  }

  return (
    <LotListView
      onNew={() => setView("start")}
      onResume={(id) => {
        setActiveLotId(id);
        setView("active");
      }}
    />
  );
}
