import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  BookOpen,
  Loader2,
  Info,
  Building2,
  Cpu,
  CalendarDays,
  LayoutList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiLabel } from "@/components/KpiLabel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useListEquipments, customFetch, useListRooms } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyEntry {
  id: string;
  equipmentId: string;
  equipmentName: string | null;
  entryDate: string;
  tOpeningMin: number;
  pauseMin: number;
  chsgMin: number;
  aprMin: number;
  mqchMin: number;
  notes: string | null;
  status: "draft" | "validated";
  createdByName: string | null;
  validatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tT: number;
  tO: number;
  fermetureMin: number;
  tAP: number;
  tR: number;
}

interface MonthlySummary {
  year: number;
  month: number;
  equipmentId: string;
  daysInMonth: number;
  daysWithEntries: number;
  daysWithTO: number;
  daysClosure: number;
  daysNoProduction: number;
  totalTT: number;
  totalTO: number;
  totalFermeture: number;
  totalTAP: number;
  totalTR: number;
  days: DailyEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7);
}

// ─── Form dialog ─────────────────────────────────────────────────────────────

interface EntryFormData {
  tOpeningMin: string;
  pauseMin: string;
  chsgMin: string;
  aprMin: string;
  mqchMin: string;
  notes: string;
}

interface EntryDialogProps {
  open: boolean;
  onClose: () => void;
  entry?: DailyEntry | null;
  defaultDate?: string;
  equipmentId: string;
  onSaved: () => void;
}

function EntryDialog({
  open,
  onClose,
  entry,
  defaultDate,
  equipmentId,
  onSaved,
}: EntryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEdit = !!entry;

  const [form, setForm] = useState<EntryFormData>(() => ({
    tOpeningMin: String(entry?.tOpeningMin ?? 540),
    pauseMin: String(entry?.pauseMin ?? 0),
    chsgMin: String(entry?.chsgMin ?? 0),
    aprMin: String(entry?.aprMin ?? 0),
    mqchMin: String(entry?.mqchMin ?? 0),
    notes: entry?.notes ?? "",
  }));

  const set =
    (k: keyof EntryFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
    };

  const tO = Math.max(0, parseInt(form.tOpeningMin) || 0);
  const pause = Math.max(0, parseInt(form.pauseMin) || 0);
  const chsg = Math.max(0, parseInt(form.chsgMin) || 0);
  const apr = Math.max(0, parseInt(form.aprMin) || 0);
  const mqch = Math.max(0, parseInt(form.mqchMin) || 0);
  const tAP = pause + chsg + apr + mqch;
  const tR = Math.max(0, tO - tAP);
  const fermeture = 1440 - tO;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tOpeningMin: tO,
        pauseMin: pause,
        chsgMin: chsg,
        aprMin: apr,
        mqchMin: mqch,
        notes: form.notes.trim() || null,
      };
      if (isEdit) {
        return customFetch(`/api/daily-entries/${entry!.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return customFetch("/api/daily-entries", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          equipmentId,
          entryDate: defaultDate ?? todayISO(),
        }),
      });
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Fiche mise à jour" : "Fiche créée" });
      queryClient.invalidateQueries({ queryKey: ["daily-entries"] });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/daily-entries/${entry!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "validated" }),
      }),
    onSuccess: () => {
      toast({ title: "Fiche validée" });
      queryClient.invalidateQueries({ queryKey: ["daily-entries"] });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const isSupervisor = user?.role === "supervisor" || user?.role === "admin";
  const canValidate = isEdit && entry?.status === "draft" && isSupervisor;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-sky-600" />
            {isEdit ? "Modifier la fiche" : "Nouvelle fiche journalière"}
          </DialogTitle>
          {isEdit && (
            <p className="text-sm text-muted-foreground">
              {new Date(entry!.entryDate + "T00:00:00").toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              {entry?.status === "validated" && (
                <Badge variant="default" className="ml-2 bg-emerald-600">
                  Validée
                </Badge>
              )}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-sm font-medium">Temps d'ouverture tO (min)</Label>
              <Input
                type="number"
                min="0"
                max="1440"
                value={form.tOpeningMin}
                onChange={set("tOpeningMin")}
                placeholder="ex: 540"
                className="mt-1"
                disabled={entry?.status === "validated"}
              />
              <p className="text-xs text-muted-foreground mt-1">
                = {fmtMin(tO)} ouverture · {fmtMin(fermeture)} fermeture
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium">Pause (min)</Label>
              <Input
                type="number"
                min="0"
                max="1440"
                value={form.pauseMin}
                onChange={set("pauseMin")}
                className="mt-1"
                disabled={entry?.status === "validated"}
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Changement de série (min)</Label>
              <Input
                type="number"
                min="0"
                max="1440"
                value={form.chsgMin}
                onChange={set("chsgMin")}
                className="mt-1"
                disabled={entry?.status === "validated"}
              />
            </div>
            <div>
              <Label className="text-sm font-medium">APR (min)</Label>
              <Input
                type="number"
                min="0"
                max="1440"
                value={form.aprMin}
                onChange={set("aprMin")}
                className="mt-1"
                disabled={entry?.status === "validated"}
              />
            </div>
            <div>
              <Label className="text-sm font-medium">MQCH (min)</Label>
              <Input
                type="number"
                min="0"
                max="1440"
                value={form.mqchMin}
                onChange={set("mqchMin")}
                className="mt-1"
                disabled={entry?.status === "validated"}
              />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 px-4 py-3 grid grid-cols-3 gap-3 text-sm">
            <div className="text-center">
              <div className="text-xs text-muted-foreground font-medium">
                <KpiLabel kpi="tO" showIcon={false} />
              </div>
              <div className="font-semibold text-sky-600">{fmtMin(tO)}</div>
              <div className="text-xs text-muted-foreground">{tO} min</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground font-medium">
                <KpiLabel kpi="tAP" showIcon={false} />
              </div>
              <div className="font-semibold text-amber-600">{fmtMin(tAP)}</div>
              <div className="text-xs text-muted-foreground">{tAP} min</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground font-medium">
                <KpiLabel kpi="tR" showIcon={false} />
              </div>
              <div className={cn("font-semibold", tR > 0 ? "text-emerald-600" : "text-red-500")}>
                {fmtMin(tR)}
              </div>
              <div className="text-xs text-muted-foreground">{tR} min</div>
            </div>
          </div>

          {tAP > tO && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              tAP ({tAP} min) dépasse tO ({tO} min) — vérifiez les valeurs
            </div>
          )}

          <div>
            <Label className="text-sm font-medium">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={set("notes")}
              placeholder="Observations, incidents journaliers…"
              rows={2}
              className="mt-1 text-sm resize-none"
              disabled={entry?.status === "validated"}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {canValidate && (
            <Button
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 text-white sm:mr-auto"
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
            >
              {validateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Valider la fiche
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          {entry?.status !== "validated" && (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || tO <= 0}
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isEdit ? "Enregistrer" : "Créer la fiche"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteDialog({
  entry,
  onClose,
  onDeleted,
}: {
  entry: DailyEntry;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => customFetch(`/api/daily-entries/${entry.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Fiche supprimée" });
      queryClient.invalidateQueries({ queryKey: ["daily-entries"] });
      onDeleted();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Supprimer la fiche ?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Fiche du{" "}
          {new Date(entry.entryDate + "T00:00:00").toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
          })}
          . Cette action est irréversible.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCards({ summary }: { summary: MonthlySummary }) {
  const completionPct = Math.round((summary.daysWithEntries / summary.daysInMonth) * 100);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl border bg-card p-4 text-center shadow-sm">
        <div className="text-xs text-muted-foreground font-medium mb-1">Jours saisis</div>
        <div className="text-2xl font-bold text-sky-600">{summary.daysWithEntries}</div>
        <div className="text-xs text-muted-foreground">/ {summary.daysInMonth} jours</div>
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4 text-center shadow-sm">
        <div className="text-xs text-muted-foreground font-medium mb-1">Σ tO mensuel</div>
        <div className="text-2xl font-bold">{fmtMin(summary.totalTO)}</div>
        <div className="text-xs text-muted-foreground">{summary.totalTO} min</div>
      </div>
      <div className="rounded-xl border bg-card p-4 text-center shadow-sm">
        <div className="text-xs text-muted-foreground font-medium mb-1">Σ tAP mensuel</div>
        <div className="text-2xl font-bold text-amber-600">{fmtMin(summary.totalTAP)}</div>
        <div className="text-xs text-muted-foreground">{summary.totalTAP} min</div>
      </div>
      <div className="rounded-xl border bg-card p-4 text-center shadow-sm">
        <div className="text-xs text-muted-foreground font-medium mb-1">Σ tR mensuel</div>
        <div
          className={cn(
            "text-2xl font-bold",
            summary.totalTR > 0 ? "text-emerald-600" : "text-muted-foreground",
          )}
        >
          {fmtMin(summary.totalTR)}
        </div>
        <div className="text-xs text-muted-foreground">{summary.totalTR} min</div>
      </div>
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────────────────────────

function CalendarView({
  year,
  month,
  summary,
  isLoading,
  equipmentId,
  onOpenCreate,
  onOpenEdit,
  onDeleteEntry,
}: {
  year: number;
  month: number;
  summary: MonthlySummary | undefined;
  isLoading: boolean;
  equipmentId: string;
  onOpenCreate: (date: string) => void;
  onOpenEdit: (entry: DailyEntry) => void;
  onDeleteEntry: (entry: DailyEntry) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  const entryByDate = useMemo(() => {
    const map = new Map<string, DailyEntry>();
    if (summary?.days) {
      for (const d of summary.days) map.set(d.entryDate, d as DailyEntry);
    }
    return map;
  }, [summary]);

  const calendarCells: Array<{
    date: string;
    day: number;
    weekNum: number;
    isWeekend: boolean;
  } | null> = useMemo(() => {
    const cells: Array<{ date: string; day: number; weekNum: number; isWeekend: boolean } | null> =
      [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayOfWeek = (firstDayOfWeek + d - 1) % 7; // 0=Mon, 6=Sun
      cells.push({
        date,
        day: d,
        weekNum: getWeekNumber(new Date(year, month - 1, d)),
        isWeekend: dayOfWeek >= 5, // Sat=5, Sun=6
      });
    }
    const trailing = (7 - (cells.length % 7)) % 7;
    for (let i = 0; i < trailing; i++) cells.push(null);
    return cells;
  }, [year, month, daysInMonth, firstDayOfWeek]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!equipmentId) return null;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={cn(
              "py-2 text-center text-xs font-medium",
              i >= 5 ? "text-muted-foreground/50" : "text-muted-foreground",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {calendarCells.map((cell, idx) => {
          if (!cell) {
            return (
              <div
                key={`empty-${idx}`}
                className="min-h-[72px] border-b border-r border-border/40 bg-muted/10"
              />
            );
          }

          const entry = entryByDate.get(cell.date);
          const isToday = cell.date === todayISO();
          const isPast = cell.date < todayISO();

          return (
            <div
              key={cell.date}
              onClick={() => {
                if (entry) onOpenEdit(entry);
                else if (isPast || isToday) onOpenCreate(cell.date);
              }}
              className={cn(
                "min-h-[72px] border-b border-r border-border/40 p-1.5 flex flex-col cursor-pointer transition-colors select-none",
                cell.isWeekend && !entry && "bg-muted/20",
                entry?.status === "validated" &&
                  "bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
                entry?.status === "draft" &&
                  "bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30",
                !entry && (isPast || isToday) && "hover:bg-muted/30",
                isToday && "ring-2 ring-inset ring-sky-400",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                    isToday
                      ? "bg-sky-500 text-white"
                      : cell.isWeekend
                        ? "text-muted-foreground/60"
                        : "text-foreground",
                  )}
                >
                  {cell.day}
                </span>
                {entry && (
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenEdit(entry)}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {entry.status !== "validated" && (
                      <button
                        onClick={() => onDeleteEntry(entry)}
                        className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
                {!entry && (isPast || isToday) && (
                  <div className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors">
                    <Plus className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>

              {entry ? (
                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center gap-1">
                    {entry.status === "validated" ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                    ) : (
                      <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                    <span
                      className={cn(
                        "font-medium text-[10px]",
                        entry.status === "validated"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {entry.status === "validated" ? "Validée" : "Brouillon"}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    tR <span className="font-semibold text-foreground">{fmtMin(entry.tR)}</span>
                  </div>
                  <div className="text-muted-foreground text-[10px]">tO {fmtMin(entry.tO)}</div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  {!isPast && !isToday && (
                    <span className="text-[10px] text-muted-foreground/30">futur</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({
  summary,
  isLoading,
  onOpenEdit,
  onOpenCreate,
  onDeleteEntry,
}: {
  summary: MonthlySummary | undefined;
  isLoading: boolean;
  onOpenEdit: (entry: DailyEntry) => void;
  onOpenCreate: (date: string) => void;
  onDeleteEntry: (entry: DailyEntry) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
      </div>
    );
  }

  const entries = summary?.days ?? [];
  const today = todayISO();

  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Aucune fiche ce mois-ci — cliquez sur un jour dans le calendrier pour commencer
        </div>
      )}
      {entries.map((e) => (
        <div
          key={e.id}
          className={cn(
            "rounded-xl border p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-primary/40 transition-colors",
            e.status === "validated"
              ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-500/20"
              : "bg-card border-border",
          )}
          onClick={() => onOpenEdit(e)}
        >
          <div className="min-w-0">
            <div className="font-medium text-sm">
              {new Date(e.entryDate + "T00:00:00").toLocaleDateString("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "long",
              })}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              tR <span className="font-semibold text-foreground">{fmtMin(e.tR)}</span> · tO{" "}
              {fmtMin(e.tO)} · tAP {fmtMin(e.tAP)}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border font-medium",
                e.status === "validated"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 border-amber-500/20",
              )}
            >
              {e.status === "validated" ? "Validée" : "Brouillon"}
            </span>
            {e.entryDate <= today && e.status !== "validated" && (
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDeleteEntry(e);
                }}
                className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Equipment selector with room hierarchy ────────────────────────────────────

function EquipmentSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: rooms, isLoading } = useListRooms();
  const ALL_ROOMS = "__all__";
  const [selectedRoom, setSelectedRoom] = useState<string>(ALL_ROOMS);

  const productionRooms = useMemo(
    () => (rooms ?? []).filter((r) => r.equipments.length > 0),
    [rooms],
  );

  const roomEquipments = useMemo(
    () =>
      selectedRoom && selectedRoom !== ALL_ROOMS
        ? ((rooms ?? []).find((r) => r.id === selectedRoom)?.equipments ?? [])
        : (rooms ?? []).flatMap((r) => r.equipments),
    [rooms, selectedRoom],
  );

  if (isLoading) return <div className="text-sm text-muted-foreground">Chargement…</div>;

  return (
    <div className="flex gap-2">
      {productionRooms.length > 1 && (
        <Select value={selectedRoom} onValueChange={setSelectedRoom}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Local…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ROOMS}>Tous</SelectItem>
            {productionRooms.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                <span className="font-mono text-muted-foreground text-xs mr-1">{r.code}</span>
                {r.name.split(" ")[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="min-w-[200px]">
          <SelectValue placeholder="Choisir un équipement" />
        </SelectTrigger>
        <SelectContent>
          {roomEquipments.map((eq) => (
            <SelectItem key={eq.id} value={eq.id}>
              <span className="font-mono text-muted-foreground text-xs mr-1">[{eq.code}]</span>
              {eq.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DailyEntriesPage() {
  const queryClient = useQueryClient();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [displayMode, setDisplayMode] = useState<"calendar" | "list">("calendar");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<DailyEntry | null>(null);
  const [newEntryDate, setNewEntryDate] = useState<string | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<DailyEntry | null>(null);

  const { data: summary, isLoading } = useQuery<MonthlySummary>({
    queryKey: ["daily-entries", "summary", equipmentId, year, month],
    queryFn: () =>
      customFetch<MonthlySummary>(
        `/api/daily-entries/monthly-summary?equipmentId=${equipmentId}&year=${year}&month=${month}`,
      ),
    enabled: !!equipmentId,
  });

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  }

  function openCreate(date: string) {
    setEditEntry(null);
    setNewEntryDate(date);
    setDialogOpen(true);
  }
  function openEdit(entry: DailyEntry) {
    setEditEntry(entry);
    setNewEntryDate(null);
    setDialogOpen(true);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-sky-600" />
            Fiches Journalières
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Saisie des temps journaliers (tO, arrêts planifiés, tR) par équipement
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <EquipmentSelector value={equipmentId} onChange={setEquipmentId} />
        </div>
      </div>

      {/* ── Empty state — no equipment selected ────────────── */}
      {!equipmentId && (
        <div className="rounded-2xl border border-dashed border-border p-14 text-center space-y-4">
          <div className="flex justify-center gap-4 opacity-40">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <Cpu className="h-10 w-10 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-lg text-muted-foreground">
              Sélectionnez un équipement
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Choisissez d'abord le local puis l'équipement pour afficher les fiches du mois.
            </p>
          </div>
        </div>
      )}

      {equipmentId && (
        <>
          {/* ── Month navigation ───────────────────────────── */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">
                {MONTH_LABELS[month - 1]} {year}
              </h2>
              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setDisplayMode("calendar")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                    displayMode === "calendar"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" /> Calendrier
                </button>
                <button
                  onClick={() => setDisplayMode("list")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                    displayMode === "list"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <LayoutList className="h-3.5 w-3.5" /> Liste
                </button>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* ── Monthly KPI cards ──────────────────────────── */}
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
            </div>
          ) : summary ? (
            <KpiCards summary={summary} />
          ) : (
            <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm">
              Aucune donnée pour ce mois
            </div>
          )}

          {/* ── Calendar or List ────────────────────────────── */}
          {displayMode === "calendar" ? (
            <CalendarView
              year={year}
              month={month}
              summary={summary}
              isLoading={isLoading}
              equipmentId={equipmentId}
              onOpenCreate={openCreate}
              onOpenEdit={openEdit}
              onDeleteEntry={setDeleteEntry}
            />
          ) : (
            <ListView
              summary={summary}
              isLoading={isLoading}
              onOpenEdit={openEdit}
              onOpenCreate={openCreate}
              onDeleteEntry={setDeleteEntry}
            />
          )}

          {/* ── Legend ─────────────────────────────────────── */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-200 dark:bg-emerald-800 border border-emerald-300 dark:border-emerald-700" />
              Fiche validée
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-200 dark:bg-amber-800 border border-amber-300 dark:border-amber-700" />
              Brouillon
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-background border border-border" />
              Non saisi
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <Info className="h-3.5 w-3.5" />
              tR = tO − (Pause + CHSG + APR + MQCH) — dénominateur du TRS mensuel
            </div>
          </div>
        </>
      )}

      {/* ── Dialogs ────────────────────────────────────────── */}
      {dialogOpen && equipmentId && (
        <EntryDialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setEditEntry(null);
          }}
          entry={editEntry}
          defaultDate={newEntryDate ?? todayISO()}
          equipmentId={equipmentId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["daily-entries"] })}
        />
      )}

      {deleteEntry && (
        <DeleteDialog
          entry={deleteEntry}
          onClose={() => setDeleteEntry(null)}
          onDeleted={() => queryClient.invalidateQueries({ queryKey: ["daily-entries"] })}
        />
      )}
    </div>
  );
}
