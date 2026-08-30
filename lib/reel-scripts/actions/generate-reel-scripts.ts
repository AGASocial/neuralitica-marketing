"use server";

import { revalidatePath } from "next/cache";

import {
  generateReelScriptsInputSchema,
  type GenerateReelScriptsResult,
} from "@/lib/contracts/reel-script";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  checkScriptGenerationRateLimit,
} from "@/lib/reel-scripts/check-script-generation-rate-limit";
import {
  reelScriptForbiddenError,
  reelScriptForbiddenFieldsError,
  reelScriptInFlightError,
  reelScriptInternalError,
  reelScriptRateLimitedError,
  reelScriptStrategyNotApprovedError,
  reelScriptUnauthenticatedError,
  reelScriptValidationError,
} from "@/lib/reel-scripts/errors";
import { findForbiddenReelScriptKeys } from "@/lib/reel-scripts/find-forbidden-keys";
import { generateReelScriptsForClient } from "@/lib/reel-scripts/generate-reel-scripts-for-client";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GenerateReelScriptsResult {
  if (error.status === 401) {
    return reelScriptUnauthenticatedError();
  }
  return reelScriptForbiddenError();
}

/**
 * Operator batch generate for all slots on approved strategy (US-5.1).
 * Frontend consumer: `/operator/scripts` — Generate scripts button.
 */
export async function generateReelScripts(
  rawInput: unknown,
): Promise<GenerateReelScriptsResult> {
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

    if (findForbiddenReelScriptKeys(rawInput).length > 0) {
      return reelScriptForbiddenFieldsError();
    }

    const parsed = generateReelScriptsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return reelScriptValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientId = operator.id;
    const { weekStart } = parsed.data;

    const approved = await getApprovedStrategyForWeek({ clientId, weekStart });
    if (!approved || approved.status !== "approved") {
      return reelScriptStrategyNotApprovedError();
    }

    const rateCheck = await checkScriptGenerationRateLimit({
      clientId,
      scope: { mode: "batch", clientId, strategyId: approved.id },
    });
    if (!rateCheck.ok) {
      if (rateCheck.code === "RATE_LIMITED") {
        return reelScriptRateLimitedError();
      }
      return reelScriptInFlightError();
    }

    const result = await generateReelScriptsForClient({
      clientId,
      weekStart,
      strategyId: approved.id,
      invokedBy: "operator",
      mode: "batch",
    });

    if (result.ok) {
      revalidatePath("/operator/scripts");
      revalidatePath("/operator/strategy");
    }

    return result;
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[reel-scripts] generate unexpected error");
    return reelScriptInternalError();
  }
}
