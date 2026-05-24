import type { DowntimeEvent, EquipCfg } from "./types";

export function timeToMin(t: string) {
  const [h, m] = (t ?? "").split(":").map(Number);
  return isNaN(h) || isNaN(m) ? 0 : h * 60 + m;
}

export function durationMin(start: string, end: string) {
  const s = timeToMin(start),
    e = timeToMin(end);
  return e >= s ? e - s : 1440 - s + e;
}

export function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtSeconds(sec: number) {
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function fmtDur(min: number) {
  const h = Math.floor(min / 60),
    m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

export function trsHex(v: number) {
  return v >= 0.75 ? "#22c55e" : v >= 0.55 ? "#f97316" : "#ef4444";
}

export function fmtCadence(c: number, cfg: EquipCfg): string {
  if (c <= 0) return "—";
  return cfg.cadenceInMin ? `${Math.round(c / 60)} gél/min` : `${c} u/h`;
}

export function computeWeightedCadence(
  base: number,
  changes: { time: string; value: number }[],
  shiftStart: string,
  shiftEnd: string,
): number {
  if (base <= 0 && changes.length === 0) return 0;
  const total = durationMin(shiftStart, shiftEnd);
  if (total <= 0) return base;
  const sorted = [...changes].sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
  let sum = 0,
    prevT = timeToMin(shiftStart),
    prevC = base;
  for (const ch of sorted) {
    const t = Math.max(prevT, Math.min(timeToMin(ch.time), timeToMin(shiftEnd)));
    sum += (t - prevT) * prevC;
    prevT = t;
    prevC = ch.value;
  }
  sum += (timeToMin(shiftEnd) - prevT) * prevC;
  return sum / total;
}

export function computeTrs(params: {
  shiftStart: string;
  shiftEnd: string;
  produced: number;
  conforming: number;
  downtimes: DowntimeEvent[];
  cadence: number;
}) {
  const { shiftStart, shiftEnd, produced, conforming, downtimes, cadence } = params;
  const tO = durationMin(shiftStart, shiftEnd);
  if (tO <= 0 || cadence <= 0) return null;
  const closed = downtimes.filter((d) => d.status === "closed");
  const planned = closed
    .filter((d) => d.categoryIsPlanned)
    .reduce((s, d) => s + d.durationMinutes, 0);
  const unplanned = closed
    .filter((d) => !d.categoryIsPlanned)
    .reduce((s, d) => s + d.durationMinutes, 0);
  const tR = Math.max(0, tO - planned);
  const tF = Math.max(0, tR - unplanned);
  const cpm = cadence / 60;
  const tN = produced / cpm;
  const tU = conforming / cpm;
  const TRS = tR > 0 ? Math.min(1, tU / tR) : 0;
  const TRG = tO > 0 ? Math.min(1, tU / tO) : 0;
  const DO = tR > 0 ? Math.min(1, tF / tR) : 0;
  const TP = tF > 0 ? Math.min(1, tN / tF) : 0;
  const TQ = produced > 0 ? Math.min(1, conforming / produced) : 1;
  return { TRS, TRG, DO, TP, TQ, tO };
}
