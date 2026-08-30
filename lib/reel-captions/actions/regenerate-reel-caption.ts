"use server";

import { revalidatePath } from "next/cache";

import {
  regenerateReelCaptionInputSchema,
  type RegenerateReelCaptionResult,
} from "@/lib/contracts/reel-caption";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import { checkCaptionGenerationRateLimit } from "@/lib/reel-captions/check-caption-generation-rate-limit";
import {
  reelCaptionForbiddenError,
  reelCaptionForbiddenFieldsError,
  reelCaptionInFlightError,
  reelCaptionInternalError,
  reelCaptionRateLimitedError,
  reelCaptionStrategyNotApprovedError,
  reelCaptionUnauthenticatedError,
  reelCaptionValidationError,
} from "@/lib/reel-captions/errors";
import { findForbiddenReelCaptionKeys } from "@/lib/reel-captions/find-forbidden-keys";
import { generateReelCaptionsForClient } from "@/lib/reel-captions/generate-reel-captions-for-client";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): RegenerateReelCaptionResult {
  if (error.status === 401) {
    return reelCaptionUnauthenticatedError();
  }
  return reelCaptionForbiddenError();
}

/**
 * Operator single-slot caption regenerate (US-6.1).
 * Frontend consumer: `/operator/scripts` Caption tab — Regenerate caption.
 */
export async function regenerateReelCaption(
  rawInput: unknown,
): Promise<RegenerateReelCaptionResult> {
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

    if (findForbiddenReelCaptionKeys(rawInput).length > 0) {
      return reelCaptionForbiddenFieldsError();
    }

    const parsed = regenerateReelCaptionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return reelCaptionValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientId = operator.id;
    const { weekStart, slotIndex } = parsed.data;

    const approved = await getApprovedStrategyForWeek({ clientId, weekStart });
    if (!approved || approved.status !== "approved") {
      return reelCaptionStrategyNotApprovedError();
    }

    const rateCheck = await checkCaptionGenerationRateLimit({
      clientId,
      scope: {
        mode: "slot",
        clientId,
        strategyId: approved.id,
        slotIndex,
      },
    });
    if (!rateCheck.ok) {
      if (rateCheck.code === "RATE_LIMITED") {
        return reelCaptionRateLimitedError();
      }
      return reelCaptionInFlightError();
    }

    const result = await generateReelCaptionsForClient({
      clientId,
      weekStart,
      strategyId: approved.id,
      invokedBy: "operator",
      mode: "slot",
      slotIndex,
    });

    if (result.ok) {
      revalidatePath("/operator/scripts");
    }

    return result;
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[reel-captions] regenerate unexpected error");
    return reelCaptionInternalError();
  }
}
