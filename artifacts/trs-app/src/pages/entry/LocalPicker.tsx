import { useMemo } from "react";
import { useListRooms, useListProductionEntries } from "@workspace/api-client-react";
import type { Room } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Building2, ArrowRight } from "lucide-react";

export function LocalPicker({ onSelect }: { onSelect: (room: Room) => void }) {
  const { data: rooms, isLoading } = useListRooms();
  const today = new Date().toISOString().split("T")[0];
  const { data: entries } = useListProductionEntries({ dateFrom: today, dateTo: today });

  const activeEquipIds = useMemo(
    () => new Set((entries ?? []).filter((e) => e.status === "draft").map((e) => e.equipmentId)),
    [entries],
  );

  const productionRooms = useMemo(
    () => (rooms ?? []).filter((r) => r.equipments.length > 0),
    [rooms],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Chargement des locaux…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Sélectionner un local</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {productionRooms.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-medium text-muted-foreground">Aucun local disponible</p>
          <p className="text-sm text-muted-foreground mt-1">
            Contactez l'administrateur pour configurer les locaux.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {productionRooms.map((room) => {
            const hasActive = room.equipments.some((e) => activeEquipIds.has(e.id));
            return (
              <button
                key={room.id}
                onClick={() => onSelect(room)}
                className={cn(
                  "w-full text-left rounded-2xl border p-4 transition-all hover:border-primary/60 hover:bg-primary/5 group",
                  hasActive ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        hasActive ? "bg-amber-500/20" : "bg-muted",
                      )}
                    >
                      <Building2
                        className={cn(
                          "h-5 w-5",
                          hasActive ? "text-amber-400" : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        <span className="font-mono text-muted-foreground text-xs">{room.code}</span>
                        <span className="truncate">{room.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {room.equipments.length} équipement
                        {room.equipments.length > 1 ? "s" : ""}
                        {room.equipments.map((e) => ` · ${e.code}`).join("")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasActive && (
                      <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
                        En cours
                      </span>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
