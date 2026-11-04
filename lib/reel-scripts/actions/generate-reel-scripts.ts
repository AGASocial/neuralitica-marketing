"use server";

import { revalidatePath } from "next/cache";

import {
  generateReelScriptsInputSchema,
  type GenerateReelScriptsResult,
} from "@/lib/contracts/reel-script";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
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
 * Batch generate scripts for approved strategy (US-5.1 / KAN-106).
 * Owners generate for themselves; operators for their session client.
 */
export async function generateReelScripts(
  rawInput: unknown,
): Promise<GenerateReelScriptsResult> {
  try {
    let user;
    try {
      user = await requireActive("handler");
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

    const clientId = user.id;
    const { weekStart } = parsed.data;

    // Owners must not pass operator-only budget overrides.
    if (
      user.role !== "operator" &&
      (parsed.data.budgetOverride !== undefined ||
        parsed.data.overrideReason !== undefined)
    ) {
      return reelScriptForbiddenError();
    }

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
      invokedBy: user.role === "operator" ? "operator" : "system",
      mode: "batch",
      operatorClientId: clientId,
      budgetOverride: parsed.data.budgetOverride,
      overrideReason: parsed.data.overrideReason,
    });

    const partiallySaved =
      !result.ok &&
      result.error.code === "SCRIPT_OUTPUT_INVALID" &&
      (result.error.fields?.savedSlotIndexes?.length ?? 0) > 0;
    if (result.ok || partiallySaved) {
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
