"use server";

import { z } from "zod";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  reelProviderRecommendationSchema,
  type ReelProviderRecommendation,
} from "@/lib/contracts/provider-decisions";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

import {
  costPolicyForbiddenError,
  costPolicyInternalError,
  costPolicyUnauthenticatedError,
  costPolicyValidationError,
  reelBudgetProviderUnavailableError,
} from "../cost-policy-action-errors";
import { getReelProviderRecommendations as loadReelProviderRecommendations } from "../get-reel-provider-recommendations";

/** FE boundary — clientId derived from requireOperator(); never pass clientId from browser. */
const getReelProviderRecommendationsActionInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6).optional(),
  })
  .strict();

export type GetReelProviderRecommendationsErrorCode =
  | "STRATEGY_NOT_APPROVED"
  | "PROVIDER_UNAVAILABLE"
  | "SLOT_NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INTERNAL_ERROR";

export type GetReelProviderRecommendationsResult =
  | { ok: true; items: ReelProviderRecommendation[] }
  | {
      ok: false;
      error: { code: GetReelProviderRecommendationsErrorCode };
    };

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GetReelProviderRecommendationsResult {
  if (error.status === 401) {
    return costPolicyUnauthenticatedError() as GetReelProviderRecommendationsResult;
  }
  return costPolicyForbiddenError() as GetReelProviderRecommendationsResult;
}

/**
 * Operator read surface for per-slot provider recommendations (US-7.2).
 * Consumer: `/operator/scripts` expand-row panel.
 */
export async function getReelProviderRecommendations(
  rawInput: unknown,
): Promise<GetReelProviderRecommendationsResult> {
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

    const parsed = getReelProviderRecommendationsActionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return costPolicyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      ) as GetReelProviderRecommendationsResult;
    }

    const built = await loadReelProviderRecommendations({
      clientId: operator.id,
      weekStart: parsed.data.weekStart,
      slotIndex: parsed.data.slotIndex,
    });

    if (!built.ok) {
      if (built.error.code === "PROVIDER_UNAVAILABLE") {
        return reelBudgetProviderUnavailableError() as GetReelProviderRecommendationsResult;
      }
      if (built.error.code === "FORBIDDEN") {
        return costPolicyForbiddenError() as GetReelProviderRecommendationsResult;
      }
      return {
        ok: false,
        error: { code: built.error.code },
      };
    }

    const validatedItems: ReelProviderRecommendation[] = [];
    for (const item of built.items) {
      const validated = reelProviderRecommendationSchema.safeParse(item);
      if (!validated.success) {
        return costPolicyInternalError() as GetReelProviderRecommendationsResult;
      }
      validatedItems.push(validated.data);
    }

    return { ok: true, items: validatedItems };
  } catch (error) {
    console.error("[cost-policy] getReelProviderRecommendations failed", error);
    return costPolicyInternalError() as GetReelProviderRecommendationsResult;
  }
}
