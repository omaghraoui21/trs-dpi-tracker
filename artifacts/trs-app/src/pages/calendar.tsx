import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Plus,
  Trash2,
  Pencil,
  CalendarDays,
  AlertTriangle,
  FlaskConical,
  Wrench,
  Ban,
  Sun,
  Loader2,
  Info,
  ChevronLeft,
  ChevronRight,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useListEquipments, customFetch } from "@workspace/api-client-react";

export type CalendarEventType =
  | "CLOSURE"
  | "HOLIDAY"
  | "QUALIFICATION"
  | "TRIAL"
  | "CLEANING_MAJOR";
export type CalendarEventScope = "SITE" | "EQUIPMENT";

export interface CalendarEvent {
  id: string;
  eventType: CalendarEventType;
  scope: CalendarEventScope;
  label: string;
  dateFrom: string;
  dateTo: string;
  durationMinutesPerDay: number | null;
  allDay: boolean;
  isRecurringAnnual: boolean;
  equipmentId: string | null;
  equipmentName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CalendarImpact {
  year: number;
  month: number;
  daysInMonth: number;
  totalCalendarMinutes: number;
  closureMinutes: number;
  holidayMinutes: number;
  qualificationMinutes: number;
  trialMinutes: number;
  cleaningMajorMinutes: number;
  tODeductionMinutes: number;
  tRDeductionMinutes: number;
  totalTO: number;
  totalTR: number;
  eventsByDate: Record<string, { type: string; label: string }[]>;
  eventCount: number;
}

const EVENT_TYPE_CONFIG: Record<
  CalendarEventType,
  {
    label: string;
    shortLabel: string;
    color: string;
    bg: string;
    border: string;
    icon: React.ReactNode;
    impact: string;
  }
> = {
  CLOSURE: {
    label: "Fermeture",
    shortLabel: "Fermeture",
    color: "text-slate-300",
    bg: "bg-slate-700/60",
    border: "border-slate-600",
    icon: <Ban className="h-3.5 w-3.5" />,
    impact: "Réduit tO (Temps d'ouverture)",
  },
  HOLIDAY: {
    label: "Jour férié",
    shortLabel: "Férié",
    color: "text-violet-300",
    bg: "bg-violet-900/40",
    border: "border-violet-700",
    icon: <Sun className="h-3.5 w-3.5" />,
    impact: "Réduit tO (Temps d'ouverture)",
  },
  QUALIFICATION: {
    label: "Qualification / Validation",
    shortLabel: "Qualif.",
    color: "text-amber-300",
    bg: "bg-amber-900/30",
    border: "border-amber-700",
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    impact: "Réduit tR (Temps requis) depuis tO",
  },
  TRIAL: {
    label: "Essai (TO / TR / Technologique)",
    shortLabel: "Essai",
    color: "text-sky-300",
    bg: "bg-sky-900/30",
    border: "border-sky-700",
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    impact: "Réduit tR (Temps requis) depuis tO",
  },
  CLEANING_MAJOR: {
    label: "Nettoyage / Désinfection majeur",
    shortLabel: "Nettoyage",
    color: "text-cyan-300",
    bg: "bg-cyan-900/30",
    border: "border-cyan-700",
    icon: <Wrench className="h-3.5 w-3.5" />,
    impact: "Réduit tR (Temps requis) depuis tO",
  },
};

const MONTHS_FR = [
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

type EventForm = {
  eventType: CalendarEventType;
  scope: CalendarEventScope;
  label: string;
  dateFrom: string;
  dateTo: string;
  durationMinutesPerDay: string;
  allDay: boolean;
  isRecurringAnnual: boolean;
  equipmentId: string;
  notes: string;
};

const EMPTY_FORM: EventForm = {
  eventType: "CLOSURE",
  scope: "SITE",
  label: "",
  dateFrom: new Date().toISOString().slice(0, 10),
  dateTo: new Date().toISOString().slice(0, 10),
  durationMinutesPerDay: "",
  allDay: true,
  isRecurringAnnual: false,
  equipmentId: "",
  notes: "",
};

function EventFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  equipments,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: EventForm | null;
  onSave: (f: EventForm) => Promise<void>;
  equipments: { id: string; name: string }[];
}) {
  const [form, setForm] = useState<EventForm>(initial ?? EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof EventForm) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const cfg = EVENT_TYPE_CONFIG[form.eventType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {cfg.icon}
            {initial ? "Modifier l'événement" : "Nouvel événement calendaire"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <Label className="mb-1.5 block text-sm">Type d'événement</Label>
            <Select value={form.eventType} onValueChange={(v) => set("eventType")(v)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(EVENT_TYPE_CONFIG) as [
                    CalendarEventType,
                    (typeof EVENT_TYPE_CONFIG)[CalendarEventType],
                  ][]
                ).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="py-2.5">
                    <div className="flex flex-col">
                      <span>{v.label}</span>
                      <span className="text-xs text-muted-foreground">{v.impact}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">Libellé</Label>
            <Input
              value={form.label}
              onChange={(e) => set("label")(e.target.value)}
              placeholder="Ex: Fermeture Aïd El Adha, Qualification Blistereuse…"
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-sm">Date début</Label>
              <Input
                type="date"
                value={form.dateFrom}
                onChange={(e) => set("dateFrom")(e.target.value)}
                className="h-10"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">Date fin</Label>
              <Input
                type="date"
                value={form.dateTo}
                onChange={(e) => set("dateTo")(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Journée entière (1 440 min)</p>
              <p className="text-xs text-muted-foreground">
                Désactivez pour saisir une durée partielle
              </p>
            </div>
            <Switch checked={form.allDay} onCheckedChange={(v) => set("allDay")(v)} />
          </div>

          {!form.allDay && (
            <div>
              <Label className="mb-1.5 block text-sm">Durée par jour (minutes)</Label>
              <Input
                type="number"
                min="0"
                max="1440"
                value={form.durationMinutesPerDay}
                onChange={(e) => set("durationMinutesPerDay")(e.target.value)}
                placeholder="Ex: 480 (= 8h)"
                className="h-10"
              />
            </div>
          )}

          <div>
            <Label className="mb-1.5 block text-sm">Périmètre</Label>
            <Select value={form.scope} onValueChange={(v) => set("scope")(v as CalendarEventScope)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SITE" className="py-2.5">
                  Site entier (tous équipements)
                </SelectItem>
                <SelectItem value="EQUIPMENT" className="py-2.5">
                  Équipement spécifique
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.scope === "EQUIPMENT" && (
            <div>
              <Label className="mb-1.5 block text-sm">Équipement</Label>
              <Select value={form.equipmentId} onValueChange={set("equipmentId")}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Sélectionner un équipement" />
                </SelectTrigger>
                <SelectContent>
                  {equipments
                    .filter((e) => (e as unknown as { isActive?: boolean }).isActive !== false)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id} className="py-2.5">
                        {e.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Récurrent (chaque année)</p>
              <p className="text-xs text-muted-foreground">
                Afficher automatiquement les années suivantes
              </p>
            </div>
            <Switch
              checked={form.isRecurringAnnual}
              onCheckedChange={(v) => set("isRecurringAnnual")(v)}
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">Notes (optionnel)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              placeholder="Contexte, référence document…"
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={saving || !form.label || !form.dateFrom || !form.dateTo}
            onClick={handleSave}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function minutesToHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function ImpactCard({ impact }: { impact: CalendarImpact }) {
  const toPercent = (min: number, total: number) =>
    total > 0 ? ((min / total) * 100).toFixed(1) + "%" : "0%";

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-sky-400" />
        <span className="font-semibold text-sm">
          Impact OEE — {MONTHS_FR[impact.month - 1]} {impact.year}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/60 p-3">
          <p className="text-xs text-muted-foreground">tT calendaire</p>
          <p className="font-bold text-lg mt-0.5">{minutesToHours(impact.totalCalendarMinutes)}</p>
          <p className="text-xs text-muted-foreground">{impact.daysInMonth} jours</p>
        </div>
        <div className="rounded-lg bg-sky-900/30 border border-sky-700/50 p-3">
          <p className="text-xs text-sky-300">tO (après fermetures)</p>
          <p className="font-bold text-lg mt-0.5 text-sky-200">{minutesToHours(impact.totalTO)}</p>
          <p className="text-xs text-sky-400">
            −{minutesToHours(impact.tODeductionMinutes)} (
            {toPercent(impact.tODeductionMinutes, impact.totalCalendarMinutes)})
          </p>
        </div>
        <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/50 p-3">
          <p className="text-xs text-emerald-300">tR (après qualif/essais)</p>
          <p className="font-bold text-lg mt-0.5 text-emerald-200">
            {minutesToHours(impact.totalTR)}
          </p>
          <p className="text-xs text-emerald-400">
            −{minutesToHours(impact.tRDeductionMinutes)} (
            {toPercent(impact.tRDeductionMinutes, impact.totalTO)})
          </p>
        </div>
      </div>

      {(impact.closureMinutes > 0 ||
        impact.holidayMinutes > 0 ||
        impact.qualificationMinutes > 0 ||
        impact.trialMinutes > 0 ||
        impact.cleaningMajorMinutes > 0) && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Déductions détaillées
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {impact.closureMinutes > 0 && (
              <div className="flex items-center justify-between bg-slate-700/30 rounded px-2.5 py-1.5">
                <span className="flex items-center gap-1.5">
                  <Ban className="h-3 w-3 text-slate-400" /> Fermetures (→ tO)
                </span>
                <span className="font-mono font-medium">
                  {minutesToHours(impact.closureMinutes)}
                </span>
              </div>
            )}
            {impact.holidayMinutes > 0 && (
              <div className="flex items-center justify-between bg-violet-900/20 rounded px-2.5 py-1.5">
                <span className="flex items-center gap-1.5">
                  <Sun className="h-3 w-3 text-violet-400" /> Jours fériés (→ tO)
                </span>
                <span className="font-mono font-medium">
                  {minutesToHours(impact.holidayMinutes)}
                </span>
              </div>
            )}
            {impact.qualificationMinutes > 0 && (
              <div className="flex items-center justify-between bg-amber-900/20 rounded px-2.5 py-1.5">
                <span className="flex items-center gap-1.5">
                  <FlaskConical className="h-3 w-3 text-amber-400" /> Qualifications (→ tR)
                </span>
                <span className="font-mono font-medium">
                  {minutesToHours(impact.qualificationMinutes)}
                </span>
              </div>
            )}
            {impact.trialMinutes > 0 && (
              <div className="flex items-center justify-between bg-sky-900/20 rounded px-2.5 py-1.5">
                <span className="flex items-center gap-1.5">
                  <FlaskConical className="h-3 w-3 text-sky-400" /> Essais (→ tR)
                </span>
                <span className="font-mono font-medium">{minutesToHours(impact.trialMinutes)}</span>
              </div>
            )}
            {impact.cleaningMajorMinutes > 0 && (
              <div className="flex items-center justify-between bg-cyan-900/20 rounded px-2.5 py-1.5">
                <span className="flex items-center gap-1.5">
                  <Wrench className="h-3 w-3 text-cyan-400" /> Nettoyages (→ tR)
                </span>
                <span className="font-mono font-medium">
                  {minutesToHours(impact.cleaningMajorMinutes)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MonthCalendarGrid({
  year,
  month,
  events,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
}) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7;

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      const start = new Date(ev.dateFrom + "T00:00:00Z");
      const end = new Date(ev.dateTo + "T00:00:00Z");
      const cur = new Date(start);
      while (cur <= end) {
        const key = cur.toISOString().slice(0, 10);
        if (!map[key]) map[key] = [];
        map[key].push(ev);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    return map;
  }, [events]);

  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {days.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const dateStr = day
            ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            : null;
          const dayEvents = dateStr ? (eventsByDate[dateStr] ?? []) : [];
          const isToday = dateStr === new Date().toISOString().slice(0, 10);
          return (
            <div
              key={idx}
              className={cn(
                "min-h-[72px] p-1.5 border-r border-b border-border/50 last:border-r-0",
                !day && "bg-muted/20",
              )}
            >
              {day && (
                <>
                  <div
                    className={cn(
                      "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                      isToday ? "bg-sky-500 text-white" : "text-muted-foreground",
                    )}
                  >
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev, i) => {
                      const cfg = EVENT_TYPE_CONFIG[ev.eventType];
                      return (
                        <div
                          key={i}
                          className={cn(
                            "text-[10px] px-1 py-0.5 rounded truncate font-medium",
                            cfg.bg,
                            cfg.color,
                          )}
                          title={ev.label}
                        >
                          {cfg.shortLabel}
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{dayEvents.length - 3}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<CalendarEventType | "ALL">("ALL");

  const { data: equipments = [] } = useListEquipments();
  const activeEquipments = equipments.filter(
    (e) => (e as unknown as { isActive?: boolean }).isActive !== false,
  );

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["calendar-events", year],
    queryFn: () => customFetch(`/api/calendar-events?year=${year}`),
  });

  const { data: impact } = useQuery<CalendarImpact>({
    queryKey: ["calendar-events-impact", year, month],
    queryFn: () => customFetch(`/api/calendar-events/impact?year=${year}&month=${month}`),
  });

  const monthEvents = useMemo(() => {
    return events.filter((ev) => {
      const start = new Date(ev.dateFrom + "T00:00:00Z");
      const end = new Date(ev.dateTo + "T00:00:00Z");
      const mStart = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`);
      const mEnd = new Date(year, month, 0);
      return start <= mEnd && end >= mStart;
    });
  }, [events, year, month]);

  const filteredMonthEvents = useMemo(
    () =>
      filterType === "ALL" ? monthEvents : monthEvents.filter((e) => e.eventType === filterType),
    [monthEvents, filterType],
  );

  const yearEvents = useMemo(
    () => (filterType === "ALL" ? events : events.filter((e) => e.eventType === filterType)),
    [events, filterType],
  );

  const createMutation = useMutation({
    mutationFn: (form: EventForm) =>
      customFetch<CalendarEvent>("/api/calendar-events", {
        method: "POST",
        body: JSON.stringify({
          eventType: form.eventType,
          scope: form.scope,
          label: form.label,
          dateFrom: form.dateFrom,
          dateTo: form.dateTo,
          durationMinutesPerDay: form.allDay
            ? null
            : form.durationMinutesPerDay
              ? parseInt(form.durationMinutesPerDay)
              : null,
          allDay: form.allDay,
          isRecurringAnnual: form.isRecurringAnnual,
          equipmentId: form.scope === "EQUIPMENT" && form.equipmentId ? form.equipmentId : null,
          notes: form.notes || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      qc.invalidateQueries({ queryKey: ["calendar-events-impact"] });
      toast({ title: "Événement ajouté", description: "Calendrier annuel mis à jour." });
    },
    onError: (err: Error) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: EventForm }) =>
      customFetch<CalendarEvent>(`/api/calendar-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          eventType: form.eventType,
          scope: form.scope,
          label: form.label,
          dateFrom: form.dateFrom,
          dateTo: form.dateTo,
          durationMinutesPerDay: form.allDay
            ? null
            : form.durationMinutesPerDay
              ? parseInt(form.durationMinutesPerDay)
              : null,
          allDay: form.allDay,
          isRecurringAnnual: form.isRecurringAnnual,
          equipmentId: form.scope === "EQUIPMENT" && form.equipmentId ? form.equipmentId : null,
          notes: form.notes || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      qc.invalidateQueries({ queryKey: ["calendar-events-impact"] });
      toast({ title: "Événement modifié." });
      setEditEvent(null);
    },
    onError: (err: Error) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      customFetch<void>(`/api/calendar-events/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      qc.invalidateQueries({ queryKey: ["calendar-events-impact"] });
      setDeleteConfirm(null);
      toast({ title: "Événement supprimé." });
    },
    onError: (err: Error) =>
      toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const handleSave = async (form: EventForm) => {
    if (editEvent) {
      await updateMutation.mutateAsync({ id: editEvent.id, form });
    } else {
      await createMutation.mutateAsync(form);
    }
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditEvent(ev);
    setDialogOpen(true);
  };

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Calendrier Annuel
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fermetures · Jours fériés · Qualifications · Essais · Nettoyages — Impact sur tO et tR
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-10 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)} className="py-2.5">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filterType}
            onValueChange={(v) => setFilterType(v as CalendarEventType | "ALL")}
          >
            <SelectTrigger className="h-10 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="py-2.5">
                Tous les types
              </SelectItem>
              {(
                Object.entries(EVENT_TYPE_CONFIG) as [
                  CalendarEventType,
                  (typeof EVENT_TYPE_CONFIG)[CalendarEventType],
                ][]
              ).map(([k, v]) => (
                <SelectItem key={k} value={k} className="py-2.5">
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setEditEvent(null);
              setDialogOpen(true);
            }}
            className="h-10 gap-2"
          >
            <Plus className="h-4 w-4" /> Nouvel événement
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(
          Object.entries(EVENT_TYPE_CONFIG) as [
            CalendarEventType,
            (typeof EVENT_TYPE_CONFIG)[CalendarEventType],
          ][]
        ).map(([k, v]) => (
          <div
            key={k}
            className={cn(
              "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium",
              v.bg,
              v.color,
              v.border,
            )}
          >
            {v.icon} {v.label}
            <span className="opacity-60 text-[10px]">({v.impact.split(" ")[1]})</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar + Impact — left 2 cols */}
        <div className="xl:col-span-2 space-y-4">
          {/* Month nav */}
          <div className="flex items-center gap-3">
            <button
              onClick={prevMonth}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-base min-w-[140px] text-center">
              {MONTHS_FR[month - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <MonthCalendarGrid year={year} month={month} events={yearEvents} />

          {impact && <ImpactCard impact={impact} />}
        </div>

        {/* Event list — right col */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">
              {MONTHS_FR[month - 1]} {year} — {filteredMonthEvents.length} événement
              {filteredMonthEvents.length !== 1 ? "s" : ""}
            </p>
          </div>

          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && filteredMonthEvents.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Aucun événement ce mois-ci</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cliquez sur "Nouvel événement" pour planifier
              </p>
            </div>
          )}

          {filteredMonthEvents.map((ev) => {
            const cfg = EVENT_TYPE_CONFIG[ev.eventType];
            const isMultiDay = ev.dateFrom !== ev.dateTo;
            return (
              <div
                key={ev.id}
                className={cn("rounded-xl border p-4 space-y-2", cfg.bg, cfg.border)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cfg.color}>{cfg.icon}</span>
                    <div>
                      <p className={cn("text-sm font-semibold leading-tight", cfg.color)}>
                        {ev.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isMultiDay ? `Du ${ev.dateFrom} au ${ev.dateTo}` : ev.dateFrom}
                        {!ev.allDay &&
                          ev.durationMinutesPerDay &&
                          ` · ${minutesToHours(ev.durationMinutesPerDay)}/j`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                      onClick={() => openEdit(ev)}
                      title="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {deleteConfirm === ev.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-400">Supprimer ?</span>
                        <button
                          className="h-6 px-1.5 rounded bg-red-500 text-white text-xs"
                          onClick={() => deleteMutation.mutate(ev.id)}
                        >
                          Oui
                        </button>
                        <button
                          className="h-6 px-1.5 rounded border border-border text-xs"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          Non
                        </button>
                      </div>
                    ) : (
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-500/20 text-red-400 transition-colors"
                        onClick={() => setDeleteConfirm(ev.id)}
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full border text-[11px] font-medium",
                      cfg.bg,
                      cfg.color,
                      cfg.border,
                    )}
                  >
                    {cfg.impact}
                  </span>
                  {ev.scope === "EQUIPMENT" && ev.equipmentName && (
                    <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground text-[11px]">
                      {ev.equipmentName}
                    </span>
                  )}
                  {ev.isRecurringAnnual && (
                    <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground text-[11px]">
                      Récurrent
                    </span>
                  )}
                </div>
                {ev.notes && <p className="text-xs text-muted-foreground italic">{ev.notes}</p>}
              </div>
            );
          })}

          {/* Yearly summary */}
          {events.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 mt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Résumé {year}
              </p>
              {(
                [
                  "CLOSURE",
                  "HOLIDAY",
                  "QUALIFICATION",
                  "TRIAL",
                  "CLEANING_MAJOR",
                ] as CalendarEventType[]
              ).map((t) => {
                const count = events.filter((e) => e.eventType === t).length;
                if (count === 0) return null;
                const cfg = EVENT_TYPE_CONFIG[t];
                return (
                  <div key={t} className="flex items-center justify-between text-xs">
                    <span className={cn("flex items-center gap-1.5", cfg.color)}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <span className="font-medium">
                      {count} événement{count > 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditEvent(null);
        }}
        initial={
          editEvent
            ? {
                eventType: editEvent.eventType,
                scope: editEvent.scope,
                label: editEvent.label,
                dateFrom: editEvent.dateFrom,
                dateTo: editEvent.dateTo,
                durationMinutesPerDay: editEvent.durationMinutesPerDay
                  ? String(editEvent.durationMinutesPerDay)
                  : "",
                allDay: editEvent.allDay,
                isRecurringAnnual: editEvent.isRecurringAnnual,
                equipmentId: editEvent.equipmentId ?? "",
                notes: editEvent.notes ?? "",
              }
            : null
        }
        onSave={handleSave}
        equipments={activeEquipments as { id: string; name: string }[]}
      />
    </div>
  );
}
