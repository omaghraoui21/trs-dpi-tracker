import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronRight, Loader2, Calendar, Package,
  Plus, Pencil, Trash2, Save, X, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...apiHeaders(), ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const ACTIVITY_TYPES = [
  "Pesée",
  "Fabrication",
  "Mise en gélules",
  "Conditionnement primaire",
  "Conditionnement secondaire & tertiaire 1ère ligne",
  "Conditionnement secondaire & tertiaire 2ème ligne",
] as const;

const ACTIVITY_SHORT: Record<string, string> = {
  "Pesée": "Pesée",
  "Fabrication": "Fabrication",
  "Mise en gélules": "Gélules",
  "Conditionnement primaire": "Cond. primaire",
  "Conditionnement secondaire & tertiaire 1ère ligne": "Cond. sec. L1",
  "Conditionnement secondaire & tertiaire 2ème ligne": "Cond. sec. L2",
};

const ACTIVITY_COLORS: Record<string, string> = {
  "Pesée": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Fabrication": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Mise en gélules": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Conditionnement primaire": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Conditionnement secondaire & tertiaire 1ère ligne": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Conditionnement secondaire & tertiaire 2ème ligne": "bg-red-500/15 text-red-400 border-red-500/30",
};

interface PlanRow {
  weekNumber: number; year: number; date: string; dayName: string;
  activityType: string; team: string | null; equipment: string | null; room: string | null;
  productName: string | null; lotNumber: string | null; plannedQuantity: number | null;
  plannedUnit: string | null; specialActivity: string | null;
}

interface ParseResult {
  weekNumber: number; year: number; fileName: string; rows: PlanRow[]; anomalies: string[];
}

interface PlanWeek {
  weekNumber: number; year: number; sourceFileName: string; importedAt: string; entryCount: number;
}

interface PlanEntry {
  id: string; weekNumber: number; year: number; date: string; dayName: string;
  activityType: string; team: string | null; equipment: string | null; room: string | null;
  productName: string | null; lotNumber: string | null; plannedQuantity: number | null;
  plannedUnit: string | null; specialActivity: string | null; validationStatus: string;
  importedAt: string; sourceFileName: string;
}

type EntryForm = {
  date: string; activityType: string; productName: string; lotNumber: string;
  plannedQuantity: string; plannedUnit: string; specialActivity: string; team: string;
};

const EMPTY_FORM: EntryForm = {
  date: new Date().toISOString().slice(0, 10),
  activityType: "Conditionnement primaire",
  productName: "", lotNumber: "", plannedQuantity: "", plannedUnit: "UN",
  specialActivity: "", team: "",
};

function activityBadge(activity: string) {
  const cls = ACTIVITY_COLORS[activity] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap", cls)}>
      {ACTIVITY_SHORT[activity] ?? activity}
    </span>
  );
}

function WeekBadge({ week, year }: { week: number; year: number }) {
  return (
    <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full">
      <Calendar className="h-3.5 w-3.5" /> S{week} — {year}
    </span>
  );
}

function validationBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-slate-500/20 text-slate-400",
    validated: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-red-400",
  };
  const lbl: Record<string, string> = { pending: "En attente", validated: "Validé", rejected: "Rejeté" };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", map[status] ?? "")}>{lbl[status] ?? status}</span>;
}

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) onFile(f);
  }, [onFile]);
  return (
    <label
      className={cn("flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50")}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
      <div className="text-center">
        <p className="font-medium text-sm">Déposer le fichier Excel ici</p>
        <p className="text-xs text-muted-foreground mt-1">ou cliquer pour sélectionner — .xlsx, .xls</p>
      </div>
      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </label>
  );
}

function EntryDialog({
  open, onOpenChange, entry, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: EntryForm | null;
  onSave: (form: EntryForm) => Promise<void>;
}) {
  const [form, setForm] = useState<EntryForm>(entry ?? EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isSpecial = !!form.specialActivity;

  const set = (k: keyof EntryForm) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); onOpenChange(false); } finally { setSaving(false); }
  };

  // Sync form when entry prop changes
  if (entry && open && JSON.stringify(entry) !== JSON.stringify(form) && !saving) {
    // only on open
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Modifier l'entrée" : "Nouvelle entrée de planning"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => set("date")(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Équipe (optionnel)</Label>
              <Input value={form.team} onChange={e => set("team")(e.target.value)} placeholder="Équipe A..." className="h-11" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Type d'activité</Label>
            <Select value={form.activityType} onValueChange={set("activityType")}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map(a => <SelectItem key={a} value={a} className="py-3">{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Activité spéciale (si maintenance / nettoyage)</Label>
            <Input value={form.specialActivity} onChange={e => set("specialActivity")(e.target.value)}
              placeholder="Entretien préventif / Nettoyage…" className="h-11" />
          </div>

          {!isSpecial && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Produit</Label>
                  <Input value={form.productName} onChange={e => set("productName")(e.target.value)}
                    placeholder="Nom du produit" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label>N° Lot</Label>
                  <Input value={form.lotNumber} onChange={e => set("lotNumber")(e.target.value)}
                    placeholder="LOT-001" className="h-11 font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Quantité planifiée</Label>
                  <Input type="number" value={form.plannedQuantity} onChange={e => set("plannedQuantity")(e.target.value)}
                    placeholder="0" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label>Unité</Label>
                  <Input value={form.plannedUnit} onChange={e => set("plannedUnit")(e.target.value)}
                    placeholder="UN / gélules / blisters…" className="h-11" />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button className="h-11 bg-sky-500 hover:bg-sky-400 text-white gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WeekDetailView({ week, year, onClose }: { week: number; year: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<{ id: string; form: EntryForm } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: entries, isLoading } = useQuery<PlanEntry[]>({
    queryKey: ["planning-week-entries", week, year],
    queryFn: () => apiFetch(`/api/planning?week=${week}&year=${year}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["planning-week-entries", week, year] });

  const createMutation = useMutation({
    mutationFn: (form: EntryForm) => apiFetch("/api/planning/entry", {
      method: "POST",
      body: JSON.stringify({
        date: form.date,
        activityType: form.activityType,
        productName: form.productName || null,
        lotNumber: form.lotNumber || null,
        plannedQuantity: form.plannedQuantity ? Number(form.plannedQuantity) : null,
        plannedUnit: form.plannedUnit || null,
        specialActivity: form.specialActivity || null,
        team: form.team || null,
      }),
    }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["planning-weeks"] }); toast({ title: "Entrée ajoutée" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: EntryForm }) => apiFetch(`/api/planning/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        date: form.date,
        activityType: form.activityType,
        productName: form.productName || null,
        lotNumber: form.lotNumber || null,
        plannedQuantity: form.plannedQuantity ? Number(form.plannedQuantity) : null,
        plannedUnit: form.plannedUnit || null,
        specialActivity: form.specialActivity || null,
        team: form.team || null,
      }),
    }),
    onSuccess: () => { invalidate(); toast({ title: "Entrée modifiée" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/planning/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["planning-weeks"] }); setDeleteConfirm(null); toast({ title: "Entrée supprimée" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const byDay = entries?.reduce<Record<string, PlanEntry[]>>((acc, e) => {
    const key = `${e.dayName} ${e.date}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {}) ?? {};

  const openAdd = () => {
    // Pre-fill date to first day of week
    setEditEntry(null);
    setDialogOpen(true);
  };

  const openEdit = (e: PlanEntry) => {
    setEditEntry({
      id: e.id,
      form: {
        date: e.date,
        activityType: e.activityType,
        productName: e.productName ?? "",
        lotNumber: e.lotNumber ?? "",
        plannedQuantity: e.plannedQuantity != null ? String(e.plannedQuantity) : "",
        plannedUnit: e.plannedUnit ?? "UN",
        specialActivity: e.specialActivity ?? "",
        team: e.team ?? "",
      },
    });
    setDialogOpen(true);
  };

  const handleSave = async (form: EntryForm) => {
    if (editEntry) {
      await updateMutation.mutateAsync({ id: editEntry.id, form });
    } else {
      await createMutation.mutateAsync(form);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
          <WeekBadge week={week} year={year} />
          <span className="text-sm text-muted-foreground">{entries?.length ?? 0} entrées</span>
        </div>
        <Button onClick={openAdd} size="sm" className="h-9 gap-2 bg-sky-500 hover:bg-sky-400 text-white">
          <Plus className="h-3.5 w-3.5" /> Ajouter une entrée
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
          <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
        </div>
      ) : !entries?.length ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Aucune entrée pour cette semaine
        </div>
      ) : (
        <div>
          {Object.entries(byDay).map(([dayKey, dayEntries]) => (
            <div key={dayKey} className="border-b border-border last:border-0">
              {/* Day header */}
              <div className="px-5 py-2.5 bg-muted/30 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide capitalize">
                  {dayKey}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">{dayEntries.length} activité{dayEntries.length > 1 ? "s" : ""}</span>
              </div>

              {/* Entries table */}
              <table className="w-full text-sm">
                <tbody>
                  {dayEntries.map(e => (
                    <tr key={e.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-3 w-36">
                        {activityBadge(e.activityType)}
                      </td>
                      <td className="px-3 py-3">
                        {e.specialActivity ? (
                          <span className="text-amber-400 flex items-center gap-1.5 text-sm">
                            <Wrench className="h-3.5 w-3.5 shrink-0" /> {e.specialActivity}
                          </span>
                        ) : (
                          <div>
                            <span className="font-medium">{e.productName ?? <span className="text-muted-foreground italic">Sans produit</span>}</span>
                            {e.lotNumber && (
                              <span className="ml-2 font-mono text-xs text-muted-foreground">Lot {e.lotNumber}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {e.plannedQuantity != null ? (
                          <span className="font-mono text-xs font-medium text-primary">
                            {Number(e.plannedQuantity).toLocaleString("fr-FR")} {e.plannedUnit ?? ""}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {validationBadge(e.validationStatus)}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {e.team && <span className="text-xs text-muted-foreground mr-2">{e.team}</span>}
                        <span className="text-xs text-muted-foreground">{e.sourceFileName === "Saisie manuelle" ? "✏️ Manuel" : ""}</span>
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {deleteConfirm === e.id ? (
                            <>
                              <span className="text-xs text-red-400 mr-1">Supprimer ?</span>
                              <button
                                className="h-7 px-2 rounded bg-red-500 text-white text-xs font-medium hover:bg-red-600"
                                onClick={() => deleteMutation.mutate(e.id)}
                              >Oui</button>
                              <button
                                className="h-7 px-2 rounded border border-border text-xs hover:bg-muted"
                                onClick={() => setDeleteConfirm(null)}
                              >Non</button>
                            </>
                          ) : (
                            <>
                              <button
                                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                                onClick={() => openEdit(e)}
                                title="Modifier"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                                onClick={() => setDeleteConfirm(e.id)}
                                title="Supprimer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <EntryDialog
        open={dialogOpen}
        onOpenChange={open => { setDialogOpen(open); if (!open) setEditEntry(null); }}
        entry={editEntry?.form ?? null}
        onSave={handleSave}
      />
    </div>
  );
}

export default function PlanningPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [selectedWeek, setSelectedWeek] = useState<{ weekNumber: number; year: number } | null>(null);

  const { data: weeks, isLoading: weeksLoading } = useQuery<PlanWeek[]>({
    queryKey: ["planning-weeks"],
    queryFn: () => apiFetch("/api/planning/weeks"),
  });

  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${BASE}/api/planning/parse`, { method: "POST", headers, body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error); }
      return res.json() as Promise<ParseResult>;
    },
    onSuccess: data => {
      setPreview(data);
      toast({ title: `Fichier analysé : S${data.weekNumber} ${data.year}`, description: `${data.rows.length} activités détectées` });
    },
    onError: (err: Error) => toast({ title: "Erreur de lecture", description: err.message, variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: () => apiFetch<{ imported: number }>("/api/planning/import", {
      method: "POST",
      body: JSON.stringify({ rows: preview!.rows, fileName: preview!.fileName }),
    }),
    onSuccess: data => {
      toast({ title: "Planning importé", description: `${data.imported} entrées enregistrées` });
      const week = { weekNumber: preview!.weekNumber, year: preview!.year };
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["planning-weeks"] });
      setSelectedWeek(week);
    },
    onError: (err: Error) => toast({ title: "Erreur d'import", description: err.message, variant: "destructive" }),
  });

  // Group rows by day for preview display
  const byDay = preview ? preview.rows.reduce<Record<string, PlanRow[]>>((acc, r) => {
    const key = `${r.dayName} ${r.date}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {}) : {};

  const toggleDay = (key: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const productionRows = preview?.rows.filter(r => !r.specialActivity) ?? [];
  const specialRows = preview?.rows.filter(r => r.specialActivity) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Planning de Production</h1>
        <p className="text-sm text-muted-foreground">Import Excel et gestion manuelle des plannings hebdomadaires</p>
      </div>

      {/* Week detail view (when a week is selected) */}
      {selectedWeek && !preview && (
        <WeekDetailView
          week={selectedWeek.weekNumber}
          year={selectedWeek.year}
          onClose={() => setSelectedWeek(null)}
        />
      )}

      {/* Weeks list */}
      {!preview && !selectedWeek && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Semaines importées</h2>
          </div>
          {weeksLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-5">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : !weeks?.length ? (
            <p className="text-sm text-muted-foreground p-5">Aucun planning importé pour l'instant.</p>
          ) : (
            <div className="divide-y divide-border">
              {weeks.map(w => (
                <button
                  key={`${w.weekNumber}-${w.year}`}
                  onClick={() => setSelectedWeek({ weekNumber: w.weekNumber, year: w.year })}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors text-left group"
                >
                  <WeekBadge week={w.weekNumber} year={w.year} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground truncate">{w.sourceFileName}</div>
                    <div className="text-xs text-muted-foreground">{new Date(w.importedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} — {w.entryCount} entrée{w.entryCount > 1 ? "s" : ""}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload zone */}
      {!preview && !selectedWeek && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4 text-muted-foreground uppercase tracking-wide">Importer un nouveau planning Excel</h2>
          {parseMutation.isPending ? (
            <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span>Analyse du fichier en cours…</span>
            </div>
          ) : (
            <DropZone onFile={f => parseMutation.mutate(f)} />
          )}
        </div>
      )}

      {/* Preview after Excel parsing */}
      {preview && (
        <div className="space-y-4">
          {/* Preview header */}
          <div className="bg-card border border-border rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <WeekBadge week={preview.weekNumber} year={preview.year} />
              <span className="text-sm text-muted-foreground">{preview.fileName}</span>
              <span className="text-sm font-medium">{productionRows.length} activités production</span>
              {specialRows.length > 0 && <span className="text-sm text-amber-500">{specialRows.length} maintenance/nettoyage</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>Annuler</Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
                className="gap-2 bg-sky-500 hover:bg-sky-400 text-white"
              >
                {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Confirmer l'import
              </Button>
            </div>
          </div>

          {/* Anomalies */}
          {preview.anomalies.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="font-semibold text-amber-500 text-sm">{preview.anomalies.length} anomalie{preview.anomalies.length > 1 ? "s" : ""} détectée{preview.anomalies.length > 1 ? "s" : ""}</span>
              </div>
              <ul className="space-y-1">
                {preview.anomalies.map((a, i) => (
                  <li key={i} className="text-sm text-amber-400 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">•</span> <span>{a}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-500/70 mt-3">Vous pouvez quand même importer — vous pourrez ensuite modifier les entrées manuellement.</p>
            </div>
          )}

          {/* Planning preview table by day */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Aperçu du planning — {preview.rows.length} entrées</span>
            </div>
            <div className="divide-y divide-border">
              {Object.entries(byDay).map(([dayKey, rows]) => {
                const expanded = expandedDays.has(dayKey);
                const prodRows = rows.filter(r => !r.specialActivity);
                const specRows = rows.filter(r => r.specialActivity);
                return (
                  <div key={dayKey}>
                    <button
                      onClick={() => toggleDay(dayKey)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium text-sm capitalize">{dayKey}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{prodRows.length} prod · {specRows.length} maint.</span>
                    </button>
                    {expanded && (
                      <div className="px-5 pb-4 space-y-2">
                        {rows.map((r, i) => (
                          <div key={i} className={cn(
                            "flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm",
                            r.specialActivity ? "bg-slate-500/10 border border-slate-500/20" : "bg-muted/40 border border-border"
                          )}>
                            {activityBadge(r.activityType)}
                            {r.team && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{r.team}</span>}
                            {r.specialActivity ? (
                              <span className="text-amber-400 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {r.specialActivity}</span>
                            ) : (
                              <>
                                <span className="font-medium">{r.productName}</span>
                                {r.lotNumber && <span className="text-muted-foreground">Lot: <span className="font-mono text-xs">{r.lotNumber}</span></span>}
                                {r.plannedQuantity && <span className="text-primary font-medium">{r.plannedQuantity.toLocaleString("fr-FR")} {r.plannedUnit}</span>}
                                {r.equipment && <span className="text-xs text-muted-foreground">{r.equipment}</span>}
                              </>
                            )}
                            {!r.specialActivity && r.lotNumber && <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto" />}
                            {!r.specialActivity && !r.lotNumber && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 ml-auto" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
