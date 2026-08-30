"use server";

import { revalidatePath } from "next/cache";

import {
  operatorCostSettingsDtoSchema,
  updateGlobalCostPolicyInputSchema,
  type OperatorCostSettingsDto,
} from "@/lib/contracts/cost-policy";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

import {
  costPolicyForbiddenError,
  costPolicyInternalError,
  costPolicyUnavailableError,
  costPolicyUnauthenticatedError,
  costPolicyValidationError,
  type CostPolicyActionError,
} from "../cost-policy-action-errors";
import { recordBudgetAuditEvent } from "../record-budget-audit-event";
import { loadCostSettingsDto } from "../load-cost-settings-dto";
import { loadGlobalCostPolicy } from "../get-cost-policy-for-client";

export type UpdateGlobalCostPolicyResult =
  | { ok: true; settings: OperatorCostSettingsDto }
  | { ok: false; error: CostPolicyActionError };

const FORBIDDEN_KEYS = ["clientId", "client_id"];

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UpdateGlobalCostPolicyResult {
  if (error.status === 401) {
    return costPolicyUnauthenticatedError();
  }
  return costPolicyForbiddenError();
}

function hasForbiddenKeys(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  return FORBIDDEN_KEYS.some((key) => key in raw);
}

/**
 * Update global default cost policy (US-7.1).
 * Consumer: `/operator/settings/cost-policy` global form.
 */
export async function updateGlobalCostPolicy(
  rawInput: unknown,
): Promise<UpdateGlobalCostPolicyResult> {
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

    if (hasForbiddenKeys(rawInput)) {
      return costPolicyForbiddenError();
    }

    const parsed = updateGlobalCostPolicyInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return costPolicyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    if (!isSupabaseConfigured()) {
      return costPolicyInternalError();
    }

    const previous = await loadGlobalCostPolicy();
    if (!previous) {
      return costPolicyUnavailableError();
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("neuramark_cost_policies")
      .update({
        max_cost_cents: parsed.data.maxCostCents,
        provider_tier: parsed.data.providerTier,
        updated_at: new Date().toISOString(),
      })
      .is("client_id", null);

    if (error) {
      console.error("[cost-policy] updateGlobalCostPolicy failed", error);
      return costPolicyInternalError();
    }

    await recordBudgetAuditEvent({
      eventType: "policy_updated",
      clientId: operator.id,
      operatorClientId: operator.id,
      metadata: {
        scope: "global",
        previous: {
          maxCostCents: previous.maxCostCents,
          providerTier: previous.providerTier,
        },
        next: {
          maxCostCents: parsed.data.maxCostCents,
          providerTier: parsed.data.providerTier,
        },
      },
    });

    revalidatePath("/operator/settings/cost-policy");

    const settings = await loadCostSettingsDto(operator.id);
    if (!settings) {
      return costPolicyUnavailableError();
    }

    const validated = operatorCostSettingsDtoSchema.safeParse(settings);
    if (!validated.success) {
      return costPolicyUnavailableError();
    }

    return { ok: true, settings: validated.data };
  } catch (error) {
    console.error("[cost-policy] updateGlobalCostPolicy exception", error);
    return costPolicyInternalError();
  }
}
