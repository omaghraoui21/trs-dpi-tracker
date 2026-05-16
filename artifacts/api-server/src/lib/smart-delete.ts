/**
 * Smart-delete decision tree for referential resources.
 *
 *   activeOpen > 0  -> block deletion entirely (resource is still in use in an
 *                      open lifecycle state — production entries in draft,
 *                      open downtime events, daily entries in draft, ...)
 *   historical > 0  -> deactivate (soft delete via isActive=false) so existing
 *                      audit/history rows keep their FK target
 *   otherwise       -> hard delete is safe
 *
 * The block reason is a French user-facing message listing the offending
 * tables and counts.
 */

import type { DependencyCount } from "./referential-deps";

export type DeleteDecision =
  | { kind: "hard_delete" }
  | { kind: "deactivate" }
  | { kind: "block"; reason: string };

const TABLE_LABELS_FR: Record<string, string> = {
  production_entries: "des entrées de production en cours",
  downtime_events: "des événements d'arrêt ouverts",
  daily_entries: "des fiches journalières en brouillon",
  cadences: "des cadences actives",
};

function buildBlockReason(byTable: DependencyCount["byTable"]): string {
  const offenders = Object.entries(byTable)
    .filter(([, counts]) => counts.activeOpen > 0)
    .map(([name, counts]) => {
      const label = TABLE_LABELS_FR[name] ?? name;
      return `${label} (${counts.activeOpen})`;
    });
  return `Suppression impossible: lié à ${offenders.join(" et ")}.`;
}

export function decideDeleteAction(deps: DependencyCount): DeleteDecision {
  if (deps.activeOpen > 0) {
    return { kind: "block", reason: buildBlockReason(deps.byTable) };
  }
  if (deps.historical > 0) {
    return { kind: "deactivate" };
  }
  return { kind: "hard_delete" };
}
