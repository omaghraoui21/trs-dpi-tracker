/**
 * TRS/OEE Calculation Engine — NF E 60-182
 *
 * Formulas:
 *   tT = temps calendrier (total calendar time, typically 24h = 1440 min)
 *   tO = tT - fermetures/jours off (opening time)
 *   tR = tO - arrêts planifiés (required time)
 *   tF = tR - arrêts non planifiés (functioning time)
 *   tN = quantité produite / cadence référence (net time)
 *   tU = quantité conforme / cadence référence (useful time)
 *
 *   DO  = tF / tR   (disponibilité opérationnelle)
 *   TP  = tN / tF   (taux de performance)
 *   TQ  = tU / tN   (taux qualité)
 *   TRS = tU / tR   = DO × TP × TQ
 *   TRG = tU / tO
 *   TRE = tU / tT
 *
 * Monthly TRS = Σ(tU) / Σ(tR)  — NOT average of daily TRS values
 *
 * V2 (daily-entry-based):
 *   When daily_entries exist for the month, Σ(tR) and Σ(tO) come from
 *   daily_entries (which include ALL days: production, non-production,
 *   partial days). This matches exactly the Excel model:
 *     TOTAL MOIS TRS = Σ(tU from lots) / Σ(tR from all daily rows)
 */

export interface TrsInputs {
  shiftDurationMinutes: number;       // tO for this shift
  plannedDowntimeMinutes: number;     // Σ planned stop durations
  unplannedDowntimeMinutes: number;   // Σ unplanned stop durations
  quantityProduced: number;
  quantityConforming: number;
  validatedCadence: number;           // units per hour
}

export interface TrsMetrics {
  tT: number;
  tO: number;
  tR: number;
  tF: number;
  tN: number;
  tU: number;
  DO: number;
  TP: number;
  TQ: number;
  TRS: number;
  TRG: number;
  TRE: number;
  plannedDowntimeMinutes: number;
  unplannedDowntimeMinutes: number;
  cadenceGap: number;
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator <= 0 || isNaN(denominator) || isNaN(numerator)) return 0;
  const result = numerator / denominator;
  return isNaN(result) || !isFinite(result) ? 0 : result;
}

export function calculateTrs(inputs: TrsInputs): TrsMetrics {
  const {
    shiftDurationMinutes,
    plannedDowntimeMinutes,
    unplannedDowntimeMinutes,
    quantityProduced,
    quantityConforming,
    validatedCadence,
  } = inputs;

  const tT = 1440;
  const tO = Math.max(0, shiftDurationMinutes);
  const tR = Math.max(0, tO - plannedDowntimeMinutes);
  const tF = Math.max(0, tR - unplannedDowntimeMinutes);

  const cadencePerMin = validatedCadence > 0 ? validatedCadence / 60 : 0;
  const tN = cadencePerMin > 0 ? safeDivide(quantityProduced, cadencePerMin) : 0;
  const tU = cadencePerMin > 0 ? safeDivide(quantityConforming, cadencePerMin) : 0;

  const DO = safeDivide(tF, tR);
  const TP = safeDivide(tN, tF);
  const TQ = safeDivide(tU, tN);
  const TRS = safeDivide(tU, tR);
  const TRG = safeDivide(tU, tO);
  const TRE = safeDivide(tU, tT);

  const actualCadencePerMin = tF > 0 ? safeDivide(quantityProduced, tF) : 0;
  const cadenceGap = cadencePerMin - actualCadencePerMin;

  return {
    tT,
    tO,
    tR,
    tF,
    tN: Math.round(tN * 100) / 100,
    tU: Math.round(tU * 100) / 100,
    DO: Math.round(DO * 10000) / 10000,
    TP: Math.round(TP * 10000) / 10000,
    TQ: Math.round(TQ * 10000) / 10000,
    TRS: Math.round(TRS * 10000) / 10000,
    TRG: Math.round(TRG * 10000) / 10000,
    TRE: Math.round(TRE * 10000) / 10000,
    plannedDowntimeMinutes,
    unplannedDowntimeMinutes,
    cadenceGap: Math.round(cadenceGap * 100) / 100,
  };
}

/** Parse HH:MM string to minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/** Calculate shift duration in minutes, handles overnight shifts */
export function shiftDurationMinutes(start: string, end: string): number {
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  if (endMin >= startMin) return endMin - startMin;
  return (1440 - startMin) + endMin; // overnight
}

// ─── V1 Monthly consolidation (legacy — production entries only) ──────────────

export interface MonthlyTrsInputs {
  entries: Array<{
    tR: number;
    tU: number;
    tF: number;
    tN: number;
    tO: number;
    plannedDowntimeMinutes: number;
    unplannedDowntimeMinutes: number;
  }>;
  trsObjective: number;
}

export function calculateMonthlyTrs(inputs: MonthlyTrsInputs) {
  const { entries, trsObjective } = inputs;

  if (entries.length === 0) {
    return {
      trs: null, DO: null, TP: null, TQ: null, TRG: null, TRE: null,
      totalTR: 0, totalTU: 0, totalTF: 0, totalTN: 0, totalTO: 0,
      totalDowntimePlanned: 0, totalDowntimeUnplanned: 0,
      trsObjective,
      source: "production" as const,
    };
  }

  const totalTR = entries.reduce((s, e) => s + e.tR, 0);
  const totalTU = entries.reduce((s, e) => s + e.tU, 0);
  const totalTF = entries.reduce((s, e) => s + e.tF, 0);
  const totalTN = entries.reduce((s, e) => s + e.tN, 0);
  const totalTO = entries.reduce((s, e) => s + e.tO, 0);
  const totalTT = entries.length * 1440;
  const totalDowntimePlanned = entries.reduce((s, e) => s + e.plannedDowntimeMinutes, 0);
  const totalDowntimeUnplanned = entries.reduce((s, e) => s + e.unplannedDowntimeMinutes, 0);

  const TRS = safeDivide(totalTU, totalTR);
  const DO = safeDivide(totalTF, totalTR);
  const TP = safeDivide(totalTN, totalTF);
  const TQ = safeDivide(totalTU, totalTN);
  const TRG = safeDivide(totalTU, totalTO);
  const TRE = safeDivide(totalTU, totalTT);

  return {
    trs: TRS, DO, TP, TQ, TRG, TRE,
    totalTR, totalTU, totalTF, totalTN, totalTO,
    totalDowntimePlanned, totalDowntimeUnplanned,
    trsObjective,
    source: "production" as const,
  };
}

// ─── Safe TRS calculation (Phase 5) ──────────────────────────────────────────

/**
 * Typed error for missing/invalid cadence scenarios.
 * Available for throw-based error patterns in routes that prefer try/catch
 * over the safe-wrapper approach used by calculateTrsSafe.
 */
export class MissingCadenceError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`Missing cadence: ${reason}`);
    this.name = "MissingCadenceError";
    this.reason = reason;
  }
}

export type TrsError = { reason: string; message: string };

export function calculateTrsSafe(inputs: TrsInputs): { metrics: TrsMetrics | null; error: TrsError | null } {
  if (inputs.validatedCadence <= 0) {
    return { metrics: null, error: { reason: "MISSING_CADENCE", message: "Cadence absente ou invalide pour ce triplet" } };
  }
  return { metrics: calculateTrs(inputs), error: null };
}

// ─── V2 Monthly consolidation (daily-entry-based — Excel model) ──────────────

/**
 * Daily base row — one per calendar day, from daily_entries table.
 * tR and tO come from the fiche journalière, not from individual shift times.
 */
export interface DailyBaseRow {
  tO: number;   // t_opening_min
  tAP: number;  // pause + chsg + apr + mqch
  tR: number;   // tO − tAP
}

/**
 * Production metrics for a single lot/entry (can span multiple shifts per day).
 * These supply the numerator components (tU, tF, tN).
 */
export interface ProdMetricsRow {
  tU: number;
  tF: number;
  tN: number;
  plannedDowntimeMinutes: number;
  unplannedDowntimeMinutes: number;
}

/**
 * calculateMonthlyTrsV2 — Excel-faithful monthly TRS
 *
 * Denominator: Σ(tR) from daily_entries for ALL days of the month
 *              (includes non-production days, partial days, etc.)
 * Numerator  : Σ(tU, tF, tN) from production_entries linked to those days
 *
 * Days with a daily entry but no production contribute tR to the denominator
 * but 0 to the numerator → correctly dilutes monthly TRS (as in the Excel).
 *
 * Indicator formulas:
 *   TRS = Σ(tU) / Σ(tR_daily)
 *   DO  = Σ(tF) / Σ(tR_daily)    ← uses daily tR as base
 *   TP  = Σ(tN) / Σ(tF)          ← production only
 *   TQ  = Σ(tU) / Σ(tN)          ← production only
 *   TRG = Σ(tU) / Σ(tO_daily)    ← uses daily tO as base
 */
export function calculateMonthlyTrsV2(
  dailyBase: DailyBaseRow[],
  prodMetrics: ProdMetricsRow[],
  trsObjective: number
) {
  if (dailyBase.length === 0) {
    return {
      trs: null, DO: null, TP: null, TQ: null, TRG: null, TRE: null,
      totalTR: 0, totalTU: 0, totalTF: 0, totalTN: 0, totalTO: 0,
      totalTAP: 0, totalDowntimePlanned: 0, totalDowntimeUnplanned: 0,
      trsObjective,
      source: "daily" as const,
    };
  }

  // Denominator base from daily entries
  const totalTR  = dailyBase.reduce((s, d) => s + d.tR, 0);
  const totalTO  = dailyBase.reduce((s, d) => s + d.tO, 0);
  const totalTAP = dailyBase.reduce((s, d) => s + d.tAP, 0);

  // Numerator from production entries
  const totalTU  = prodMetrics.reduce((s, p) => s + p.tU, 0);
  const totalTF  = prodMetrics.reduce((s, p) => s + p.tF, 0);
  const totalTN  = prodMetrics.reduce((s, p) => s + p.tN, 0);
  const totalDowntimePlanned   = prodMetrics.reduce((s, p) => s + p.plannedDowntimeMinutes, 0);
  const totalDowntimeUnplanned = prodMetrics.reduce((s, p) => s + p.unplannedDowntimeMinutes, 0);

  const daysInMonth = dailyBase.length;
  const totalTT = daysInMonth * 1440;

  const TRS = safeDivide(totalTU, totalTR);
  const DO  = safeDivide(totalTF, totalTR);
  const TP  = safeDivide(totalTN, totalTF);
  const TQ  = safeDivide(totalTU, totalTN);
  const TRG = safeDivide(totalTU, totalTO);
  const TRE = safeDivide(totalTU, totalTT);

  return {
    trs: TRS, DO, TP, TQ, TRG, TRE,
    totalTR, totalTU, totalTF, totalTN, totalTO, totalTAP,
    totalDowntimePlanned, totalDowntimeUnplanned,
    trsObjective,
    source: "daily" as const,
  };
}
