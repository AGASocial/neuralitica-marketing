"use server";

import { revalidatePath } from "next/cache";

import {
  approveContentStrategyInputSchema,
  contentStrategyBriefSchema,
  type ApproveContentStrategyResult,
} from "@/lib/contracts/content-strategy";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
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
 * Operator approval of draft strategy (US-4.2).
 * Frontend consumer: `/operator/strategy` — Approve strategy CTA.
 */
export async function approveContentStrategy(
  rawInput: unknown,
): Promise<ApproveContentStrategyResult> {
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

    const parsed = approveContentStrategyInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return contentStrategyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientId = operator.id;
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
      approvedBy: operator.id,
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

    return {
      ok: true,
      strategyId,
      weekStart,
      version: approved.version,
      status: "approved",
      approvedBy: {
        id: operator.id,
        displayName: operator.displayName,
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
