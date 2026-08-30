"use server";

import {
  getReelBudgetPreviewInputSchema,
  reelBudgetBatchPreviewSchema,
  reelBudgetPreviewSchema,
  type ReelBudgetBatchPreview,
  type ReelBudgetPreview,
} from "@/lib/contracts/cost-policy";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

import {
  costPolicyForbiddenError,
  costPolicyInternalError,
  costPolicyUnauthenticatedError,
  costPolicyValidationError,
  reelBudgetPreviewUnavailableError,
  reelBudgetProviderUnavailableError,
  type CostPolicyActionError,
} from "../cost-policy-action-errors";
import { buildReelBudgetPreview } from "../build-reel-budget-preview";

export type GetReelBudgetPreviewResult =
  | { ok: true; preview: ReelBudgetPreview }
  | { ok: true; preview: ReelBudgetBatchPreview; isBatch: true }
  | { ok: false; error: CostPolicyActionError };

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GetReelBudgetPreviewResult {
  if (error.status === 401) {
    return costPolicyUnauthenticatedError();
  }
  return costPolicyForbiddenError();
}

/**
 * Server-derived budget preview for Operator confirm dialogs (US-7.1).
 * Consumer: `/operator/scripts` generate/regenerate flows.
 */
export async function getReelBudgetPreview(
  rawInput: unknown,
): Promise<GetReelBudgetPreviewResult> {
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

    const parsed = getReelBudgetPreviewInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return costPolicyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const built = await buildReelBudgetPreview({
      clientId: operator.id,
      weekStart: parsed.data.weekStart,
      jobKind: parsed.data.jobKind,
      mode: parsed.data.mode,
      slotIndex: parsed.data.slotIndex,
    });

    if (!built.ok) {
      if (built.code === "PROVIDER_UNAVAILABLE") {
        return reelBudgetProviderUnavailableError();
      }
      if (built.code === "STRATEGY_NOT_APPROVED" || built.code === "SLOT_NOT_FOUND") {
        return costPolicyValidationError();
      }
      return reelBudgetPreviewUnavailableError();
    }

    if ("isBatch" in built && built.isBatch) {
      const validated = reelBudgetBatchPreviewSchema.safeParse(built.preview);
      if (!validated.success) {
        return reelBudgetPreviewUnavailableError();
      }
      return { ok: true, preview: validated.data, isBatch: true };
    }

    const validated = reelBudgetPreviewSchema.safeParse(built.preview);
    if (!validated.success) {
      return reelBudgetPreviewUnavailableError();
    }

    return { ok: true, preview: validated.data };
  } catch (error) {
    console.error("[cost-policy] getReelBudgetPreview failed", error);
    return costPolicyInternalError();
  }
}
