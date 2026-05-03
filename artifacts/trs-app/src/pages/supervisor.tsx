import { useState, useMemo } from "react";
import {
  useGetDashboardSummary,
  useGetDailyTrs,
  useGetDowntimePareto,
  useGetEquipmentComparison,
  useGetMonthlyKpis,
  useGetPendingValidations,
  useValidateProductionEntry,
  useListEquipments,
  getGetDashboardSummaryQueryKey,
  getGetPendingValidationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import {
  CheckCircle, Clock, TrendingUp, Zap, Target, AlertTriangle,
  ChevronDown, ChevronUp, FileSpreadsheet, Info, Eye, Pencil, Save, X,
  User, Calendar, Timer, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ExportModal from "@/components/ExportModal";

// ─── API helper ──────────────────────────────────────────
function getToken() { return localStorage.getItem("auth_token") ?? ""; }
async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Constants ───────────────────────────────────────────
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

// ─── Utilities ───────────────────────────────────────────
function trsColor(trs: number | null | undefined) {
  if (trs === null || trs === undefined) return "#6b7280";
  if (trs >= 75) return "#22c55e";
  if (trs >= 55) return "#f97316";
  return "#ef4444";
}

function trsLabel(trs: number | null | undefined) {
  if (trs === null || trs === undefined) return "N/A";
  return `${trs.toFixed(1)}%`;
}

function fmtDur(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

// ─── Shared sub-components ────────────────────────────────
function KpiCard({ label, value, target, color }: { label: string; value: number | null; target?: number; color?: string }) {
  const c = color || trsColor(value);
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className="text-3xl font-bold leading-tight" style={{ color: c }}>
        {value !== null && value !== undefined ? `${value.toFixed(1)}%` : "—"}
      </span>
      {target !== undefined && (
        <span className="text-xs text-muted-foreground">Objectif: {target}%</span>
      )}
    </div>
  );
}

function GaugeBar({ label, value, subtitle }: { label: string; value: number | null; subtitle?: string }) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-bold" style={{ color: trsColor(value) }}>{trsLabel(value)}</span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: trsColor(value) }} />
      </div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
    </div>
  );
}

function LossBar({ label, minutes, totalRef, color }: { label: string; minutes: number; totalRef: number; color: string }) {
  const pct = totalRef > 0 ? Math.min(100, (minutes / totalRef) * 100) : 0;
  if (minutes <= 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
          <span className="text-muted-foreground">{label}</span>
        </div>
        <span className="font-medium tabular-nums">{pct.toFixed(1)}% · {Math.round(minutes)} min</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────
type DowntimeEvent = {
  id: string;
  categoryCode: string | null;
  categoryLabel: string | null;
  categoryIsPlanned: boolean | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  comment: string | null;
};

type PendingEntry = {
  id: string;
  date: string;
  equipmentId?: string | null;
  equipmentName?: string | null;
  productName?: string | null;
  operatorName?: string | null;
  batchNumber?: string;
  shift?: string;
  shiftStart?: string;
  shiftEnd?: string;
  quantityProduced?: number;
  quantityConforming?: number;
  quantityRejected?: number;
  supervisorComment?: string | null;
  status?: string;
  trsMetrics?: { TRS: number; TRG: number; DO: number; TP: number; TQ: number; tO: number; tR: number; tF: number; tN: number; tU: number };
  downtimeEvents?: DowntimeEvent[];
};

// ─── Fiche Lot Modal ──────────────────────────────────────
function LotFicheModal({
  entry: initialEntry,
  onClose,
  onAction,
}: {
  entry: PendingEntry;
  onClose: () => void;
  onAction: (id: string, action: "validate" | "reject", comment?: string) => void;
}) {
  const [entry, setEntry] = useState(initialEntry);

  // Quantities edit
  const [editingQty, setEditingQty] = useState(false);
  const [qtyProduced, setQtyProduced] = useState(String(entry.quantityProduced ?? 0));
  const [qtyConforming, setQtyConforming] = useState(String(entry.quantityConforming ?? 0));
  const [savingQty, setSavingQty] = useState(false);
  const [qtyError, setQtyError] = useState("");

  // Downtime comment edit
  const [editingDtId, setEditingDtId] = useState<string | null>(null);
  const [dtComment, setDtComment] = useState("");
  const [savingDt, setSavingDt] = useState(false);

  // Anomaly
  const [anomalyOpen, setAnomalyOpen] = useState(false);
  const [anomalyComment, setAnomalyComment] = useState(entry.supervisorComment ?? "");

  const dt = entry.downtimeEvents ?? [];
  const totalDtMin = dt.reduce((s, d) => s + d.durationMinutes, 0);
  const trs = entry.trsMetrics;

  async function saveQty() {
    const produced = parseInt(qtyProduced);
    const conforming = parseInt(qtyConforming);
    if (isNaN(produced) || isNaN(conforming)) { setQtyError("Valeurs invalides"); return; }
    if (conforming > produced) { setQtyError("Conforme > Produit total"); return; }
    setQtyError("");
    setSavingQty(true);
    try {
      await apiFetch(`/production-entries/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantityProduced: produced, quantityConforming: conforming, quantityRejected: produced - conforming }),
      });
      setEntry(e => ({ ...e, quantityProduced: produced, quantityConforming: conforming, quantityRejected: produced - conforming }));
      setEditingQty(false);
    } catch (e) {
      setQtyError(String(e));
    } finally {
      setSavingQty(false);
    }
  }

  function startEditDt(d: DowntimeEvent) {
    setEditingDtId(d.id);
    setDtComment(d.comment ?? "");
  }

  async function saveDtComment() {
    if (!editingDtId) return;
    setSavingDt(true);
    try {
      await apiFetch(`/downtime-events/${editingDtId}`, {
        method: "PATCH",
        body: JSON.stringify({ comment: dtComment }),
      });
      setEntry(e => ({
        ...e,
        downtimeEvents: (e.downtimeEvents ?? []).map(d =>
          d.id === editingDtId ? { ...d, comment: dtComment } : d
        ),
      }));
      setEditingDtId(null);
    } finally {
      setSavingDt(false);
    }
  }

  const statusMap: Record<string, { label: string; cls: string }> = {
    submitted: { label: "Clôturé", cls: "bg-sky-500/15 text-sky-400" },
    validated: { label: "Revu ✓", cls: "bg-green-500/15 text-green-400" },
    rejected:  { label: "Anomalie", cls: "bg-orange-500/15 text-orange-400" },
    draft:     { label: "En cours", cls: "bg-muted text-muted-foreground" },
  };
  const statusInfo = statusMap[entry.status ?? ""] ?? { label: entry.status ?? "", cls: "bg-muted text-muted-foreground" };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Fiche lot · {entry.batchNumber ?? "—"}</h2>
              <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", statusInfo.cls)}>
                {statusInfo.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{entry.date} · {entry.equipmentName ?? "?"}</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors shrink-0 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* ── Info lot ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: <Package className="h-3.5 w-3.5" />, label: "Produit", value: entry.productName ?? "—" },
              { icon: <Calendar className="h-3.5 w-3.5" />, label: "Date", value: entry.date },
              { icon: <User className="h-3.5 w-3.5" />, label: "Opérateur", value: entry.operatorName ?? "—" },
              { icon: <Timer className="h-3.5 w-3.5" />, label: "Horaire", value: entry.shiftStart && entry.shiftEnd ? `${entry.shiftStart} – ${entry.shiftEnd}` : entry.shift ?? "—" },
              { icon: <Zap className="h-3.5 w-3.5" />, label: "Poste", value: entry.shift ?? "—" },
              { icon: <Clock className="h-3.5 w-3.5" />, label: "Arrêts total", value: totalDtMin > 0 ? fmtDur(totalDtMin) : "—" },
            ].map(({ icon, label, value }) => (
              <div key={label} className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                  {icon} {label}
                </div>
                <div className="text-sm font-semibold truncate">{value}</div>
              </div>
            ))}
          </div>

          {/* ── TRS KPIs ── */}
          {trs && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">TRS / TRG</p>
              <div className="grid grid-cols-5 gap-2 mb-2">
                {[
                  { label: "TRS", v: trs.TRS * 100, sub: "tU/tR" },
                  { label: "TRG", v: trs.TRG * 100, sub: "tU/tO" },
                  { label: "DO",  v: trs.DO  * 100, sub: "tF/tR" },
                  { label: "TP",  v: trs.TP  * 100, sub: "tN/tF" },
                  { label: "TQ",  v: trs.TQ  * 100, sub: "tU/tN" },
                ].map(({ label, v, sub }) => (
                  <div key={label} className="border border-border rounded-xl p-3 text-center bg-card">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-xl font-bold mt-0.5" style={{ color: trsColor(v) }}>
                      {v.toFixed(1)}%
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 mt-0.5">{sub}</div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground text-center">
                tO = {trs.tO} min — TO calculé automatiquement depuis l'horaire poste
              </div>
            </div>
          )}

          {/* ── Quantités ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantités</p>
              {!editingQty ? (
                <button
                  onClick={() => setEditingQty(true)}
                  className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <Pencil className="h-3 w-3" /> Modifier
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditingQty(false); setQtyError(""); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Annuler
                  </button>
                  <Button size="sm" onClick={saveQty} disabled={savingQty} className="h-7 text-xs px-3">
                    <Save className="h-3 w-3 mr-1" /> Enregistrer
                  </Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Produit (total)", key: "produced", value: entry.quantityProduced ?? 0, edit: qtyProduced, setter: setQtyProduced },
                { label: "Conforme", key: "conforming", value: entry.quantityConforming ?? 0, edit: qtyConforming, setter: setQtyConforming },
                { label: "Rebuté", key: "rejected", value: editingQty ? (parseInt(qtyProduced) || 0) - (parseInt(qtyConforming) || 0) : (entry.quantityRejected ?? 0), edit: null, setter: null },
              ].map(({ label, key, value, edit, setter }) => (
                <div key={key} className="bg-muted/30 rounded-lg p-3">
                  <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
                  {editingQty && setter ? (
                    <Input
                      type="number" min={0}
                      value={edit ?? ""}
                      onChange={e => setter(e.target.value)}
                      className="h-8 text-sm font-semibold"
                    />
                  ) : (
                    <div className={cn("text-lg font-bold", key === "rejected" && value > 0 ? "text-red-400" : "")}>
                      {value.toLocaleString("fr-FR")}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {qtyError && <p className="text-xs text-red-400 mt-1.5">{qtyError}</p>}
          </div>

          {/* ── Arrêts ── */}
          {dt.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Arrêts ({dt.length}) · {fmtDur(totalDtMin)} total
              </p>
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Horaire</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Durée</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Commentaire</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dt.map((d, i) => (
                      <tr key={d.id} className={cn("border-b border-border last:border-0", i % 2 === 0 ? "" : "bg-muted/10")}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
                              d.categoryIsPlanned ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"
                            )}>
                              {d.categoryIsPlanned ? "P" : "NP"}
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium truncate text-xs">{d.categoryCode ?? "?"}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{d.categoryLabel}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {d.startTime} → {d.endTime}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold whitespace-nowrap">
                          {fmtDur(d.durationMinutes)}
                        </td>
                        <td className="px-3 py-2.5 max-w-[160px]">
                          {editingDtId === d.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={dtComment}
                                onChange={e => setDtComment(e.target.value)}
                                className="h-7 text-xs flex-1"
                                placeholder="Commentaire…"
                                autoFocus
                              />
                              <button onClick={saveDtComment} disabled={savingDt} className="text-green-400 hover:text-green-300 shrink-0">
                                <Save className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setEditingDtId(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditDt(d)}
                              className="flex items-center gap-1 group w-full text-left"
                            >
                              <span className={cn("text-xs truncate flex-1", d.comment ? "text-foreground" : "text-muted-foreground/40 italic")}>
                                {d.comment ?? "Ajouter…"}
                              </span>
                              <Pencil className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/60 inline-block" /> Planifié</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/60 inline-block" /> Non planifié</span>
              </div>
            </div>
          )}

          {/* ── Anomalie superviseur ── */}
          {entry.supervisorComment && (
            <div className="border border-orange-500/30 bg-orange-500/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1.5 text-orange-400 text-xs font-semibold uppercase tracking-wide">
                <AlertTriangle className="h-4 w-4" /> Anomalie signalée
              </div>
              <p className="text-sm">{entry.supervisorComment}</p>
            </div>
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex gap-3">
          <Button
            className="bg-green-600 hover:bg-green-500 text-white flex-1 h-11 text-sm font-semibold"
            onClick={() => { onAction(entry.id, "validate"); onClose(); }}
          >
            <CheckCircle className="h-4 w-4 mr-2" /> Marquer revu
          </Button>
          <Button
            variant="outline"
            className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10 flex-1 h-11 text-sm font-semibold"
            onClick={() => setAnomalyOpen(true)}
          >
            <AlertTriangle className="h-4 w-4 mr-2" /> Signaler anomalie
          </Button>
        </div>

        {/* ── Anomaly dialog ── */}
        <Dialog open={anomalyOpen} onOpenChange={setAnomalyOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Anomalie observée</DialogTitle></DialogHeader>
            <div className="py-2 space-y-2">
              <Label>Description (obligatoire)</Label>
              <Textarea
                value={anomalyComment}
                onChange={e => setAnomalyComment(e.target.value)}
                placeholder="Décrivez l'anomalie ou la correction à apporter…"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAnomalyOpen(false)}>Annuler</Button>
              <Button
                className="bg-orange-600 hover:bg-orange-500 text-white"
                disabled={!anomalyComment.trim()}
                onClick={() => { onAction(entry.id, "reject", anomalyComment); setAnomalyOpen(false); onClose(); }}
              >
                Confirmer l'anomalie
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

// ─── PendingCard ──────────────────────────────────────────
function PendingCard({
  entry,
  onAction,
  onOpenFiche,
}: {
  entry: PendingEntry;
  onAction: (id: string, action: "validate" | "reject", comment?: string) => void;
  onOpenFiche: (entry: PendingEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [anomalyOpen, setAnomalyOpen] = useState(false);
  const [anomalyComment, setAnomalyComment] = useState("");

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Clock className="h-5 w-5 text-sky-400 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{entry.date} — {entry.equipmentName ?? "?"}</div>
            <div className="text-xs text-muted-foreground truncate">{entry.productName} · Lot {entry.batchNumber} · {entry.shift}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {entry.trsMetrics && (
            <span className="text-sm font-bold" style={{ color: trsColor(entry.trsMetrics.TRS * 100) }}>
              {(entry.trsMetrics.TRS * 100).toFixed(1)}%
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && entry.trsMetrics && (
        <div className="border-t border-border px-4 py-3 bg-muted/30 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: "TRS", v: entry.trsMetrics.TRS, sub: "tU/tR" },
              { label: "TRG", v: entry.trsMetrics.TRG, sub: "tU/tO" },
              { label: "DO",  v: entry.trsMetrics.DO,  sub: "tF/tR" },
              { label: "TP",  v: entry.trsMetrics.TP,  sub: "tN/tF" },
              { label: "TQ",  v: entry.trsMetrics.TQ,  sub: "tU/tN" },
            ].map(({ label, v, sub }) => (
              <div key={label} className="text-center bg-card border border-border rounded-lg py-2 px-1">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-base font-bold" style={{ color: trsColor(v * 100) }}>{(v * 100).toFixed(1)}%</div>
                <div className="text-[9px] text-muted-foreground/60">{sub}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground text-center">
            tO = {entry.trsMetrics.tO} min — TO calculé automatiquement
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-border flex gap-2 px-4 py-3">
        <Button
          variant="outline"
          className="h-10 text-xs font-medium gap-1.5 text-sky-400 border-sky-500/30 hover:bg-sky-500/10"
          onClick={() => onOpenFiche(entry)}
        >
          <Eye className="h-3.5 w-3.5" /> Voir la fiche
        </Button>
        <Button
          className="bg-green-600 hover:bg-green-500 text-white flex-1 h-10 text-xs font-semibold"
          onClick={() => onAction(entry.id, "validate")}
        >
          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Marquer revu
        </Button>
        <Button
          variant="outline"
          className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10 flex-1 h-10 text-xs font-semibold"
          onClick={() => setAnomalyOpen(true)}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Anomalie
        </Button>
      </div>

      <Dialog open={anomalyOpen} onOpenChange={setAnomalyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Anomalie observée</DialogTitle></DialogHeader>
          <div className="py-2 space-y-2">
            <Label>Description (obligatoire)</Label>
            <Textarea value={anomalyComment} onChange={e => setAnomalyComment(e.target.value)} placeholder="Décrivez l'anomalie ou la correction à apporter…" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnomalyOpen(false)}>Annuler</Button>
            <Button className="bg-orange-600 hover:bg-orange-500 text-white" disabled={!anomalyComment.trim()} onClick={() => { onAction(entry.id, "reject", anomalyComment); setAnomalyOpen(false); }}>
              Confirmer l'anomalie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────
export default function SupervisorPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [equipmentId, setEquipmentId] = useState<string | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [paretoTab, setParetoTab] = useState<"detail" | "famille" | "type">("detail");
  const [ficheEntry, setFicheEntry] = useState<PendingEntry | null>(null);
  const qc = useQueryClient();

  const { data: equipments } = useListEquipments();
  const { data: summary } = useGetDashboardSummary({ month, year, equipmentId });
  const { data: dailyTrs } = useGetDailyTrs({ month, year, equipmentId });
  const { data: comparison } = useGetEquipmentComparison({ month, year });
  const { data: monthlyKpis } = useGetMonthlyKpis({ month, year, equipmentId });
  const { data: pending } = useGetPendingValidations();

  const { data: paretoDetail } = useGetDowntimePareto({ month, year, equipmentId, groupBy: "detail" });
  const { data: paretoFamille } = useGetDowntimePareto({ month, year, equipmentId, groupBy: "famille" });
  const { data: paretoType } = useGetDowntimePareto({ month, year, equipmentId, groupBy: "type" });

  const paretoData = paretoTab === "detail" ? paretoDetail : paretoTab === "famille" ? paretoFamille : paretoType;

  const validate = useValidateProductionEntry();

  const handleAction = (id: string, action: "validate" | "reject", comment?: string) => {
    validate.mutate(
      { id, data: { action, comment } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetPendingValidationsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year, equipmentId }) });
        },
      }
    );
  };

  // Triple TRS check
  const doTPTQ = useMemo(() => {
    if (!monthlyKpis?.DO || !monthlyKpis?.TP || !monthlyKpis?.TQ) return null;
    return (monthlyKpis.DO / 100) * (monthlyKpis.TP / 100) * (monthlyKpis.TQ / 100) * 100;
  }, [monthlyKpis]);
  const trsCoherence = useMemo(() => {
    if (monthlyKpis?.trs == null || doTPTQ == null) return null;
    return Math.abs(monthlyKpis.trs - doTPTQ) < 1;
  }, [monthlyKpis?.trs, doTPTQ]);

  // Loss decomposition
  const losses = useMemo(() => {
    if (!monthlyKpis) return null;
    const { totalTR, totalTF, totalTN, totalTU, totalDowntimePlanned, totalDowntimeUnplanned } = monthlyKpis;
    const totalRef = (totalTR ?? 0) + (totalDowntimePlanned ?? 0);
    if (totalRef <= 0) return null;
    return {
      totalRef,
      planned: totalDowntimePlanned ?? 0,
      unplanned: totalDowntimeUnplanned ?? 0,
      perf: Math.max(0, (totalTF ?? 0) - (totalTN ?? 0)),
      quality: Math.max(0, (totalTN ?? 0) - (totalTU ?? 0)),
      useful: totalTU ?? 0,
    };
  }, [monthlyKpis]);

  const years = Array.from({ length: now.getFullYear() - 2024 }, (_, i) => 2025 + i);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto pb-10">
      {/* Header + Filters */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Revue / Corrections</h1>
          <p className="text-sm text-muted-foreground">Lots clôturés · Contrôle TRS · Arrêts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="h-11 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)} className="py-3">{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="h-11 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)} className="py-3">{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={equipmentId ? String(equipmentId) : "all"} onValueChange={v => setEquipmentId(v !== "all" ? v : undefined)}>
            <SelectTrigger className="h-11 w-48"><SelectValue placeholder="Tous les équipements" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="py-3">Tous les équipements</SelectItem>
              {(equipments ?? []).filter(e => e.isActive !== false).map(e => <SelectItem key={e.id} value={e.id} className="py-3">{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setExportOpen(true)} className="h-11 gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
            <FileSpreadsheet className="h-4 w-4" /> Exporter Excel
          </Button>
        </div>
      </div>
      <ExportModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        equipments={equipments?.map(e => ({ id: e.id, name: e.name, code: e.code })) ?? []}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="TRS Consolidé" value={summary?.currentMonthTrs ?? null} target={summary?.trsObjective} />
        <KpiCard label="TRG (tU/tO)" value={monthlyKpis?.TRG ?? null} color={trsColor(monthlyKpis?.TRG ?? null)} />
        <KpiCard label="Disponibilité (DO)" value={summary?.currentMonthDO ?? null} color={trsColor(summary?.currentMonthDO ?? null)} />
        <KpiCard label="Performance (TP)" value={summary?.currentMonthTP ?? null} color={trsColor(summary?.currentMonthTP ?? null)} />
        <KpiCard label="Qualité (TQ)" value={summary?.currentMonthTQ ?? null} color={trsColor(summary?.currentMonthTQ ?? null)} />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "À réviser", value: summary?.pendingValidations ?? 0, color: "text-sky-400", icon: <Clock className="h-5 w-5" /> },
          { label: "Jours de prod.", value: summary?.productionDays ?? 0, color: "text-emerald-400", icon: <TrendingUp className="h-5 w-5" /> },
          { label: "Revues", value: summary?.validatedEntries ?? 0, color: "text-green-500", icon: <CheckCircle className="h-5 w-5" /> },
          { label: "Avec anomalie", value: summary?.rejectedEntries ?? 0, color: "text-orange-400", icon: <AlertTriangle className="h-5 w-5" /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <span className={cn("shrink-0", color)}>{icon}</span>
            <div>
              <div className={cn("text-2xl font-bold", color)}>{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Lots à réviser + TRS Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: pending list */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-sky-400" /> Lots à réviser ({pending?.length ?? 0})
          </h2>
          {!pending || pending.length === 0 ? (
            <div className="border border-border rounded-xl p-8 text-center text-sm text-muted-foreground bg-card">
              Aucun lot à réviser
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
              {(pending as PendingEntry[]).map(e => (
                <PendingCard
                  key={e.id}
                  entry={e}
                  onAction={handleAction}
                  onOpenFiche={setFicheEntry}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: TRS decomp + triple check */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" /> Décomposition TRS
            </h2>
            <GaugeBar label="Disponibilité (DO)" value={monthlyKpis?.DO ?? null} subtitle="tF / tR" />
            <GaugeBar label="Performance (TP)" value={monthlyKpis?.TP ?? null} subtitle="tN / tF" />
            <GaugeBar label="Qualité (TQ)" value={monthlyKpis?.TQ ?? null} subtitle="tU / tN" />
            <div className="pt-2 border-t border-border space-y-3">
              <GaugeBar label="TRS Consolidé" value={monthlyKpis?.trs ?? null} subtitle="tU / tR" />
              <GaugeBar label="TRG" value={monthlyKpis?.TRG ?? null} subtitle="tU / tO" />
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Info className="h-4 w-4" /> Triple contrôle TRS
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">TRS (tU/tR)</span>
                <span className="font-bold" style={{ color: trsColor(monthlyKpis?.trs ?? null) }}>{trsLabel(monthlyKpis?.trs ?? null)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">TRG (tU/tO)</span>
                <span className="font-bold" style={{ color: trsColor(monthlyKpis?.TRG ?? null) }}>{trsLabel(monthlyKpis?.TRG ?? null)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">TRS = DO × TP × TQ</span>
                <span className="font-bold" style={{ color: trsColor(doTPTQ) }}>{trsLabel(doTPTQ)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="text-muted-foreground">Cohérence</span>
                {trsCoherence === null ? (
                  <span className="text-xs text-muted-foreground">N/A</span>
                ) : trsCoherence ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">✓ OK</Badge>
                ) : (
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">⚠ Vérifier</Badge>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Cadence (TP)</span>
                <span className="font-bold" style={{ color: trsColor(monthlyKpis?.TP ?? null) }}>{trsLabel(monthlyKpis?.TP ?? null)}</span>
              </div>
            </div>
          </div>

          {losses && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4" /> Décomposition des pertes
              </h2>
              <div className="space-y-2.5">
                <LossBar label="Arrêts planifiés" minutes={losses.planned} totalRef={losses.totalRef} color="#3b82f6" />
                <LossBar label="Arrêts non planifiés" minutes={losses.unplanned} totalRef={losses.totalRef} color="#ef4444" />
                <LossBar label="Sous-performance" minutes={losses.perf} totalRef={losses.totalRef} color="#f97316" />
                <LossBar label="Non-qualité" minutes={losses.quality} totalRef={losses.totalRef} color="#eab308" />
                <LossBar label="Temps utile" minutes={losses.useful} totalRef={losses.totalRef} color="#22c55e" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Daily TRS chart */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> TRS Journalier — {MONTHS[month - 1]} {year}
        </h2>
        {dailyTrs && dailyTrs.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyTrs} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={d => d.slice(8)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v}%`} />
              <Tooltip
                formatter={(v: number) => [`${v?.toFixed(1)}%`, "TRS"]}
                labelFormatter={l => `Jour ${String(l).slice(8)}`}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={dailyTrs[0]?.trsObjective ?? 75} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "Obj.", position: "right", fontSize: 10, fill: "#94a3b8" }} />
              <Line
                dataKey="trs" name="TRS" type="monotone"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (!payload.trs) return <circle key={cx} cx={cx} cy={cy} r={3} fill="#6b7280" />;
                  return <circle key={cx} cx={cx} cy={cy} r={5} fill={trsColor(payload.trs)} stroke="white" strokeWidth={2} />;
                }}
                stroke="#38bdf8" strokeWidth={2} connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Aucune donnée pour cette période</div>
        )}
      </div>

      {/* 3 Pareto + Equipment comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" /> Pareto des arrêts
            </h2>
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(["detail", "famille", "type"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setParetoTab(tab)}
                  className={cn(
                    "px-3 py-1.5 font-medium transition-colors",
                    paretoTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {tab === "detail" ? "Détail" : tab === "famille" ? "Famille" : "Type"}
                </button>
              ))}
            </div>
          </div>
          {paretoData && paretoData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={paretoData.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 40, left: 65, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="categoryCode" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={60} />
                <Tooltip
                  formatter={(v: number, _n, p) => [`${v} min (${p.payload.occurrences}×)`, p.payload.categoryLabel]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="totalMinutes" radius={[0, 4, 4, 0]}>
                  {paretoData.slice(0, 10).map((entry, i) => (
                    <Cell key={i} fill={entry.isPlanned ? "#3b82f6" : "#ef4444"} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Aucun arrêt enregistré</div>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Planifié</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Non planifié</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Target className="h-4 w-4" /> Comparaison équipements
          </h2>
          {comparison && comparison.length > 0 ? (
            <div className="space-y-5">
              {comparison.map(eq => (
                <div key={eq.equipmentId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{eq.equipmentName}</span>
                    <Badge style={{ background: trsColor(eq.trs), color: "white" }}>
                      TRS {trsLabel(eq.trs)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {[
                      { l: "TRG", v: (eq as { TRG?: number | null }).TRG ?? null },
                      { l: "DO", v: eq.DO },
                      { l: "TP", v: eq.TP },
                      { l: "TQ", v: eq.TQ },
                    ].map(({ l, v }) => (
                      <div key={l} className="bg-muted rounded-lg p-2.5 text-center">
                        <div className="text-muted-foreground">{l}</div>
                        <div className="font-bold text-sm" style={{ color: trsColor(v) }}>{trsLabel(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Aucune donnée</div>
          )}
        </div>
      </div>

      {/* Fiche lot modal */}
      {ficheEntry && (
        <LotFicheModal
          entry={ficheEntry}
          onClose={() => setFicheEntry(null)}
          onAction={(id, action, comment) => {
            handleAction(id, action, comment);
            setFicheEntry(null);
          }}
        />
      )}
    </div>
  );
}
