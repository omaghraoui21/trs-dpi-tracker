import { Wind, PackageOpen, Gauge, Droplets, ShieldCheck } from "lucide-react";
import type { Phase, PhaseDef, ShiftMode, PosteDef, EquipCfg } from "./types";

export const PHASE_DEFS: PhaseDef[] = [
  {
    id: "VIDE_LIGNE",
    label: "Vide de ligne",
    shortLabel: "Vide ligne",
    description: "Vérification et vide de la ligne avant production",
    icon: <Wind className="h-4 w-4" />,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    borderActive: "border-sky-500",
  },
  {
    id: "REMPLISSAGE",
    label: "Remplissage / Chargement",
    shortLabel: "Remplissage",
    description: "Chargement matière première et articles de conditionnement",
    icon: <PackageOpen className="h-4 w-4" />,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    borderActive: "border-amber-500",
  },
  {
    id: "LOT",
    label: "Production du lot",
    shortLabel: "Lot",
    description: "Fabrication en cours — saisie quantités et arrêts",
    icon: <Gauge className="h-4 w-4" />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    borderActive: "border-emerald-500",
  },
  {
    id: "NETTOYAGE",
    label: "Nettoyage équipement",
    shortLabel: "Nettoyage",
    description: "Nettoyage et démontage de l'équipement après production",
    icon: <Droplets className="h-4 w-4" />,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    borderActive: "border-cyan-500",
  },
  {
    id: "DESINFECTION",
    label: "Désinfection local",
    shortLabel: "Désinfection",
    description: "Désinfection du local et libération de zone",
    icon: <ShieldCheck className="h-4 w-4" />,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    borderActive: "border-violet-500",
  },
];

export const DEFAULT_CYCLE: Phase[] = [
  "VIDE_LIGNE",
  "REMPLISSAGE",
  "LOT",
  "NETTOYAGE",
  "DESINFECTION",
];

export function getPhase(id: Phase) {
  return PHASE_DEFS.find((p) => p.id === id)!;
}

export const SHIFT_MODES: Record<
  ShiftMode,
  { label: string; subtitle: string; postes: PosteDef[] }
> = {
  standard: {
    label: "Standard",
    subtitle: "08:00 – 17:00",
    postes: [{ label: "Poste journée", shift: "Standard", start: "08:00", end: "17:00" }],
  },
  exc_2p: {
    label: "2 Postes exceptionnels",
    subtitle: "07:00 – 23:00",
    postes: [
      { label: "Poste 1", shift: "Exceptionnel – P1", start: "07:00", end: "15:00" },
      { label: "Poste 2", shift: "Exceptionnel – P2", start: "15:00", end: "23:00" },
    ],
  },
  ram_1p: {
    label: "Ramadan",
    subtitle: "08:00 – 14:30",
    postes: [{ label: "Poste Ramadan", shift: "Ramadan", start: "08:00", end: "14:30" }],
  },
  ram_2p: {
    label: "Ramadan 2 postes",
    subtitle: "05:00 – 17:00",
    postes: [
      { label: "Poste 1", shift: "Ramadan – P1", start: "05:00", end: "11:00" },
      { label: "Poste 2", shift: "Ramadan – P2", start: "11:00", end: "17:00" },
    ],
  },
};

export const EQUIP_CFG: Record<string, EquipCfg> = {
  A27: {
    unit: "gélules",
    lotSize: 360_000,
    increments: [10_000, 50_000, 100_000, 360_000],
    cadenceInMin: true,
  },
  A28: {
    unit: "blisters",
    lotSize: 36_000,
    increments: [1_000, 5_000, 10_000, 36_000],
    cadenceInMin: false,
  },
};

export const DEFAULT_CFG: EquipCfg = {
  unit: "unités",
  lotSize: 0,
  increments: [100, 500, 1_000, 5_000],
  cadenceInMin: false,
};
