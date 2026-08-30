"use server";

import { revalidatePath } from "next/cache";

import {
  operatorCostSettingsDtoSchema,
  updateClientCostPolicyOverrideInputSchema,
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
import { loadClientCostPolicyOverride } from "../get-cost-policy-for-client";

export type UpdateClientCostPolicyOverrideResult =
  | { ok: true; settings: OperatorCostSettingsDto }
  | { ok: false; error: CostPolicyActionError };

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UpdateClientCostPolicyOverrideResult {
  if (error.status === 401) {
    return costPolicyUnauthenticatedError();
  }
  return costPolicyForbiddenError();
}

/**
 * Upsert or delete per-client cost policy override (US-7.1).
 * Consumer: `/operator/settings/cost-policy` client override section.
 */
export async function updateClientCostPolicyOverride(
  rawInput: unknown,
): Promise<UpdateClientCostPolicyOverrideResult> {
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

    const parsed = updateClientCostPolicyOverrideInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return costPolicyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    if (
      parsed.data.enabled &&
      (parsed.data.maxCostCents === undefined ||
        parsed.data.providerTier === undefined)
    ) {
      return costPolicyValidationError({
        maxCostCents: ["REQUIRED"],
        providerTier: ["REQUIRED"],
      });
    }

    if (!isSupabaseConfigured()) {
      return costPolicyInternalError();
    }

    const supabase = createServerSupabaseClient();
    const clientId = operator.id;
    const previous = await loadClientCostPolicyOverride(clientId);

    if (!parsed.data.enabled) {
      const { error } = await supabase
        .from("neuramark_cost_policies")
        .delete()
        .eq("client_id", clientId);

      if (error) {
        console.error("[cost-policy] delete client override failed", error);
        return costPolicyInternalError();
      }

      await recordBudgetAuditEvent({
        eventType: "policy_updated",
        clientId,
        operatorClientId: operator.id,
        metadata: {
          scope: "client",
          clientId,
          previous: previous
            ? {
                maxCostCents: previous.maxCostCents,
                providerTier: previous.providerTier,
              }
            : null,
          next: null,
        },
      });
    } else {
      const { error } = await supabase.from("neuramark_cost_policies").upsert(
        {
          client_id: clientId,
          max_cost_cents: parsed.data.maxCostCents,
          provider_tier: parsed.data.providerTier,
          rules: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id" },
      );

      if (error) {
        console.error("[cost-policy] upsert client override failed", error);
        return costPolicyInternalError();
      }

      await recordBudgetAuditEvent({
        eventType: "policy_updated",
        clientId,
        operatorClientId: operator.id,
        metadata: {
          scope: "client",
          clientId,
          previous: previous
            ? {
                maxCostCents: previous.maxCostCents,
                providerTier: previous.providerTier,
              }
            : null,
          next: {
            maxCostCents: parsed.data.maxCostCents,
            providerTier: parsed.data.providerTier,
          },
        },
      });
    }

    revalidatePath("/operator/settings/cost-policy");

    const settings = await loadCostSettingsDto(clientId);
    if (!settings) {
      return costPolicyUnavailableError();
    }

    const validated = operatorCostSettingsDtoSchema.safeParse(settings);
    if (!validated.success) {
      return costPolicyUnavailableError();
    }

    return { ok: true, settings: validated.data };
  } catch (error) {
    console.error("[cost-policy] updateClientCostPolicyOverride exception", error);
    return costPolicyInternalError();
  }
}
