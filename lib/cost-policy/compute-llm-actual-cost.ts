import "server-only";

import {
  ADAPTER_REPORTED_COST_MIN_CENTS,
  type ActualCostUnavailableReason,
  type ComputeLlmActualCostInput,
  type ComputeLlmActualCostResult,
} from "@/lib/contracts/actual-cost";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";

/** Pure token math — shared with adapters when catalog row is already known. */
export function ceilPerMillionTokenCostCents(
  unitCostCents: number,
  inputTokens: number,
  outputTokens: number,
): number {
  const totalTokens = inputTokens + outputTokens;
  return Math.ceil((totalTokens / 1_000_000) * unitCostCents);
}

function hasUsableTokenUsage(inputTokens: number, outputTokens: number): boolean {
  return inputTokens > 0 || outputTokens > 0;
}

export async function computeLlmActualCost(
  input: ComputeLlmActualCostInput,
): Promise<ComputeLlmActualCostResult> {
  if (input.adapterReportedCents >= ADAPTER_REPORTED_COST_MIN_CENTS) {
    return { ok: true, actualCostCents: input.adapterReportedCents };
  }

  if (!hasUsableTokenUsage(input.inputTokens, input.outputTokens)) {
    return { ok: false, reason: "usage_missing" };
  }

  const catalog = await getProviderCatalog();
  if ("loadFailed" in catalog && catalog.loadFailed) {
    return { ok: false, reason: "catalog_cost_model_unsupported" };
  }

  const providerRow = catalog.providers.find(
    (row) => row.key === input.providerKey && row.assetRole === "llm",
  );
  if (!providerRow) {
    return { ok: false, reason: "catalog_cost_model_unsupported" };
  }

  const { billingUnit, unitCostCents } = providerRow.costModel;
  if (billingUnit !== "per_1m_tokens") {
    return { ok: false, reason: "catalog_cost_model_unsupported" };
  }

  return {
    ok: true,
    actualCostCents: ceilPerMillionTokenCostCents(
      unitCostCents,
      input.inputTokens,
      input.outputTokens,
    ),
  };
}

export type { ActualCostUnavailableReason };
