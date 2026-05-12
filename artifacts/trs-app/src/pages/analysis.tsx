import { useState, useMemo, useEffect } from "react";
import {
  useListProductionEntries, useListEquipments,
  useGetDowntimePareto,
} from "@workspace/api-client-react";
import type { ProductionEntryWithDetails, DowntimeParetoItem } from "@workspace/api-client-react";
import { Download, Filter, BarChart2, CalendarRange, Calendar, CalendarDays, FileText, ClipboardList, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend,
} from "recharts";

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const FAMILLE_COLORS: Record<string, string> = {
  "Arrêts non planifiés": "#ef4444",
  "Problèmes de qualité": "#f97316",
  "Arrêt technique":      "#8b5cf6",
  "Attente et transition":"#3b82f6",
  "Utilités":             "#06b6d4",
  "Planifié":             "#3b82f6",
  "Non planifié":         "#ef4444",
  "Non classifié":        "#6b7280",
};

function paretoBarColor(entry: DowntimeParetoItem): string {
  if (entry.famille && FAMILLE_COLORS[entry.famille]) return FAMILLE_COLORS[entry.famille];
  if (FAMILLE_COLORS[entry.categoryCode]) return FAMILLE_COLORS[entry.categoryCode];
  return entry.isPlanned ? "#3b82f6" : "#ef4444";
}

function trsColor(trs: number | null | undefined) {
  if (trs === null || trs === undefined) return "#6b7280";
  if (trs >= 0.75) return "#22c55e";
  if (trs >= 0.55) return "#f97316";
  return "#ef4444";
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; class: string }> = {
    draft: { label: "Brouillon", class: "bg-slate-500/20 text-slate-400" },
    submitted: { label: "Soumis", class: "bg-amber-500/20 text-amber-500" },
    validated: { label: "Validé", class: "bg-green-500/20 text-green-500" },
    rejected: { label: "Rejeté", class: "bg-red-500/20 text-red-500" },
  };
  const s = map[status] ?? { label: status, class: "" };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", s.class)}>{s.label}</span>;
}

function fmt(v: number) { return `${(v * 100).toFixed(1)}%`; }

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: DowntimeParetoItem; value: number; dataKey: string }> }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg max-w-[220px]">
      <div className="font-semibold mb-1">{d.categoryLabel}</div>
      {d.famille && <div className="text-muted-foreground mb-1">Famille : {d.famille}</div>}
      <div>Durée : <span className="font-medium text-foreground">{d.totalMinutes} min</span></div>
      <div>Occurrences : <span className="font-medium text-foreground">{d.occurrences}</span></div>
      <div>Part : <span className="font-medium text-foreground">{d.percentage.toFixed(1)}%</span></div>
      <div>Cumulé : <span className="font-medium text-foreground">{d.cumulativePercentage.toFixed(1)}%</span></div>
    </div>
  );
};

// ─── Types API ───────────────────────────────────────────────────────────────
interface MonthlyKpisResult {
  month: number; year: number;
  trs: number | null; DO: number | null; TP: number | null; TQ: number | null;
  TRG: number | null; TRE: number | null;
  trsObjective: number;
  totalTR: number; totalTU: number; totalTF: number; totalTN: number;
  totalDowntimePlanned: number; totalDowntimeUnplanned: number;
  source: "daily" | "production";
}

interface DailySummaryDay {
  id: string; entryDate: string; status: string;
  tO: number; fermetureMin: number; tAP: number; tR: number; tT: number;
}

interface DailySummaryResult {
  year: number; month: number; equipmentId: string;
  daysInMonth: number; daysWithEntries: number;
  totalTO: number; totalTAP: number; totalTR: number;
  days: DailySummaryDay[];
}

// ─── Helper fetch authentifié ────────────────────────────────────────────────
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

// ─── Vue hebdomadaire / annuelle ─────────────────────────────────────────────
type PeriodPoint = { label: string; trs: number | null; TRG: number | null; DO: number | null; TP: number | null; TQ: number | null; entries: number; };

function TrsPeriodView({ type, year, equipmentId }: { type: "hebdomadaire" | "annuel"; year: number; equipmentId?: string }) {
  const [data, setData] = useState<PeriodPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year) });
    if (equipmentId) params.set("equipmentId", equipmentId);
    const url = type === "annuel" ? `/api/dashboard/annual-trs?${params}` : `/api/dashboard/weekly-trs?${params}`;
    apiGet<Array<{ monthLabel?: string; weekLabel?: string; trs: number | null; TRG: number | null; DO: number | null; TP: number | null; TQ: number | null; entries: number }>>(url)
      .then(d => setData(d.map(r => ({ label: r.monthLabel ?? r.weekLabel ?? "", trs: r.trs, TRG: r.TRG ?? null, DO: r.DO, TP: r.TP, TQ: r.TQ, entries: r.entries }))))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [type, year, equipmentId]);

  if (loading) return <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">Chargement…</div>;
  if (!data.length) return <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">Aucune donnée pour {year}</div>;

  const withData = data.filter(d => d.trs !== null);
  const avg = (k: keyof PeriodPoint) =>
    withData.length > 0 ? withData.reduce((s, d) => s + ((d[k] as number) ?? 0), 0) / withData.length : null;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      {withData.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {([["TRS Consolidé","trs"],["TRG (tU/tO)","TRG"],["Disponibilité (DO)","DO"],["Performance (TP)","TP"],["Qualité (TQ)","TQ"]] as const).map(([label, key]) => {
            const v = avg(key);
            return (
              <div key={label} className="bg-card border border-border rounded-xl p-4">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
                <div className="text-2xl font-bold mt-1" style={{ color: trsColor(v !== null ? v / 100 : null) }}>
                  {v !== null ? `${v.toFixed(1)}%` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bar chart */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-4">
          TRS {type === "annuel" ? "annuel" : "hebdomadaire"} — {year}
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v}%`} width={36} />
            <Tooltip
              formatter={(v: unknown) => [typeof v === "number" ? `${v.toFixed(1)}%` : "—"]}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
            />
            <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "75%", position: "right", fontSize: 9, fill: "#f59e0b" }} />
            <Bar dataKey="trs" name="TRS" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.trs !== null ? (d.trs >= 75 ? "#22c55e" : d.trs >= 55 ? "#f97316" : "#ef4444") : "#374151"} fillOpacity={0.85} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[type === "annuel" ? "Mois" : "Semaine", "TRS", "TRG", "DO", "TP", "TQ", "Saisies"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{row.label}</td>
                {(["trs", "TRG", "DO", "TP", "TQ"] as const).map(k => (
                  <td key={k} className="px-4 py-3 tabular-nums font-medium" style={{ color: trsColor(row[k] !== null ? (row[k] as number) / 100 : null) }}>
                    {row[k] !== null ? `${(row[k] as number).toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{row.entries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const now = new Date();
  const [period, setPeriod] = useState<"mensuel" | "hebdomadaire" | "annuel">("mensuel");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [equipmentId, setEquipmentId] = useState<string | undefined>();
  const [shift, setShift] = useState("Tous");
  const [status, setStatus] = useState("validated");

  // Pareto controls
  const [groupBy, setGroupBy] = useState<"detail" | "famille" | "type">("detail");
  const [filterPlanned, setFilterPlanned] = useState<"all" | "true" | "false">("all");

  const { data: equipments } = useListEquipments();
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const { data: entries, isLoading } = useListProductionEntries({
    equipmentId,
    dateFrom,
    dateTo,
    status: status as "validated" | "submitted" | "draft" | "rejected",
  });

  const paretoParams = useMemo(() => ({
    month,
    year,
    equipmentId,
    groupBy,
    ...(filterPlanned !== "all" ? { isPlanned: filterPlanned === "true" } : {}),
  }), [month, year, equipmentId, groupBy, filterPlanned]);

  const { data: paretoRaw } = useGetDowntimePareto(paretoParams);

  const paretoData = useMemo(() => {
    if (!paretoRaw) return [];
    return (paretoRaw as DowntimeParetoItem[]).slice(0, groupBy === "type" ? 2 : groupBy === "famille" ? 5 : 12);
  }, [paretoRaw, groupBy]);

  const availableShifts = useMemo(() => {
    if (!entries) return ["Tous"];
    const unique = [...new Set((entries as { shift: string }[]).map(e => e.shift))].sort();
    return ["Tous", ...unique];
  }, [entries]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    return entries.filter((e: { shift: string }) => shift === "Tous" || e.shift === shift) as typeof entries;
  }, [entries, shift]);

  // ── KPI mensuels depuis l'API (V2 si fiches existent, sinon V1) ──
  const [monthlyKpis, setMonthlyKpis] = useState<MonthlyKpisResult | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  useEffect(() => {
    if (period !== "mensuel") return;
    setKpisLoading(true);
    setMonthlyKpis(null);
    const p = new URLSearchParams({ month: String(month), year: String(year) });
    if (equipmentId) p.set("equipmentId", equipmentId);
    apiGet<MonthlyKpisResult>(`/api/dashboard/monthly-kpis?${p}`)
      .then(setMonthlyKpis).catch(() => setMonthlyKpis(null)).finally(() => setKpisLoading(false));
  }, [period, month, year, equipmentId]);

  // ── Détail journalier (fiches + production par jour) ──
  const [dailySummary, setDailySummary] = useState<DailySummaryResult | null>(null);
  useEffect(() => {
    if (period !== "mensuel" || !equipmentId) { setDailySummary(null); return; }
    const p = new URLSearchParams({ equipmentId, year: String(year), month: String(month) });
    apiGet<DailySummaryResult>(`/api/daily-entries/monthly-summary?${p}`)
      .then(setDailySummary).catch(() => setDailySummary(null));
  }, [period, month, year, equipmentId]);

  // ── Entrées production groupées par date (pour le tableau journalier) ──
  const entriesByDate = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    for (const e of filtered) {
      const d = (e as { date: string }).date;
      if (!map[d]) map[d] = [] as typeof filtered;
      (map[d] as typeof filtered).push(e);
    }
    return map;
  }, [filtered]);

  const exportCsv = () => {
    if (!filtered.length) return;
    const headers = ["Date", "Équipement", "Produit", "Lot", "Poste", "Début", "Fin", "Produit", "Conforme", "Rebus", "TRS", "TRG", "tO (min)", "DO", "TP", "TQ", "Statut"];
    const rows = filtered.map((e: ProductionEntryWithDetails) => [
      e.date, e.equipmentName ?? "", e.productName ?? "", e.batchNumber, e.shift,
      e.shiftStart, e.shiftEnd, e.quantityProduced, e.quantityConforming, e.quantityRejected,
      e.trsMetrics ? fmt(e.trsMetrics.TRS ?? 0) : "",
      e.trsMetrics ? fmt(e.trsMetrics.TRG ?? 0) : "",
      e.trsMetrics ? String(e.trsMetrics.tO ?? "") : "",
      e.trsMetrics ? fmt(e.trsMetrics.DO ?? 0) : "",
      e.trsMetrics ? fmt(e.trsMetrics.TP ?? 0) : "",
      e.trsMetrics ? fmt(e.trsMetrics.TQ ?? 0) : "",
      e.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TRS_${MONTHS[month-1]}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const groupByLabel: Record<string, string> = {
    detail: "Détaillé (par catégorie)",
    famille: "Par famille",
    type: "Par type (planifié/non planifié)",
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Analyse TRS</h1>
          <p className="text-sm text-muted-foreground">Exploration détaillée des saisies de production</p>
        </div>
        {period === "mensuel" && (
          <Button onClick={exportCsv} variant="outline" className="h-11 gap-2">
            <Download className="h-4 w-4" /> Exporter CSV
          </Button>
        )}
      </div>

      {/* Period Tabs */}
      <div className="flex gap-1 bg-muted/30 border border-border rounded-xl p-1 w-fit">
        {([
          { key: "mensuel",      label: "Mensuel",       Icon: Calendar },
          { key: "hebdomadaire", label: "Hebdomadaire",  Icon: CalendarDays },
          { key: "annuel",       label: "Annuel",        Icon: CalendarRange },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              period === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          {period === "mensuel" && (
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="h-11 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)} className="py-3">{m}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="h-11 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: now.getFullYear() - 2024 }, (_, i) => 2025 + i).map(y => <SelectItem key={y} value={String(y)} className="py-3">{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={equipmentId ? String(equipmentId) : "all"} onValueChange={v => setEquipmentId(v !== "all" ? v : undefined)}>
            <SelectTrigger className="h-11 w-48"><SelectValue placeholder="Tous les équipements" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="py-3">Tous les équipements</SelectItem>
              {(equipments ?? []).filter(e => e.isActive !== false).map(e => <SelectItem key={e.id} value={String(e.id)} className="py-3">{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {period === "mensuel" && (
            <>
              <Select value={shift} onValueChange={v => { setShift(v); }}>
                <SelectTrigger className="h-11 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{availableShifts.map(s => <SelectItem key={s} value={s} className="py-3">{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-11 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="validated" className="py-3">Validées</SelectItem>
                  <SelectItem value="submitted" className="py-3">Soumises</SelectItem>
                  <SelectItem value="draft" className="py-3">Brouillons</SelectItem>
                  <SelectItem value="rejected" className="py-3">Rejetées</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>

      {/* Monthly KPI (V2 depuis l'API) */}
      {period === "mensuel" && (monthlyKpis || kpisLoading) && (
        <div className="space-y-2">
          {/* Badge source */}
          {monthlyKpis && (
            <div className="flex items-center gap-3 flex-wrap">
              {monthlyKpis.source === "daily" ? (
                <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/25 font-medium">
                  <FileText className="h-3 w-3" /> Calculé sur fiches journalières
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/25 font-medium">
                  <ClipboardList className="h-3 w-3" /> Calculé sur postes de production
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Objectif : <span className="font-semibold text-foreground">{monthlyKpis.trsObjective}%</span>
                {" · "}tR total : <span className="font-semibold text-foreground">{Math.round(monthlyKpis.totalTR)} min</span>
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {kpisLoading && !monthlyKpis ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-20" />
              ))
            ) : monthlyKpis ? (
              ([
                { label: "TRS Consolidé", value: monthlyKpis.trs, sub: `tU / tR · obj ${monthlyKpis.trsObjective}%` },
                { label: "TRG", value: monthlyKpis.TRG, sub: "tU / tO" },
                { label: "Disponibilité (DO)", value: monthlyKpis.DO, sub: "tF / tR" },
                { label: "Performance (TP)", value: monthlyKpis.TP, sub: "tN / tF" },
                { label: "Qualité (TQ)", value: monthlyKpis.TQ, sub: "tU / tN" },
              ] as { label: string; value: number | null; sub: string }[]).map(({ label, value, sub }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
                  <div className="text-2xl font-bold mt-1" style={{ color: trsColor(value !== null ? value / 100 : null) }}>
                    {value !== null ? `${value.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>
                </div>
              ))
            ) : null}
          </div>
        </div>
      )}

      {/* Tableau détail journalier (mensuel + équipement sélectionné) */}
      {period === "mensuel" && equipmentId && dailySummary && dailySummary.days.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Détail journalier — {MONTHS[month-1]} {year}</span>
              <span className="text-xs text-muted-foreground">
                {dailySummary.daysWithEntries} fiche{dailySummary.daysWithEntries !== 1 ? "s" : ""} / {dailySummary.daysInMonth} jours
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Σ tR : <span className="font-semibold text-foreground">{Math.round(dailySummary.totalTR)} min</span></span>
              <span>Σ tO : <span className="font-semibold text-foreground">{Math.round(dailySummary.totalTO)} min</span></span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Date", "tO (min)", "tAP (min)", "tR (min)", "Fiche", "Lots", "Σ tU (conf.)", "TRS jour"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailySummary.days.map((day) => {
                  const dayEntries = entriesByDate[day.entryDate] ?? [];
                  const sumTU = dayEntries.reduce((s, e) => s + ((e as { trsMetrics?: { tU?: number } }).trsMetrics?.tU ?? 0), 0);
                  const trsJour = day.tR > 0 ? sumTU / day.tR : null;
                  const dateLabel = new Date(day.entryDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
                  return (
                    <tr key={day.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">{dateLabel}</td>
                      <td className="px-3 py-2.5 tabular-nums">{day.tO > 0 ? day.tO : <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums">{day.tAP > 0 ? day.tAP : <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">{day.tR > 0 ? day.tR : <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="px-3 py-2.5">
                        {day.status === "validated" ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">Validée</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">Brouillon</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{dayEntries.length || <span className="text-muted-foreground/40">—</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums">{sumTU > 0 ? sumTU.toLocaleString("fr-FR") : <span className="text-muted-foreground/40">—</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: trsJour !== null ? trsColor(trsJour) : undefined }}>
                        {trsJour !== null ? `${(trsJour * 100).toFixed(1)}%` : <span className="text-muted-foreground/40">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vues hebdomadaire / annuelle */}
      {(period === "hebdomadaire" || period === "annuel") && (
        <TrsPeriodView type={period} year={year} equipmentId={equipmentId} />
      )}

      {/* ── Pareto des arrêts (mensuel uniquement) ── */}
      {period === "mensuel" && <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-sky-400" />
            Pareto des arrêts — {MONTHS[month-1]} {year}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={groupBy} onValueChange={v => setGroupBy(v as "detail" | "famille" | "type")}>
              <SelectTrigger className="h-9 w-52 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="detail" className="py-2 text-xs">Détaillé (par catégorie)</SelectItem>
                <SelectItem value="famille" className="py-2 text-xs">Par famille</SelectItem>
                <SelectItem value="type" className="py-2 text-xs">Par type (planifié / non planifié)</SelectItem>
              </SelectContent>
            </Select>
            {groupBy !== "type" && (
              <Select value={filterPlanned} onValueChange={v => setFilterPlanned(v as "all" | "true" | "false")}>
                <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="py-2 text-xs">Tous les arrêts</SelectItem>
                  <SelectItem value="false" className="py-2 text-xs">Non planifiés seulement</SelectItem>
                  <SelectItem value="true" className="py-2 text-xs">Planifiés seulement</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {paretoData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
            Aucun arrêt enregistré pour cette période
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={groupBy === "type" ? 160 : paretoData.length <= 5 ? 200 : Math.max(240, paretoData.length * 38)}>
              <ComposedChart data={paretoData} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={v => `${v} min`}
                />
                <YAxis
                  type="category"
                  dataKey="categoryLabel"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  width={groupBy === "famille" ? 160 : groupBy === "type" ? 110 : 90}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="totalMinutes" name="Durée (min)" radius={[0, 4, 4, 0]} maxBarSize={32}>
                  {paretoData.map((entry, i) => (
                    <Cell key={i} fill={paretoBarColor(entry)} fillOpacity={0.85} />
                  ))}
                </Bar>
                <Line
                  yAxisId={0}
                  dataKey="cumulativePercentage"
                  name="Cumulé (%)"
                  type="monotone"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#f59e0b" }}
                  hide
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Second chart: cumulative % line */}
            <div className="mt-2">
              <div className="text-xs text-muted-foreground font-medium mb-1 pl-1">Courbe cumulative (%)</div>
              <ResponsiveContainer width="100%" height={80}>
                <ComposedChart data={paretoData} margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                  <XAxis dataKey="categoryLabel" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-15} textAnchor="end" height={32} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v}%`} width={36} />
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "80%", position: "right", fontSize: 9, fill: "#f59e0b" }} />
                  <Line dataKey="cumulativePercentage" type="monotone" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Cumulé"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
              {groupBy === "type" ? (
                <>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />Planifié</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />Non planifié</span>
                </>
              ) : groupBy === "famille" ? (
                Object.entries(FAMILLE_COLORS).filter(([k]) => !["Planifié","Non planifié"].includes(k)).map(([label, color]) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
                    {label}
                  </span>
                ))
              ) : (
                <>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />Planifié</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />Non planifié</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" />— Ligne 80% (règle de Pareto)</span>
                </>
              )}
            </div>

            {/* Summary table */}
            <div className="border border-border rounded-xl overflow-hidden mt-2">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border bg-muted/40">
                  {[groupBy === "type" ? "Type" : groupBy === "famille" ? "Famille" : "Catégorie", "Durée (min)", "Occurrences", "Part (%)", "Cumulé (%)"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {paretoData.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: paretoBarColor(row) }} />
                          {row.categoryLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums font-bold">{row.totalMinutes}</td>
                      <td className="px-3 py-2 tabular-nums">{row.occurrences}</td>
                      <td className="px-3 py-2 tabular-nums">{row.percentage.toFixed(1)}%</td>
                      <td className="px-3 py-2 tabular-nums">
                        <span className={cn("font-semibold", row.cumulativePercentage <= 80 ? "text-amber-500" : "text-muted-foreground")}>
                          {row.cumulativePercentage.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>}

      {/* Table (mensuel uniquement) */}
      {period === "mensuel" && <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-sm font-medium">{filtered.length} saisie{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Date", "Équipement", "Produit", "Lot", "Poste", "Quantité", "Conforme", "Rebus", "DO", "TP", "TQ", "TRS", "Statut"].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={13} className="text-center py-10 text-muted-foreground">Chargement...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-10 text-muted-foreground">Aucune saisie pour cette période</td></tr>
              ) : (
                filtered.map((e: ProductionEntryWithDetails) => (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3 whitespace-nowrap font-mono text-xs">{e.date}</td>
                    <td className="px-3 py-3 whitespace-nowrap max-w-[140px] truncate text-xs">{e.equipmentName}</td>
                    <td className="px-3 py-3 whitespace-nowrap max-w-[120px] truncate text-xs">{e.productName}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-mono text-xs">{e.batchNumber}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs">{e.shift}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{e.quantityProduced.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{e.quantityConforming.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums text-red-500">{e.quantityRejected.toLocaleString()}</td>
                    {["DO", "TP", "TQ", "TRS"].map(k => (
                      <td key={k} className="px-3 py-3 text-right whitespace-nowrap tabular-nums font-medium" style={{ color: trsColor(e.trsMetrics?.[k as keyof typeof e.trsMetrics] ?? null) }}>
                        {e.trsMetrics?.[k as keyof typeof e.trsMetrics] !== undefined ? fmt(e.trsMetrics[k as keyof typeof e.trsMetrics] as number) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-3 whitespace-nowrap">{statusBadge(e.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}
