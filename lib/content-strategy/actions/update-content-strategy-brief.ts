"use server";

import { revalidatePath } from "next/cache";

import {
  updateContentStrategyBriefInputSchema,
  contentStrategyBriefSchema,
  type UpdateContentStrategyBriefResult,
} from "@/lib/contracts/content-strategy";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  contentStrategyAgentOutputInvalidError,
  contentStrategyForbiddenError,
  contentStrategyForbiddenFieldsError,
  contentStrategyInternalError,
  contentStrategyLockedError,
  contentStrategyNotDraftError,
  contentStrategyNotFoundError,
  contentStrategyUnauthenticatedError,
  contentStrategyValidationError,
} from "@/lib/content-strategy/errors";
import { findForbiddenContentStrategyKeys } from "@/lib/content-strategy/find-forbidden-keys";
import { loadStrategyRowForOperator } from "@/lib/content-strategy/load-strategy-row-for-operator";
import { mergeEditableBriefFields } from "@/lib/content-strategy/merge-editable-brief-fields";
import {
  isStrategyLockAfterScriptsEnabled,
  strategyHasScripts,
} from "@/lib/content-strategy/strategy-has-scripts";
import { updateStrategyBrief } from "@/lib/content-strategy/update-strategy-brief";
import { validateStrategyBriefAllowlists } from "@/lib/content-strategy/validate-strategy-brief-allowlists";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UpdateContentStrategyBriefResult {
  if (error.status === 401) {
    return contentStrategyUnauthenticatedError();
  }
  return contentStrategyForbiddenError();
}

/**
 * Operator save of draft brief edits (US-4.2).
 * Frontend consumer: `/operator/strategy` — Save changes button.
 */
export async function updateContentStrategyBrief(
  rawInput: unknown,
): Promise<UpdateContentStrategyBriefResult> {
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

    if (findForbiddenContentStrategyKeys(rawInput).length > 0) {
      return contentStrategyForbiddenFieldsError();
    }

    const parsed = updateContentStrategyBriefInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return contentStrategyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientId = operator.id;
    const { strategyId, weekStart, editable } = parsed.data;

    const row = await loadStrategyRowForOperator({ strategyId, clientId });
    if (!row || row.weekStart !== weekStart) {
      return contentStrategyNotFoundError();
    }

    if (row.status !== "draft") {
      return contentStrategyNotDraftError();
    }

    if (
      isStrategyLockAfterScriptsEnabled() &&
      (await strategyHasScripts(strategyId))
    ) {
      return contentStrategyLockedError();
    }

    const storedBriefParsed = contentStrategyBriefSchema.safeParse(row.brief);
    if (!storedBriefParsed.success) {
      return contentStrategyAgentOutputInvalidError(
        zodInterviewErrorToFieldErrors(storedBriefParsed.error),
      );
    }

    const merged = mergeEditableBriefFields(storedBriefParsed.data, editable);
    if (!merged.ok) {
      return contentStrategyValidationError(merged.fields);
    }

    const allowlistError = await validateStrategyBriefAllowlists({
      brief: merged.brief,
      clientId,
      weekStart,
    });
    if (allowlistError) {
      return allowlistError;
    }

    const updated = await updateStrategyBrief({
      strategyId,
      clientId,
      brief: merged.brief,
    });

    if (!updated.ok) {
      return contentStrategyNotDraftError();
    }

    console.info("[content-strategy] update", {
      strategyId,
      clientId,
      action: "update",
    });

    revalidatePath("/operator/strategy");

    return {
      ok: true,
      strategyId,
      weekStart,
      version: updated.version,
      status: "draft",
      updatedAt: updated.updatedAt,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[content-strategy] update unexpected error");
    return contentStrategyInternalError();
  }
}
