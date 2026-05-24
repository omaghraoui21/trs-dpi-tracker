import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  useListEquipments,
  useListDowntimeCategories,
  useListCadences,
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
  X,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  Gauge,
  Edit3,
  AlarmClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { DowntimeEvent } from "./types";
import { EQUIP_CFG, DEFAULT_CFG } from "./constants";
import {
  durationMin,
  nowHHMM,
  fmtSeconds,
  fmtDur,
  trsHex,
  fmtCadence,
  computeWeightedCadence,
  computeTrs,
} from "./utils";
import { ArrêtModal } from "./ArretModal";

export function LotActiveTracker({
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
        famille: (c as unknown as { famille?: string | null }).famille ?? null,
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

  const closedDt = downtimes.filter((d) => d.status === "closed");
  const totalArrêtMin = closedDt.reduce((s, d) => s + d.durationMinutes, 0);

  const clotureWarnings = useMemo(() => {
    const w: string[] = [];
    if (!entry?.shiftStart || !entry?.shiftEnd) {
      w.push("Horaire de poste manquant — TRS ne sera pas calculé.");
    } else {
      const dur = durationMin(entry.shiftStart, entry.shiftEnd);
      if (totalArrêtMin > dur) {
        w.push(`Arrêts (${totalArrêtMin} min) dépassent la durée du poste (${dur} min).`);
      }
    }
    if (conforming > produced) {
      w.push(`Conforme (${conforming}) > Produit total (${produced}).`);
    }
    if (produced === 0) {
      w.push("Quantité produite nulle.");
    }
    if (baseCadence <= 0) {
      w.push("Aucune cadence validée — TRS ne sera pas calculé.");
    }
    return w;
  }, [entry, produced, conforming, totalArrêtMin, baseCadence]);

  if (!entry) {
    return <div className="p-8 text-center text-muted-foreground">Chargement du lot…</div>;
  }

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
            {clotureWarnings.length > 0 && (
              <div className="space-y-1 mt-2">
                {clotureWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-500 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
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
