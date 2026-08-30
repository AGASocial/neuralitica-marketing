import "server-only";

import type { ProviderCatalogRow } from "@/lib/contracts/providers";

/**
 * Cheapest-active ranking after capability filters (US-7.2).
 * Sort by unitCostCents ASC; stable tie-break on key lexicographic ASC.
 */
export function rankCatalogCandidatesByCost(
  candidates: readonly ProviderCatalogRow[],
): ProviderCatalogRow[] {
  return [...candidates].sort((a, b) => {
    const costDiff = a.costModel.unitCostCents - b.costModel.unitCostCents;
    if (costDiff !== 0) return costDiff;
    return a.key.localeCompare(b.key);
  });
}
