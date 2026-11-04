/**
 * Pure Hoy proactive-card budget (KAN-104): at most 5 actionable cards.
 * Timeline narrative entries are excluded by the caller.
 */

export const HOY_PROACTIVE_CARD_BUDGET = 5 as const;

export type HoyProactiveCardKind = "needs_ok" | "next_action";

export type HoyProactiveCandidate = {
  id: string;
  kind: HoyProactiveCardKind;
  /** Lower sorts first within the same kind. */
  rank: number;
};

/**
 * Select up to `budget` proactive cards.
 * Priority: needs_ok (by rank) then at most one next_action if room remains.
 */
export function selectHoyProactiveCards(
  candidates: HoyProactiveCandidate[],
  budget: number = HOY_PROACTIVE_CARD_BUDGET,
): { selected: HoyProactiveCandidate[]; overflowCount: number } {
  const capped = Math.max(0, Math.floor(budget));
  const needsOk = candidates
    .filter((c) => c.kind === "needs_ok")
    .sort((a, b) => a.rank - b.rank);
  const nextActions = candidates
    .filter((c) => c.kind === "next_action")
    .sort((a, b) => a.rank - b.rank);

  const selected: HoyProactiveCandidate[] = [];
  for (const card of needsOk) {
    if (selected.length >= capped) {
      break;
    }
    selected.push(card);
  }
  if (selected.length < capped && nextActions[0]) {
    selected.push(nextActions[0]);
  }

  const selectedIds = new Set(selected.map((c) => c.id));
  const overflowCount = candidates.filter((c) => !selectedIds.has(c.id)).length;
  return { selected, overflowCount };
}
