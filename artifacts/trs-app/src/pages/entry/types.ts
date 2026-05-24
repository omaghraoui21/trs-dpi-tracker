import type React from "react";

export type Phase = "VIDE_LIGNE" | "REMPLISSAGE" | "LOT" | "NETTOYAGE" | "DESINFECTION";
export type PhaseStatus = "todo" | "active" | "done" | "skipped";

export interface PhaseDef {
  id: Phase;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  borderActive: string;
}

export type ShiftMode = "standard" | "exc_2p" | "ram_1p" | "ram_2p";
export interface PosteDef {
  label: string;
  shift: string;
  start: string;
  end: string;
}

export type EquipCfg = {
  unit: string;
  lotSize: number;
  increments: number[];
  cadenceInMin: boolean;
};

export type DowntimeEvent = {
  id: string;
  categoryId: string;
  categoryCode: string | null;
  categoryLabel: string | null;
  categoryIsPlanned: boolean | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: "open" | "closed";
  comment: string | null;
};
