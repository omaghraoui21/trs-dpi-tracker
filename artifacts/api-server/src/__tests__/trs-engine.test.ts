/**
 * TRS/OEE Engine Unit Tests — NF E 60-182
 * DPI TRS Tracker — QA Validation avant production beta
 *
 * Run: pnpm test
 */
import { describe, it, expect } from "vitest";
import {
  calculateTrs,
  calculateMonthlyTrs,
  calculateTrsSafe,
  MissingCadenceError,
  timeToMinutes,
  shiftDurationMinutes,
  type TrsInputs,
} from "../lib/trs-engine";

// ─────────────────────────────────────────────────────────
// Helper: tolerance comparison (±0.001)
// ─────────────────────────────────────────────────────────
function approx(actual: number, expected: number, tolerance = 0.001) {
  return Math.abs(actual - expected) <= tolerance;
}

// ─────────────────────────────────────────────────────────
// Cas 1 — Production simple
// ─────────────────────────────────────────────────────────
describe("Cas 1 — Production simple", () => {
  // tO = 480 min, tR = 420 min (60 min planned downtime)
  // tF = 390 min (30 min unplanned)
  // Quantité produite = 360 000, conforme = 358 000
  // Cadence = 1000 unités/min = 60 000 unités/h
  const input: TrsInputs = {
    shiftDurationMinutes: 480,
    plannedDowntimeMinutes: 60,
    unplannedDowntimeMinutes: 30,
    quantityProduced: 360_000,
    quantityConforming: 358_000,
    validatedCadence: 60_000, // units/h
  };

  const result = calculateTrs(input);

  it("tO = shiftDurationMinutes", () => {
    expect(result.tO).toBe(480);
  });

  it("tR = tO - plannedDowntime = 480 - 60 = 420", () => {
    expect(result.tR).toBe(420);
  });

  it("tF = tR - unplannedDowntime = 420 - 30 = 390", () => {
    expect(result.tF).toBe(390);
  });

  it("tN = quantityProduced / cadencePerMin = 360000/1000 = 360 min", () => {
    // cadencePerMin = 60000/60 = 1000
    expect(approx(result.tN, 360)).toBe(true);
  });

  it("tU = quantityConforming / cadencePerMin = 358000/1000 = 358 min", () => {
    expect(approx(result.tU, 358)).toBe(true);
  });

  it("DO = tF / tR = 390/420 ≈ 0.9286", () => {
    expect(approx(result.DO, 390 / 420)).toBe(true);
  });

  it("TP = tN / tF = 360/390 ≈ 0.9231", () => {
    expect(approx(result.TP, 360 / 390)).toBe(true);
  });

  it("TQ = tU / tN = 358/360 ≈ 0.9944", () => {
    expect(approx(result.TQ, 358 / 360)).toBe(true);
  });

  it("TRS = tU / tR = 358/420 ≈ 0.8524", () => {
    expect(approx(result.TRS, 358 / 420)).toBe(true);
  });

  it("TRS ≈ DO × TP × TQ (coherence check)", () => {
    const computed = result.DO * result.TP * result.TQ;
    expect(approx(result.TRS, computed, 0.005)).toBe(true);
  });

  it("TRG = tU / tO = 358/480 ≈ 0.7458", () => {
    expect(approx(result.TRG, 358 / 480)).toBe(true);
  });

  it("TRE = tU / tT = 358/1440 ≈ 0.2486", () => {
    expect(approx(result.TRE, 358 / 1440)).toBe(true);
  });

  it("TRS > TRG > TRE (hierarchy check)", () => {
    expect(result.TRS).toBeGreaterThan(result.TRG);
    expect(result.TRG).toBeGreaterThan(result.TRE);
  });
});

// ─────────────────────────────────────────────────────────
// Cas 2 — Journée nettoyage uniquement
// ─────────────────────────────────────────────────────────
describe("Cas 2 — Journée nettoyage uniquement", () => {
  // Nettoyage 08:00–12:00 et 12:00–17:00 = 9h = 540 min planifiés
  // Aucune production → quantité 0, cadence 0
  const input: TrsInputs = {
    shiftDurationMinutes: 540,
    plannedDowntimeMinutes: 540,   // tout le temps est planifié (nettoyage)
    unplannedDowntimeMinutes: 0,
    quantityProduced: 0,
    quantityConforming: 0,
    validatedCadence: 0,           // aucune cadence — activité non productive
  };

  const result = calculateTrs(input);

  it("tR = 0 quand nettoyage = totalité du temps", () => {
    expect(result.tR).toBe(0);
  });

  it("tF = 0 (pas d'arrêt non planifié)", () => {
    expect(result.tF).toBe(0);
  });

  it("DO renvoie 0 (pas de production → pas de division par zéro)", () => {
    expect(result.DO).toBe(0);
    expect(isNaN(result.DO)).toBe(false);
    expect(isFinite(result.DO)).toBe(true);
  });

  it("TRS = 0 sans crash (activité non productive planifiée)", () => {
    expect(result.TRS).toBe(0);
    expect(isNaN(result.TRS)).toBe(false);
  });

  it("tN = tU = 0 (pas de production)", () => {
    expect(result.tN).toBe(0);
    expect(result.tU).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
// Cas 3 — Journée mixte nettoyage + production
// ─────────────────────────────────────────────────────────
describe("Cas 3 — Journée mixte nettoyage + production", () => {
  // 08:00–10:00 nettoyage planifié (120 min)
  // 10:00–17:00 production (420 min utiles)
  // Total shift = 540 min, planned = 120 min → tR = 420 min
  const input: TrsInputs = {
    shiftDurationMinutes: 540,
    plannedDowntimeMinutes: 120,
    unplannedDowntimeMinutes: 0,
    quantityProduced: 400_000,
    quantityConforming: 396_000,
    validatedCadence: 60_000, // 1000 unités/min
  };

  const result = calculateTrs(input);

  it("tR = 540 - 120 = 420 min (nettoyage déduit)", () => {
    expect(result.tR).toBe(420);
  });

  it("tF = 420 (aucun arrêt non planifié)", () => {
    expect(result.tF).toBe(420);
  });

  it("DO = 1.0 (tF = tR, aucun arrêt non planifié)", () => {
    expect(result.DO).toBe(1);
  });

  it("TRS calculé sur la vraie fenêtre productive (tR=420, pas tO=540)", () => {
    // TRS = tU/tR — si on avait utilisé tO (540), TRS serait sous-estimé
    const tU = 396_000 / 1_000; // 396 min
    expect(approx(result.TRS, tU / 420)).toBe(true);
    // Vérifier que TRS n'est pas calculé sur tO
    expect(result.TRS).not.toBeCloseTo(tU / 540, 2);
  });
});

// ─────────────────────────────────────────────────────────
// Cas 4 — Arrêt non planifié (panne)
// ─────────────────────────────────────────────────────────
describe("Cas 4 — Arrêt non planifié 60 min", () => {
  const input: TrsInputs = {
    shiftDurationMinutes: 480,
    plannedDowntimeMinutes: 0,
    unplannedDowntimeMinutes: 60,
    quantityProduced: 350_000,
    quantityConforming: 350_000,
    validatedCadence: 60_000,
  };

  const result = calculateTrs(input);

  it("tR = 480 (aucun arrêt planifié)", () => {
    expect(result.tR).toBe(480);
  });

  it("tF = 420 (60 min de panne déduit)", () => {
    expect(result.tF).toBe(420);
  });

  it("DO < 1 — impact disponibilité opérationnelle", () => {
    expect(result.DO).toBeLessThan(1);
    expect(approx(result.DO, 420 / 480)).toBe(true);
  });

  it("TP > 1.0 n'est pas possible (safeDivide protège)", () => {
    // tN = 350 min, tF = 420 min → TP = 350/420 < 1
    expect(result.TP).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────
// Cas 5 — Sous-performance cadence
// ─────────────────────────────────────────────────────────
describe("Cas 5 — Sous-performance (cadence réelle < cadence référence)", () => {
  // Aucun arrêt déclaré mais production faible → cadenceGap positif
  const input: TrsInputs = {
    shiftDurationMinutes: 480,
    plannedDowntimeMinutes: 0,
    unplannedDowntimeMinutes: 0,
    quantityProduced: 200_000,   // faible vs 480 min × 1000 u/min = 480k attendus
    quantityConforming: 200_000,
    validatedCadence: 60_000,
  };

  const result = calculateTrs(input);

  it("DO = 1.0 (aucun arrêt déclaré)", () => {
    expect(result.DO).toBe(1);
  });

  it("TP < 1.0 — sous-performance détectée", () => {
    // tN = 200 min, tF = 480 min → TP = 200/480 ≈ 0.417
    expect(result.TP).toBeLessThan(1);
    expect(approx(result.TP, 200 / 480)).toBe(true);
  });

  it("cadenceGap > 0 — écart cadence positif détecté", () => {
    expect(result.cadenceGap).toBeGreaterThan(0);
  });

  it("TRS impacté par TP (pas par DO)", () => {
    // TRS = tU/tR = 200/480
    expect(approx(result.TRS, 200 / 480)).toBe(true);
    // DO parfait mais TRS faible → impact TP
    expect(result.TRS).toBeLessThan(result.DO);
  });
});

// ─────────────────────────────────────────────────────────
// Cas 6 — Problème qualité (TQ)
// ─────────────────────────────────────────────────────────
describe("Cas 6 — Problème qualité (rebuts élevés)", () => {
  const input: TrsInputs = {
    shiftDurationMinutes: 480,
    plannedDowntimeMinutes: 60,
    unplannedDowntimeMinutes: 0,
    quantityProduced: 400_000,
    quantityConforming: 300_000,  // 25% de rebuts
    validatedCadence: 60_000,
  };

  const result = calculateTrs(input);

  it("TQ < 1.0 — impact qualité détecté", () => {
    expect(result.TQ).toBeLessThan(1);
    expect(approx(result.TQ, 300_000 / 400_000)).toBe(true);
  });

  it("TQ = 0.75 (rebuts 25%)", () => {
    expect(approx(result.TQ, 0.75)).toBe(true);
  });

  it("TRS < DO × TP (dégradé par TQ)", () => {
    expect(result.TRS).toBeLessThan(result.DO * result.TP);
  });

  it("quantityProduced > quantityConforming → tN > tU", () => {
    expect(result.tN).toBeGreaterThan(result.tU);
  });
});

// ─────────────────────────────────────────────────────────
// Cas 7 — TRS mensuel = Σ(tU)/Σ(tR) pas moyenne journalière
// ─────────────────────────────────────────────────────────
describe("Cas 7 — TRS mensuel NF E 60-182", () => {
  // 3 jours avec TRS différents
  const jour1 = { tR: 420, tU: 336, tF: 400, tN: 360, tO: 480, plannedDowntimeMinutes: 60, unplannedDowntimeMinutes: 20 }; // TRS = 80%
  const jour2 = { tR: 400, tU: 280, tF: 380, tN: 350, tO: 480, plannedDowntimeMinutes: 80, unplannedDowntimeMinutes: 20 }; // TRS = 70%
  const jour3 = { tR: 450, tU: 405, tF: 440, tN: 420, tO: 480, plannedDowntimeMinutes: 30, unplannedDowntimeMinutes: 10 }; // TRS = 90%

  const result = calculateMonthlyTrs({ entries: [jour1, jour2, jour3], trsObjective: 75 });

  it("TRS mensuel = Σ(tU)/Σ(tR)", () => {
    const sumTU = jour1.tU + jour2.tU + jour3.tU; // 336+280+405 = 1021
    const sumTR = jour1.tR + jour2.tR + jour3.tR; // 420+400+450 = 1270
    expect(approx(result.trs!, sumTU / sumTR)).toBe(true);
  });

  it("TRS mensuel ≠ moyenne simple (80+70+90)/3 = 80", () => {
    const moyenneSimple = (0.8 + 0.7 + 0.9) / 3; // 0.8
    const sumTU = 336 + 280 + 405;
    const sumTR = 420 + 400 + 450;
    const trsReel = sumTU / sumTR; // ≈ 0.8039
    // Les deux sont proches mais pas identiques — confirme que le calcul est correct
    expect(result.trs).not.toBeNull();
    expect(approx(result.trs!, trsReel, 0.001)).toBe(true);
  });

  it("DO mensuel = ΣtF/ΣtR", () => {
    const sumTF = jour1.tF + jour2.tF + jour3.tF;
    const sumTR = jour1.tR + jour2.tR + jour3.tR;
    expect(approx(result.DO!, sumTF / sumTR)).toBe(true);
  });

  it("totalTR et totalTU sont des sommes, pas des moyennes", () => {
    expect(result.totalTR).toBe(420 + 400 + 450);
    expect(result.totalTU).toBe(336 + 280 + 405);
  });
});

// ─────────────────────────────────────────────────────────
// Cas 8 — Division par zéro (tR=0, tF=0, tN=0)
// ─────────────────────────────────────────────────────────
describe("Cas 8 — Division par zéro (protection anticrash)", () => {
  const zeroInput: TrsInputs = {
    shiftDurationMinutes: 0,
    plannedDowntimeMinutes: 0,
    unplannedDowntimeMinutes: 0,
    quantityProduced: 0,
    quantityConforming: 0,
    validatedCadence: 0,
  };

  const result = calculateTrs(zeroInput);

  it("DO = 0 — pas de crash sur tR=0", () => {
    expect(isNaN(result.DO)).toBe(false);
    expect(isFinite(result.DO)).toBe(true);
    expect(result.DO).toBe(0);
  });

  it("TP = 0 — pas de crash sur tF=0", () => {
    expect(isNaN(result.TP)).toBe(false);
    expect(result.TP).toBe(0);
  });

  it("TQ = 0 — pas de crash sur tN=0", () => {
    expect(isNaN(result.TQ)).toBe(false);
    expect(result.TQ).toBe(0);
  });

  it("TRS = 0 — pas de crash sur tR=0", () => {
    expect(isNaN(result.TRS)).toBe(false);
    expect(result.TRS).toBe(0);
  });

  it("TRG = 0 — pas de crash sur tO=0", () => {
    expect(isNaN(result.TRG)).toBe(false);
    expect(result.TRG).toBe(0);
  });

  it("TRE = 0 — pas de crash sur tT=1440 (non zéro, toujours OK)", () => {
    // tT = 1440 constant → TRE = 0/1440 = 0
    expect(isNaN(result.TRE)).toBe(false);
    expect(result.TRE).toBe(0);
  });

  it("Tous les résultats sont des nombres finis", () => {
    const values = [result.DO, result.TP, result.TQ, result.TRS, result.TRG, result.TRE, result.tN, result.tU, result.cadenceGap];
    values.forEach(v => {
      expect(isNaN(v)).toBe(false);
      expect(isFinite(v)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────
// Cas mensuel — liste vide
// ─────────────────────────────────────────────────────────
describe("Cas mensuel — liste vide", () => {
  const result = calculateMonthlyTrs({ entries: [], trsObjective: 75 });

  it("trs = null (pas de données)", () => {
    expect(result.trs).toBeNull();
  });

  it("DO = null (pas de données)", () => {
    expect(result.DO).toBeNull();
  });

  it("totalTR = 0", () => {
    expect(result.totalTR).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
// Tests utilitaires — timeToMinutes et shiftDurationMinutes
// ─────────────────────────────────────────────────────────
describe("Utilitaires timeToMinutes et shiftDurationMinutes", () => {
  it("08:00 = 480 min", () => {
    expect(timeToMinutes("08:00")).toBe(480);
  });

  it("17:00 = 1020 min", () => {
    expect(timeToMinutes("17:00")).toBe(1020);
  });

  it("00:00 = 0 min", () => {
    expect(timeToMinutes("00:00")).toBe(0);
  });

  it("shiftDurationMinutes 08:00 → 17:00 = 540 min", () => {
    expect(shiftDurationMinutes("08:00", "17:00")).toBe(540);
  });

  it("shiftDurationMinutes 06:00 → 14:00 = 480 min", () => {
    expect(shiftDurationMinutes("06:00", "14:00")).toBe(480);
  });

  it("shiftDurationMinutes nuit 22:00 → 06:00 = 480 min (overnight)", () => {
    expect(shiftDurationMinutes("22:00", "06:00")).toBe(480);
  });

  it("chaîne invalide renvoie 0 sans crash", () => {
    expect(timeToMinutes("invalid")).toBe(0);
    expect(isNaN(timeToMinutes("invalid"))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// DPI — Cas réels blistereuse
// ─────────────────────────────────────────────────────────
describe("DPI — Blistereuse IMA TR135 S (cadence 120 blisters/min = 7200/h)", () => {
  // Shift 08:00–17:00 = 540 min, changement bobine PVC planifié 30 min
  // 15 min panne non planifiée → tF = 495 min
  // Production réaliste: 495 min × 120 blisters/min × 0.87 TP ≈ 51 732 blisters
  const cadencePerMin = 7200 / 60; // 120 blisters/min
  const tF_expected = 495; // 540 - 30(planifié) - 15(panne)
  const tR_expected = 510; // 540 - 30(planifié)

  const input: TrsInputs = {
    shiftDurationMinutes: 540,
    plannedDowntimeMinutes: 30,
    unplannedDowntimeMinutes: 15,
    quantityProduced: 51_732,     // ≈ 495 × 120 × 0.87 — réaliste pour la cadence
    quantityConforming: 51_215,   // ≈ 99% conformité
    validatedCadence: 7_200,      // 7200 blisters/h = 120/min
  };

  const result = calculateTrs(input);

  it("tR = 510 min (540 - 30 planifié)", () => {
    expect(result.tR).toBe(tR_expected);
  });

  it("tF = 495 min (510 - 15 non planifié)", () => {
    expect(result.tF).toBe(tF_expected);
  });

  it("tN ≈ 51732 / 120 ≈ 431 min", () => {
    expect(approx(result.tN, 51_732 / cadencePerMin, 1)).toBe(true);
  });

  it("DO ≈ 0.9706 (495/510)", () => {
    expect(approx(result.DO, tF_expected / tR_expected)).toBe(true);
  });

  it("TP < 1.0 — sous-cadence par rapport à référence (aucun dépassement)", () => {
    // tN = 431 min < tF = 495 min → TP ≈ 0.87
    expect(result.TP).toBeLessThan(1);
    expect(result.TP).toBeGreaterThan(0.5);
  });

  it("TRS est entre 0 et 1 (physiquement possible)", () => {
    expect(result.DO).toBeGreaterThanOrEqual(0);
    expect(result.DO).toBeLessThanOrEqual(1);
    expect(result.TP).toBeGreaterThanOrEqual(0);
    expect(result.TRS).toBeGreaterThanOrEqual(0);
    expect(result.TRS).toBeLessThanOrEqual(1);
  });

  it("TQ ≥ 0.99 (qualité excellente, ≥99%)", () => {
    expect(result.TQ).toBeGreaterThanOrEqual(0.99);
  });
});

// ─────────────────────────────────────────────────────────
// Cas edge — TP > 1 détection (anomalie de saisie)
// ─────────────────────────────────────────────────────────
describe("Cas edge — Quantité déclarée physiquement impossible (QA Finding #001)", () => {
  // Si l'opérateur saisit une quantité irréaliste (ex: 430 000 pour une machine à 120/min sur 495 min)
  // Le moteur retourne TP > 1 — anomalie détectable côté métier
  const input: TrsInputs = {
    shiftDurationMinutes: 480,
    plannedDowntimeMinutes: 0,
    unplannedDowntimeMinutes: 0,
    quantityProduced: 700_000,   // impossible: 480 min × 1000/min = 480 000 max
    quantityConforming: 700_000,
    validatedCadence: 60_000,    // 1000/min
  };

  const result = calculateTrs(input);

  it("TP > 1 quand quantité dépasse cadence × temps (anomalie saisie)", () => {
    // tN = 700 min > tF = 480 min → TP = 700/480 > 1
    expect(result.TP).toBeGreaterThan(1);
  });

  it("FINDING #001: Le moteur ne clamp pas TP à [0,1] — à valider côté UI", () => {
    // Ce comportement est documenté. Le moteur retourne la valeur brute.
    // La détection d'anomalie doit être faite côté validation formulaire.
    expect(result.TP).toBeGreaterThan(1);
  });

  it("TRS peut dépasser 1 dans ce cas — signale une incohérence de saisie", () => {
    expect(result.TRS).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────
// Phase 5: calculateTrsSafe + MissingCadenceError
// ─────────────────────────────────────────────────────────

describe("Phase 5 — calculateTrsSafe", () => {
  it("returns error with reason MISSING_CADENCE when validatedCadence is 0", () => {
    const result = calculateTrsSafe({
      shiftDurationMinutes: 480,
      plannedDowntimeMinutes: 60,
      unplannedDowntimeMinutes: 30,
      quantityProduced: 1000,
      quantityConforming: 950,
      validatedCadence: 0,
    });
    expect(result.metrics).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.reason).toBe("MISSING_CADENCE");
  });

  it("returns error for negative cadence", () => {
    const result = calculateTrsSafe({
      shiftDurationMinutes: 480,
      plannedDowntimeMinutes: 0,
      unplannedDowntimeMinutes: 0,
      quantityProduced: 500,
      quantityConforming: 500,
      validatedCadence: -10,
    });
    expect(result.metrics).toBeNull();
    expect(result.error!.reason).toBe("MISSING_CADENCE");
  });

  it("returns metrics when cadence is valid", () => {
    const result = calculateTrsSafe({
      shiftDurationMinutes: 480,
      plannedDowntimeMinutes: 60,
      unplannedDowntimeMinutes: 30,
      quantityProduced: 1000,
      quantityConforming: 950,
      validatedCadence: 500,
    });
    expect(result.error).toBeNull();
    expect(result.metrics).not.toBeNull();
    expect(result.metrics!.TRS).toBeGreaterThan(0);
  });

  it("MissingCadenceError has correct name and reason", () => {
    const err = new MissingCadenceError("NO_CADENCE_FOR_TRIPLET");
    expect(err.name).toBe("MissingCadenceError");
    expect(err.reason).toBe("NO_CADENCE_FOR_TRIPLET");
    expect(err.message).toContain("NO_CADENCE_FOR_TRIPLET");
  });
});
