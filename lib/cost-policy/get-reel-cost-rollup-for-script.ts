import "server-only";

import {
  computeReelCostIsOverBudget,
  computeReelCostVarianceCents,
  getReelCostRollupForScriptInputSchema,
  reelCostRollupAssetRoleSchema,
  type GetReelCostRollupForScriptInput,
  type ReelCostRollupAssetRole,
  type ReelCostRollupDto,
} from "@/lib/contracts/actual-cost";
import { DEFAULT_MAX_COST_CENTS } from "@/lib/contracts/cost-policy";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import {
  aggregateSpendEventsForReelScript,
  type SpendEventAggregateRow,
  weekEndExclusive,
} from "./aggregate-spend-events-for-reel-script";
import { getCostPolicyForClient } from "./get-cost-policy-for-client";
import { ReelCumulativeCostUnsafeError } from "./sum-reel-cumulative-cost-cents";

const COMPONENT_ROLE_ORDER: ReelCostRollupAssetRole[] =
  reelCostRollupAssetRoleSchema.options;

/**
 * Operator-only per-Reel cost roll-up (US-7.4).
 * Called from getReelScriptsForWeek after requireOperator — not a public action.
 */
export async function getReelCostRollupForScript(
  rawInput: GetReelCostRollupForScriptInput,
): Promise<ReelCostRollupDto | null> {
  const parsed = getReelCostRollupForScriptInputSchema.parse(rawInput);
  const { clientId, reelScriptId, weekStart, eventScope } = parsed;

  if (eventScope !== "week") {
    throw new ReelCumulativeCostUnsafeError("Unsupported event scope");
  }

  if (!isSupabaseConfigured()) {
    throw new ReelCumulativeCostUnsafeError("Supabase not configured");
  }

  const supabase = createServerSupabaseClient();

  const { data: scriptRow, error: scriptError } = await supabase
    .from("neuramark_reel_scripts")
    .select("id")
    .eq("id", reelScriptId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (scriptError) {
    throw new ReelCumulativeCostUnsafeError("Reel script lookup failed");
  }

  if (!scriptRow) {
    return null;
  }

  const weekEnd = weekEndExclusive(weekStart);
  const { data, error } = await supabase
    .from("neuramark_reel_spend_events")
    .select(
      "asset_role, estimated_cost_cents, actual_cost_cents, actual_cost_unavailable_reason",
    )
    .eq("client_id", clientId)
    .eq("reel_script_id", reelScriptId)
    .gte("created_at", `${weekStart}T00:00:00.000Z`)
    .lt("created_at", `${weekEnd}T00:00:00.000Z`);

  if (error) {
    throw new ReelCumulativeCostUnsafeError("Spend rollup query failed");
  }

  const rows = (data ?? []) as SpendEventAggregateRow[];
  const aggregated = aggregateSpendEventsForReelScript(rows);

  const policyResult = await getCostPolicyForClient(clientId);
  const maxCostCents =
    policyResult.ok === true
      ? policyResult.policy.max_cost_cents
      : DEFAULT_MAX_COST_CENTS;

  if (policyResult.ok === false) {
    console.error("[cost-policy] getReelCostRollupForScript: policy unavailable", {
      clientId,
      reelScriptId,
    });
  }

  const components = COMPONENT_ROLE_ORDER.flatMap((assetRole) => {
    const roleAgg = aggregated.byAssetRole.get(assetRole);
    if (!roleAgg || roleAgg.eventCount === 0) {
      return [];
    }
    return [
      {
        assetRole,
        estimatedCostCents: roleAgg.estimatedCostCents,
        actualCostCents: roleAgg.actualCostCents,
        eventCount: roleAgg.eventCount,
        hasPendingActual: roleAgg.hasPendingActual,
        unavailableReasonKeys: roleAgg.unavailableReasonKeys,
      },
    ];
  });

  const { estimatedTotalCents, actualTotalCents, hasPendingActual } = aggregated;

  return {
    reelScriptId,
    clientId,
    weekStart,
    eventScope: "week",
    estimatedTotalCents,
    actualTotalCents,
    varianceCents: computeReelCostVarianceCents(
      estimatedTotalCents,
      actualTotalCents,
    ),
    hasPendingActual,
    maxCostCents,
    isOverBudget: computeReelCostIsOverBudget(
      estimatedTotalCents,
      actualTotalCents,
      maxCostCents,
    ),
    components,
  };
}
