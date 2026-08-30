"use server";

import type { OperatorCostSettingsDto } from "@/lib/contracts/cost-policy";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";

import {
  costPolicyForbiddenError,
  costPolicyInternalError,
  costPolicyUnavailableError,
  costPolicyUnauthenticatedError,
  type CostPolicyActionError,
} from "../cost-policy-action-errors";
import { loadCostSettingsDto } from "../load-cost-settings-dto";

export type GetCostPolicyForSettingsResult =
  | { ok: true; settings: OperatorCostSettingsDto }
  | { ok: false; error: CostPolicyActionError };

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GetCostPolicyForSettingsResult {
  if (error.status === 401) {
    return costPolicyUnauthenticatedError();
  }
  return costPolicyForbiddenError();
}

/**
 * Operator cost policy settings load (US-7.1).
 * Consumer: `/operator/settings/cost-policy` page.
 */
export async function getCostPolicyForSettings(): Promise<GetCostPolicyForSettingsResult> {
  try {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return authGuardEnvelope(error);
      }
      throw error;
    }

    const settings = await loadCostSettingsDto(operator.id);
    if (!settings) {
      return costPolicyUnavailableError();
    }

    return { ok: true, settings };
  } catch (error) {
    console.error("[cost-policy] getCostPolicyForSettings failed", error);
    return costPolicyInternalError();
  }
}
