"use server";

import { revalidatePath } from "next/cache";

import {
  computeEffectiveCaptionCharCount,
  isEffectiveCaptionOverLimit,
  resolveSelectedCtaVariant,
  selectReelCaptionCtaInputSchema,
  type SelectReelCaptionCtaResult,
} from "@/lib/contracts/reel-caption";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  reelCaptionCtaIndexOutOfBoundsError,
  reelCaptionForbiddenError,
  reelCaptionForbiddenFieldsError,
  reelCaptionInternalError,
  reelCaptionNotFoundForSelectError,
  reelCaptionStrategyNotApprovedError,
  reelCaptionUnauthenticatedError,
  reelCaptionValidationError,
} from "@/lib/reel-captions/errors";
import { findForbiddenSelectReelCaptionCtaKeys } from "@/lib/reel-captions/find-forbidden-select-keys";
import { loadReelCaptionForClient } from "@/lib/reel-captions/load-reel-caption-for-client";
import { updateSelectedCtaIndex } from "@/lib/reel-captions/update-selected-cta-index";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): SelectReelCaptionCtaResult {
  if (error.status === 401) {
    return reelCaptionUnauthenticatedError();
  }
  return reelCaptionForbiddenError();
}

/**
 * Operator CTA variant selection (US-6.2).
 * Frontend consumer: `/operator/scripts` Caption tab — radio/select among CTA variants.
 */
export async function selectReelCaptionCta(
  rawInput: unknown,
): Promise<SelectReelCaptionCtaResult> {
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

    if (findForbiddenSelectReelCaptionCtaKeys(rawInput).length > 0) {
      return reelCaptionForbiddenFieldsError();
    }

    const parsed = selectReelCaptionCtaInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return reelCaptionValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientId = operator.id;
    const { weekStart, slotIndex, selectedCtaIndex } = parsed.data;

    const approved = await getApprovedStrategyForWeek({ clientId, weekStart });
    if (!approved || approved.status !== "approved") {
      return reelCaptionStrategyNotApprovedError();
    }

    const caption = await loadReelCaptionForClient({
      clientId,
      weekStart,
      slotIndex,
    });
    if (!caption) {
      return reelCaptionNotFoundForSelectError();
    }

    if (selectedCtaIndex >= caption.record.ctaVariants.length) {
      return reelCaptionCtaIndexOutOfBoundsError();
    }

    const selectedCtaText = resolveSelectedCtaVariant(
      caption.record,
      selectedCtaIndex,
    );
    if (selectedCtaText === null) {
      return reelCaptionNotFoundForSelectError();
    }

    const updateResult = await updateSelectedCtaIndex({
      captionId: caption.captionId,
      clientId,
      selectedCtaIndex,
    });
    if (!updateResult.ok) {
      return reelCaptionInternalError();
    }

    const effectiveCaptionCharCount = computeEffectiveCaptionCharCount({
      caption: caption.record.caption,
      selectedCtaText,
    });

    console.info("[reel-captions] selectReelCaptionCta success", {
      captionId: caption.captionId,
      reelScriptId: caption.reelScriptId,
      clientId,
      slotIndex,
      selectedCtaIndex,
    });

    revalidatePath("/operator/scripts");

    return {
      ok: true,
      weekStart,
      slotIndex,
      captionId: caption.captionId,
      reelScriptId: caption.reelScriptId,
      selectedCtaIndex,
      selectedCtaText,
      effectiveCaptionCharCount,
      effectiveCaptionOverLimit: isEffectiveCaptionOverLimit(
        effectiveCaptionCharCount,
      ),
      updatedAt: updateResult.updatedAt,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[reel-captions] select unexpected error");
    return reelCaptionInternalError();
  }
}
