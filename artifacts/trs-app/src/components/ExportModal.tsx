import { useState } from "react";
import { Download, FileSpreadsheet, X, Calendar, Settings2, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Equipment {
  id: string;
  name: string;
  code: string;
}

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipments?: Equipment[];
}

type ExportFormat = "complete" | "direction" | "technical" | "rawdata";
type PeriodPreset = "today" | "week" | "month" | "custom";

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string; badge?: string }[] = [
  { value: "complete",   label: "Rapport complet",         description: "8 feuilles : Synthèse, TRS, Planning, Arrêts, Pareto, Statut, Sources, Paramètres", badge: "Recommandé" },
  { value: "direction",  label: "Rapport direction",       description: "Synthèse KPI uniquement — 1 feuille claire pour la direction" },
  { value: "technical",  label: "Rapport technique",       description: "Dashboard TRS + Arrêts + Pareto + Statut équipements" },
  { value: "rawdata",    label: "Données brutes",          description: "Export CSV-style des entrées validées + paramètres" },
];
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function getISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getPeriodDates(preset: PeriodPreset, customFrom: string, customTo: string) {
  const today = new Date();
  switch (preset) {
    case "today":
      return { from: getISODate(today), to: getISODate(today) };
    case "week": {
      const mon = new Date(today);
      mon.setDate(today.getDate() - today.getDay() + 1);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { from: getISODate(mon), to: getISODate(sun) };
    }
    case "month": {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: getISODate(firstDay), to: getISODate(lastDay) };
    }
    case "custom":
      return { from: customFrom, to: customTo };
  }
}

export default function ExportModal({ open, onOpenChange, equipments = [] }: ExportModalProps) {
  const [periodPreset, setPeriodPreset]     = useState<PeriodPreset>("month");
  const [customFrom, setCustomFrom]         = useState(getISODate(new Date()));
  const [customTo, setCustomTo]             = useState(getISODate(new Date()));
  const [equipmentId, setEquipmentId]       = useState<string>("all");
  const [format, setFormat]                 = useState<ExportFormat>("complete");
  const [withFormulas, setWithFormulas]     = useState(true);
  const [withProtection, setWithProtection] = useState(false);
  const [sourceVisible, setSourceVisible]   = useState(true);
  const [status, setStatus]                 = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg]             = useState("");

  const { from, to } = getPeriodDates(periodPreset, customFrom, customTo);

  async function handleExport() {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/reports/export`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          equipmentId: equipmentId === "all" ? undefined : equipmentId,
          format,
          withFormulas,
          withProtection,
          sourceSheetVisible: sourceVisible,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(err.error ?? "Erreur lors de la génération du rapport");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `rapport_TRS_${from}_${to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inconnue");
      setStatus("error");
    }
  }

  const PERIODS: { value: PeriodPreset; label: string }[] = [
    { value: "today",  label: "Aujourd'hui" },
    { value: "week",   label: "Cette semaine" },
    { value: "month",  label: "Ce mois" },
    { value: "custom", label: "Plage personnalisée" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-green-500" />
            Exporter rapport Excel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">

          {/* ── Période ── */}
          <section>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Période
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriodPreset(p.value)}
                  className={cn(
                    "px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                    periodPreset === p.value
                      ? "bg-sky-500 text-white border-sky-500"
                      : "border-border hover:bg-muted text-muted-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodPreset === "custom" && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Du</Label>
                  <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Au</Label>
                  <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-10" />
                </div>
              </div>
            )}
            {periodPreset !== "custom" && (
              <p className="text-xs text-muted-foreground mt-2">
                Période : <span className="font-mono font-medium">{from}</span> → <span className="font-mono font-medium">{to}</span>
              </p>
            )}
          </section>

          {/* ── Équipement ── */}
          <section>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Équipement</Label>
            <Select value={equipmentId} onValueChange={setEquipmentId}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="py-3">Tous les équipements</SelectItem>
                {equipments.map(e => (
                  <SelectItem key={e.id} value={e.id} className="py-3">
                    <span className="font-mono text-xs mr-2 text-muted-foreground">{e.code}</span>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* ── Format ── */}
          <section>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 block">Format du rapport</Label>
            <div className="space-y-2">
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl border transition-all",
                    format === opt.value
                      ? "border-sky-500 bg-sky-500/10"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm">{opt.label}</span>
                    {opt.badge && (
                      <Badge className="bg-green-500/20 text-green-400 text-xs px-1.5 py-0">{opt.badge}</Badge>
                    )}
                    {format === opt.value && (
                      <CheckCircle className="h-3.5 w-3.5 text-sky-500 ml-auto" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* ── Options ── */}
          <section>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Options
            </Label>
            <div className="space-y-3">
              {[
                { id: "formulas",    label: "Formules Excel actives", desc: "DO, TP, TQ, TRS, TRG, TRE sont des formules Excel (recalculables)", val: withFormulas,    set: setWithFormulas },
                { id: "protection",  label: "Protéger les feuilles",  desc: "Les cellules de formules sont verrouillées (mot de passe : DPI-TRS-2025)", val: withProtection, set: setWithProtection },
                { id: "source",      label: "Feuille sources visible", desc: "Afficher l'onglet 'Données Sources' (masqué par défaut en mode direction)", val: sourceVisible,  set: setSourceVisible },
              ].map(opt => (
                <div key={opt.id} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  <Switch checked={opt.val} onCheckedChange={opt.set} className="mt-0.5 shrink-0" />
                </div>
              ))}
            </div>
          </section>

          {/* ── Error ── */}
          {status === "error" && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-red-400">{errorMsg}</p>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1.5" /> Annuler
            </Button>
            <Button
              className="h-11 flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold gap-2"
              onClick={handleExport}
              disabled={status === "loading"}
            >
              {status === "loading" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Génération...</>
              ) : status === "done" ? (
                <><CheckCircle className="h-4 w-4" /> Téléchargé !</>
              ) : (
                <><Download className="h-4 w-4" /> Exporter .xlsx</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
