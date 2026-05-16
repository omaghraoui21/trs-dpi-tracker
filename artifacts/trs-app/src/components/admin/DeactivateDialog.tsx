/**
 * Shared deactivation confirmation dialog.
 * Shows a dependency count before deactivating a referential item.
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

interface Dependency {
  table: string;
  label: string;
  count: number;
}

interface DeactivateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string; // e.g. "cet équipement"
  entityLabel: string; // e.g. "Géluleuse Harro Höfliger"
  /** URL to fetch dependencies (e.g. "/api/equipments/uuid/dependencies") */
  dependenciesUrl: string;
  onConfirm: () => void;
  loading?: boolean;
}

export function DeactivateDialog({
  open,
  onOpenChange,
  entityName,
  entityLabel,
  dependenciesUrl,
  onConfirm,
  loading,
}: DeactivateDialogProps) {
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [total, setTotal] = useState(0);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFetching(true);
    fetch(`${API_BASE}${dependenciesUrl}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: { dependencies: Dependency[]; total: number }) => {
        setDeps(data.dependencies);
        setTotal(data.total);
      })
      .catch(() => {
        setDeps([]);
        setTotal(0);
      })
      .finally(() => setFetching(false));
  }, [open, dependenciesUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            Désactiver {entityName} ?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <strong className="text-foreground">{entityLabel}</strong> sera désactivé mais jamais
            supprimé.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-2">
          {fetching ? (
            <p className="text-sm text-muted-foreground animate-pulse">
              Vérification des dépendances...
            </p>
          ) : total > 0 ? (
            <>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm">
                <p className="font-medium text-amber-400 mb-1">
                  {total.toLocaleString()} enregistrement{total > 1 ? "s" : ""} lié
                  {total > 1 ? "s" : ""}
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {deps.map((d) => (
                    <li key={d.table}>
                      • {d.label} : <span className="font-mono">{d.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                Ces données resteront intactes. L'élément ne sera plus sélectionnable pour de
                nouvelles saisies.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune donnée liée. La désactivation est sans impact.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            className="h-10 bg-red-600 hover:bg-red-500 text-white"
            onClick={onConfirm}
            disabled={loading || fetching}
          >
            {loading ? "Désactivation..." : "Désactiver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
