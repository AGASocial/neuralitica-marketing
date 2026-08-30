import "server-only";

import {
  operatorCostSettingsDtoSchema,
  type OperatorCostSettingsDto,
} from "@/lib/contracts/cost-policy";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";

import { estimateLlmJobCost } from "./estimate-llm-job-cost";
import {
  getCostPolicyForClient,
  loadClientCostPolicyOverride,
  loadGlobalCostPolicy,
} from "./get-cost-policy-for-client";
import { hasActiveHighTierLlmProvider } from "./llm-provider-label";

export async function loadCostSettingsDto(
  clientId: string,
): Promise<OperatorCostSettingsDto | null> {
  const global = await loadGlobalCostPolicy();
  if (!global) {
    return null;
  }

  const effectiveResult = await getCostPolicyForClient(clientId);
  if (!effectiveResult.ok) {
    return null;
  }

  const clientOverride = await loadClientCostPolicyOverride(clientId);

  const catalogResult = await getProviderCatalog();
  const providers =
    "loadFailed" in catalogResult && catalogResult.loadFailed
      ? []
      : catalogResult.providers;

  const estimateResult = await estimateLlmJobCost({
    clientId,
    providerTier: effectiveResult.policy.providerTier,
    llmVariant: "default",
  });

  const resolvedLlmProviderLabel = estimateResult.ok
    ? estimateResult.resolvedLlmProviderLabel
    : "—";

  const highTierWarningKey =
    effectiveResult.policy.providerTier === "high" &&
    !hasActiveHighTierLlmProvider(providers)
      ? ("settings.costPolicy.highTierInactiveWarning" as const)
      : undefined;

  const dto = {
    global: {
      maxCostCents: global.maxCostCents,
      providerTier: global.providerTier,
      updatedAt: global.updatedAt,
    },
    clientOverride: clientOverride
      ? {
          maxCostCents: clientOverride.maxCostCents,
          providerTier: clientOverride.providerTier,
          updatedAt: clientOverride.updatedAt,
        }
      : null,
    effective: {
      scope: effectiveResult.scope,
      maxCostCents: effectiveResult.policy.maxCostCents,
      providerTier: effectiveResult.policy.providerTier,
    },
    resolvedLlmProviderLabel,
    ...(highTierWarningKey ? { highTierWarningKey } : {}),
  };

  const parsed = operatorCostSettingsDtoSchema.safeParse(dto);
  return parsed.success ? parsed.data : null;
}
