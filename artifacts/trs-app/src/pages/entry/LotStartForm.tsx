import { useState, useEffect, useMemo } from "react";
import {
  useListProducts,
  useListEquipments,
  useCreateProductionEntry,
  getListProductionEntriesQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  Gauge,
  PackageOpen,
  Droplets,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ShiftMode } from "./types";
import { SHIFT_MODES, EQUIP_CFG, DEFAULT_CFG } from "./constants";
import { durationMin, fmtDur } from "./utils";

export function LotStartForm({
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
