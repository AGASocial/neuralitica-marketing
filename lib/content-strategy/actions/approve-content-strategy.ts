"use server";

import { revalidatePath } from "next/cache";

import {
  approveContentStrategyInputSchema,
  contentStrategyBriefSchema,
  type ApproveContentStrategyResult,
} from "@/lib/contracts/content-strategy";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  contentStrategyAgentOutputInvalidError,
  contentStrategyForbiddenError,
  contentStrategyForbiddenFieldsError,
  contentStrategyInternalError,
  contentStrategyInvalidTransitionError,
  contentStrategyLockedError,
  contentStrategyNotDraftError,
  contentStrategyNotFoundError,
  contentStrategyUnauthenticatedError,
  contentStrategyValidationError,
} from "@/lib/content-strategy/errors";
import { approveStrategyRow } from "@/lib/content-strategy/approve-strategy-row";
import { findForbiddenContentStrategyKeys } from "@/lib/content-strategy/find-forbidden-keys";
import { loadStrategyRowForOperator } from "@/lib/content-strategy/load-strategy-row-for-operator";
import {
  isStrategyLockAfterScriptsEnabled,
  strategyHasScripts,
} from "@/lib/content-strategy/strategy-has-scripts";
import { validateStrategyBriefAllowlists } from "@/lib/content-strategy/validate-strategy-brief-allowlists";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): ApproveContentStrategyResult {
  if (error.status === 401) {
    return contentStrategyUnauthenticatedError();
  }
  return contentStrategyForbiddenError();
}

/**
 * Draft strategy approval (US-4.2 / KAN-106).
 * Owners approve their own draft; operators approve for their session client.
 */
export async function approveContentStrategy(
  rawInput: unknown,
): Promise<ApproveContentStrategyResult> {
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

    if (findForbiddenContentStrategyKeys(rawInput).length > 0) {
      return contentStrategyForbiddenFieldsError();
    }

    const parsed = approveContentStrategyInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return contentStrategyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientId = user.id;
    const { strategyId, weekStart } = parsed.data;

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

    const briefParsed = contentStrategyBriefSchema.safeParse(row.brief);
    if (!briefParsed.success) {
      return contentStrategyAgentOutputInvalidError(
        zodInterviewErrorToFieldErrors(briefParsed.error),
      );
    }

    const allowlistError = await validateStrategyBriefAllowlists({
      brief: briefParsed.data,
      clientId,
      weekStart,
    });
    if (allowlistError) {
      return allowlistError;
    }

    const approved = await approveStrategyRow({
      strategyId,
      clientId,
      approvedBy: user.id,
    });

    if (!approved.ok) {
      return contentStrategyInvalidTransitionError();
    }

    console.info("[content-strategy] approve", {
      strategyId,
      clientId,
      action: "approve",
    });

    revalidatePath("/operator/strategy");
    revalidatePath("/dashboard");
    revalidatePath("/conversation");

    return {
      ok: true,
      strategyId,
      weekStart,
      version: approved.version,
      status: "approved",
      approvedBy: {
        id: user.id,
        displayName: user.displayName,
      },
      approvedAt: approved.approvedAt,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[content-strategy] approve unexpected error");
    return contentStrategyInternalError();
  }
}
