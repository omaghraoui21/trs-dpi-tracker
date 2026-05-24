import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type KpiCode =
  | "tCal"
  | "tO"
  | "tAP"
  | "tR"
  | "tF"
  | "tN"
  | "tU"
  | "DO"
  | "TP"
  | "TQ"
  | "TRS"
  | "TRG"
  | "TRE";

interface KpiDef {
  label: string;
  description: string;
  formula?: string;
}

const KPI_DEFS: Record<KpiCode, KpiDef> = {
  tCal: {
    label: "tCal",
    description: "Temps calendaire — durée totale de la période (jour, mois).",
  },
  tO: {
    label: "tO",
    description: "Temps d'ouverture — durée pendant laquelle l'équipement est exploitable.",
    formula: "tCal − fermetures planifiées",
  },
  tAP: {
    label: "tAP",
    description: "Temps d'arrêts planifiés — pauses, changements de série, APR, manque de charge.",
    formula: "pause + chsg + apr + mqch",
  },
  tR: {
    label: "tR",
    description: "Temps requis — durée d'exploitation effective après arrêts planifiés.",
    formula: "tO − tAP",
  },
  tF: {
    label: "tF",
    description: "Temps de fonctionnement — durée pendant laquelle la machine produit réellement.",
    formula: "tR − arrêts non planifiés",
  },
  tN: {
    label: "tN",
    description: "Temps net — temps de fonctionnement à la cadence nominale.",
    formula: "quantité produite / cadence nominale",
  },
  tU: {
    label: "tU",
    description: "Temps utile — temps net produisant des unités conformes.",
    formula: "quantité conforme / cadence nominale",
  },
  DO: {
    label: "DO",
    description:
      "Disponibilité opérationnelle — taux de fonctionnement après les arrêts non planifiés.",
    formula: "tF / tR",
  },
  TP: {
    label: "TP",
    description: "Taux de performance — efficacité par rapport à la cadence nominale.",
    formula: "tN / tF",
  },
  TQ: {
    label: "TQ",
    description: "Taux de qualité — part des unités conformes produites.",
    formula: "tU / tN",
  },
  TRS: {
    label: "TRS",
    description: "Taux de Rendement Synthétique — indicateur global du rendement.",
    formula: "DO × TP × TQ = tU / tR",
  },
  TRG: {
    label: "TRG",
    description: "Taux de Rendement Global — TRS rapporté au temps d'ouverture.",
    formula: "tU / tO",
  },
  TRE: {
    label: "TRE",
    description: "Taux de Rendement Économique — TRG rapporté au temps calendaire.",
    formula: "tU / tCal",
  },
};

interface KpiLabelProps {
  kpi: KpiCode;
  className?: string;
  showIcon?: boolean;
}

export function KpiLabel({ kpi, className, showIcon = true }: KpiLabelProps) {
  const def = KPI_DEFS[kpi];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2",
            className,
          )}
        >
          {def.label}
          {showIcon && <Info className="h-3 w-3 opacity-50" />}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <div className="font-semibold">{def.label}</div>
          <div>{def.description}</div>
          {def.formula && (
            <div className="text-[10px] opacity-80 font-mono pt-0.5">= {def.formula}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
