import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, CheckCircle, Clock, Wrench, Package,
  TrendingUp, Calendar, Bell, BellOff, ChevronDown, ChevronUp,
  Loader2, Play, Pause, XCircle, Zap, BarChart3, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
function apiHeaders(): Record<string, string> {
  return {};
}
async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: { ...apiHeaders(), ...(opts.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error ?? res.statusText); }
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface PlanEntry {
  id: string; weekNumber: number; year: number; date: string; dayName: string;
  activityType: string; team: string | null; equipment: string | null; room: string | null;
  productName: string | null; lotNumber: string | null; plannedQuantity: number | null;
  plannedUnit: string | null; specialActivity: string | null; validationStatus: string;
  importedAt: string;
}

interface NotificationItem {
  id: number; type: string; severity: "info" | "warning" | "critical";
  equipment: string | null; room: string | null; product: string | null; lot: string | null;
  message: string; createdAt: string; status: "open" | "acknowledged" | "closed";
  acknowledgedAt: string | null; closedAt: string | null; comment: string | null;
}

interface ProductionEntry {
  id: number; date: string; shift: string; equipmentId: number; equipmentName?: string;
  productName?: string; quantityProduced: number; quantityConforming: number;
  status: string; trsMetrics?: { TRS?: number; TRG?: number; DO?: number; TP?: number; TQ?: number; tO?: number };
}

// --- Équipements DPI avec couleurs ---
const DPI_EQUIPMENTS = [
  { key: "Géluleuse HH (A27)", label: "Géluleuse HH", sublabel: "Local A27", icon: "⚙️", color: "blue" },
  { key: "Blistéreuse (A28)", label: "Blistéreuse", sublabel: "Local A28", icon: "📦", color: "emerald" },
  { key: "Box A23", label: "Box A23", sublabel: "Pesée / Fabrication", icon: "🏭", color: "purple" },
  { key: "Salle D08", label: "Salle D08", sublabel: "Local D08", icon: "🔧", color: "amber" },
  { key: "Salle D18", label: "Salle D18", sublabel: "Local D18", icon: "🔧", color: "orange" },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/30",    text: "text-blue-400",    badge: "bg-blue-500/20 text-blue-300" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", badge: "bg-emerald-500/20 text-emerald-300" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/30",   text: "text-amber-400",   badge: "bg-amber-500/20 text-amber-300" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-500/30",  text: "text-orange-400",  badge: "bg-orange-500/20 text-orange-300" },
  purple:  { bg: "bg-purple-500/10",  border: "border-purple-500/30",  text: "text-purple-400",  badge: "bg-purple-500/20 text-purple-300" },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/30",    text: "text-cyan-400",    badge: "bg-cyan-500/20 text-cyan-300" },
  slate:   { bg: "bg-slate-500/10",   border: "border-slate-500/30",   text: "text-slate-400",   badge: "bg-slate-500/20 text-slate-300" },
  green:   { bg: "bg-green-500/10",   border: "border-green-500/30",   text: "text-green-400",   badge: "bg-green-500/20 text-green-300" },
};

function trsColor(v: number | null | undefined) {
  if (v == null) return "text-muted-foreground";
  if (v >= 0.75) return "text-green-400";
  if (v >= 0.55) return "text-amber-400";
  return "text-red-400";
}

function fmt(v: number) { return `${(v * 100).toFixed(1)}%`; }

function severityBadge(s: "info" | "warning" | "critical") {
  const map = { info: "bg-blue-500/20 text-blue-400", warning: "bg-amber-500/20 text-amber-400", critical: "bg-red-500/20 text-red-400" };
  const label = { info: "Info", warning: "Vigilance", critical: "Critique" };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", map[s])}>{label[s]}</span>;
}

function EquipmentCard({ equip, plans, entries }: {
  equip: typeof DPI_EQUIPMENTS[0];
  plans: PlanEntry[];
  entries: ProductionEntry[];
}) {
  const colors = COLOR_MAP[equip.color];
  const todayPlans = plans.filter(p => p.equipment === equip.key || p.room === equip.key);
  const activeEntry = entries[0];

  const hasActivity = todayPlans.length > 0;
  const hasSpecial = todayPlans.some(p => p.specialActivity);
  const productionPlan = todayPlans.find(p => !p.specialActivity);
  const specialPlan = todayPlans.find(p => p.specialActivity);

  let statusLabel = "Disponible";
  let statusIcon = <Activity className="h-3.5 w-3.5" />;
  let statusClass = "bg-slate-500/20 text-slate-400";

  if (hasSpecial) {
    statusLabel = specialPlan?.specialActivity?.includes("préventif") ? "Maintenance" : "Nettoyage";
    statusIcon = <Wrench className="h-3.5 w-3.5" />;
    statusClass = "bg-orange-500/20 text-orange-400";
  } else if (activeEntry) {
    statusLabel = "En production";
    statusIcon = <Play className="h-3.5 w-3.5" />;
    statusClass = "bg-blue-500/20 text-blue-400";
  } else if (hasActivity) {
    statusLabel = "Planifié";
    statusIcon = <Clock className="h-3.5 w-3.5" />;
    statusClass = "bg-amber-500/20 text-amber-400";
  }

  const planned = productionPlan?.plannedQuantity ?? 0;
  const realized = activeEntry?.quantityConforming ?? 0;
  const pct = planned > 0 ? Math.min(100, (realized / planned) * 100) : 0;
  const trs = activeEntry?.trsMetrics?.TRS;

  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-3", colors.bg, colors.border)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={cn("text-base font-bold", colors.text)}>{equip.label}</div>
          <div className="text-xs text-muted-foreground">{equip.sublabel}</div>
        </div>
        <span className={cn("flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium", statusClass)}>
          {statusIcon} {statusLabel}
        </span>
      </div>

      {/* Product */}
      {productionPlan?.productName && (
        <div className="text-sm">
          <span className="font-medium">{productionPlan.productName}</span>
          {productionPlan.lotNumber && (
            <span className="text-muted-foreground ml-2 font-mono text-xs">Lot {productionPlan.lotNumber}</span>
          )}
        </div>
      )}
      {specialPlan?.specialActivity && !productionPlan && (
        <div className="text-sm text-amber-400 flex items-center gap-1">
          <Wrench className="h-3.5 w-3.5" /> {specialPlan.specialActivity}
        </div>
      )}
      {!hasActivity && <div className="text-xs text-muted-foreground italic">Aucune activité planifiée</div>}

      {/* Progress */}
      {hasActivity && !hasSpecial && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Avancement</span>
            <span className={cn("font-bold", pct >= 90 ? "text-green-400" : pct >= 75 ? "text-amber-400" : "text-red-400")}>
              {realized.toLocaleString("fr-FR")} / {planned > 0 ? planned.toLocaleString("fr-FR") : "—"} {productionPlan?.plannedUnit ?? ""}
            </span>
          </div>
          <div className="h-2 bg-black/20 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-green-500" : pct >= 75 ? "bg-amber-500" : "bg-red-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
          {trs != null && (
            <div className="text-xs flex items-center justify-between">
              <span className="text-muted-foreground">TRS</span>
              <span className={cn("font-bold", trsColor(trs))}>{fmt(trs)}</span>
            </div>
          )}
          {activeEntry?.trsMetrics?.TRG != null && (
            <div className="text-xs flex items-center justify-between">
              <span className="text-muted-foreground">TRG <span className="text-muted-foreground/50">(tU/tO)</span></span>
              <span className={cn("font-bold", trsColor(activeEntry.trsMetrics.TRG * 100))}>{(activeEntry.trsMetrics.TRG * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({ n, onAction }: { n: NotificationItem; onAction: (id: number, action: "acknowledge" | "close", comment?: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");

  return (
    <div className={cn(
      "border rounded-xl p-3 space-y-2",
      n.severity === "critical" ? "border-red-500/40 bg-red-500/5" :
      n.severity === "warning" ? "border-amber-500/40 bg-amber-500/5" :
      "border-border bg-card"
    )}>
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-0.5">
          {n.severity === "critical" ? <XCircle className="h-4 w-4 text-red-400" /> :
           n.severity === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-400" /> :
           <Bell className="h-4 w-4 text-blue-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {severityBadge(n.severity)}
            {n.equipment && <span className="text-xs text-muted-foreground">{n.equipment}</span>}
            {n.lot && <span className="text-xs font-mono text-muted-foreground">Lot {n.lot}</span>}
          </div>
          <p className="text-sm">{n.message}</p>
          <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString("fr-FR")}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {n.status === "open" && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction(n.id, "acknowledge")}>
                <BellOff className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-green-400 border-green-500/30" onClick={() => onAction(n.id, "close", comment || undefined)}>
                <CheckCircle className="h-3 w-3" />
              </Button>
            </>
          )}
          {n.status === "acknowledged" && (
            <Button size="sm" variant="outline" className="h-7 text-xs text-green-400 border-green-500/30" onClick={() => onAction(n.id, "close", comment || undefined)}>
              <CheckCircle className="h-3 w-3 mr-1" /> Clôturer
            </Button>
          )}
          {n.status === "closed" && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Clôturé</span>}
        </div>
      </div>
      {expanded && n.status === "open" && (
        <div className="pl-6 flex gap-2">
          <input
            className="flex-1 bg-muted border border-border rounded px-2 py-1 text-xs"
            placeholder="Commentaire de justification..."
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          <Button size="sm" className="h-7 text-xs" onClick={() => { onAction(n.id, "close", comment || undefined); setExpanded(false); }}>Clôturer</Button>
        </div>
      )}
    </div>
  );
}

export default function ProductionPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [notifStatus, setNotifStatus] = useState<"open" | "acknowledged" | "all">("open");

  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = useQuery<PlanEntry[]>({
    queryKey: ["production-plans", selectedDate],
    queryFn: () => apiFetch(`/api/planning?date=${selectedDate}`),
    refetchInterval: 30000,
  });

  const { data: entries, isLoading: entriesLoading } = useQuery<ProductionEntry[]>({
    queryKey: ["production-entries-day", selectedDate],
    queryFn: () => apiFetch(`/api/production-entries?dateFrom=${selectedDate}&dateTo=${selectedDate}&status=validated,submitted`),
    refetchInterval: 30000,
  });

  const statusFilter = notifStatus === "all" ? undefined : notifStatus;
  const { data: notifications, refetch: refetchNotifs } = useQuery<NotificationItem[]>({
    queryKey: ["notifications", statusFilter],
    queryFn: () => apiFetch(`/api/notifications${statusFilter ? `?status=${statusFilter}` : ""}`),
    refetchInterval: 30000,
  });

  const ackMutation = useMutation({
    mutationFn: ({ id, action, comment }: { id: number; action: "acknowledge" | "close"; comment?: string }) =>
      apiFetch(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, comment }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); refetchNotifs(); },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const plansByEquipment = useMemo(() => {
    if (!plans) return {};
    const map: Record<string, PlanEntry[]> = {};
    for (const p of plans) {
      const key = p.equipment ?? p.room ?? "other";
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [plans]);

  const entriesByEquipment = useMemo(() => {
    if (!entries) return {};
    const map: Record<string, ProductionEntry[]> = {};
    for (const e of entries) {
      const key = e.equipmentName ?? "other";
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return map;
  }, [entries]);

  // Summary KPIs
  const totalPlanned = plans?.filter(p => !p.specialActivity).length ?? 0;
  const totalSpecial = plans?.filter(p => p.specialActivity).length ?? 0;
  const openNotifs = notifications?.filter(n => n.status === "open") ?? [];
  const criticalNotifs = openNotifs.filter(n => n.severity === "critical");
  const validatedEntries = entries?.filter(e => e.status === "validated") ?? [];
  const avgTrs = validatedEntries.length > 0
    ? validatedEntries.reduce((s, e) => s + (e.trsMetrics?.TRS ?? 0), 0) / validatedEntries.length
    : null;

  const isToday = selectedDate === today;
  const dayLabel = isToday ? "Aujourd'hui" : new Date(selectedDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Tableau de Bord Production</h1>
          <p className="text-sm text-muted-foreground capitalize">{dayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="h-11 px-3 bg-card border border-border rounded-lg text-sm"
          />
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => { refetchPlans(); refetchNotifs(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground"><Package className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">Activités planifiées</span></div>
          <div className="text-2xl font-bold">{totalPlanned}</div>
          {totalSpecial > 0 && <div className="text-xs text-amber-400 mt-1">{totalSpecial} maintenance/nettoyage</div>}
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground"><Activity className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">Saisies du jour</span></div>
          <div className="text-2xl font-bold">{entries?.length ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">{validatedEntries.length} validée{validatedEntries.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground"><TrendingUp className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">TRS consolidé</span></div>
          <div className={cn("text-2xl font-bold", trsColor(avgTrs))}>
            {avgTrs != null ? fmt(avgTrs) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Lots clôturés</div>
        </div>
        <div className={cn("border rounded-xl p-4", criticalNotifs.length > 0 ? "bg-red-500/10 border-red-500/30" : "bg-card border-border")}>
          <div className="flex items-center gap-2 mb-2 text-muted-foreground"><Bell className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">Alertes ouvertes</span></div>
          <div className={cn("text-2xl font-bold", criticalNotifs.length > 0 ? "text-red-400" : "")}>
            {openNotifs.length}
          </div>
          {criticalNotifs.length > 0 && <div className="text-xs text-red-400 mt-1">{criticalNotifs.length} critique{criticalNotifs.length > 1 ? "s" : ""}</div>}
        </div>
      </div>

      {/* Equipment Cards Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4" /> Statut équipements & locaux
        </h2>
        {plansLoading || entriesLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {DPI_EQUIPMENTS.map(equip => (
              <EquipmentCard
                key={equip.key}
                equip={equip}
                plans={plansByEquipment[equip.key] ?? []}
                entries={entriesByEquipment[equip.key] ?? []}
              />
            ))}
          </div>
        )}
      </div>

      {/* Planning vs Réalisé Table */}
      {plans && plans.filter(p => !p.specialActivity).length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Planning vs. Réalisé</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Activité</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Équipement</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Produit / Lot</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Planifié</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Réalisé</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Avancement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plans.filter(p => !p.specialActivity).map(p => {
                  const eqEntries = entriesByEquipment[p.equipment ?? ""] ?? [];
                  const realized = eqEntries.reduce((s, e) => s + e.quantityConforming, 0);
                  const planned = p.plannedQuantity ?? 0;
                  const pct = planned > 0 ? Math.min(100, (realized / planned) * 100) : null;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium">{p.activityType.replace("Conditionnement secondaire & tertiaire", "Cond. sec.")}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{p.equipment ?? p.room ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.productName ?? "—"}</div>
                        {p.lotNumber && <div className="text-xs text-muted-foreground font-mono">Lot {p.lotNumber}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {planned > 0 ? planned.toLocaleString("fr-FR") + " " + (p.plannedUnit ?? "") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {eqEntries.length > 0 ? realized.toLocaleString("fr-FR") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pct != null ? (
                          <span className={cn("text-xs font-bold", pct >= 90 ? "text-green-400" : pct >= 75 ? "text-amber-400" : "text-red-400")}>
                            {pct.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Bell className="h-4 w-4" /> Alertes & Notifications
            {openNotifs.length > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{openNotifs.length}</span>
            )}
          </h2>
          <div className="flex gap-1">
            {(["open", "acknowledged", "all"] as const).map(s => (
              <button
                key={s}
                onClick={() => setNotifStatus(s)}
                className={cn("text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  notifStatus === s ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {s === "open" ? "Ouvertes" : s === "acknowledged" ? "En cours" : "Toutes"}
              </button>
            ))}
          </div>
        </div>

        {!notifications?.length ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {notifStatus === "open" ? "Aucune alerte ouverte" : "Aucune notification"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <NotificationRow
                key={n.id}
                n={n}
                onAction={(id, action, comment) => ackMutation.mutate({ id, action, comment })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
