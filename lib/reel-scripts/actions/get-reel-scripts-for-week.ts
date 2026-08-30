"use server";

import {
  getReelScriptsForWeekInputSchema,
  type GetReelScriptsForWeekResult,
} from "@/lib/contracts/reel-script";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  reelScriptForbiddenError,
  reelScriptForbiddenFieldsError,
  reelScriptInternalError,
  reelScriptUnauthenticatedError,
  reelScriptValidationError,
} from "@/lib/reel-scripts/errors";
import { findForbiddenReelScriptKeys } from "@/lib/reel-scripts/find-forbidden-keys";
import { buildReelScriptListForStrategy } from "@/lib/reel-scripts/list-reel-scripts-for-week";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GetReelScriptsForWeekResult {
  if (error.status === 401) {
    return reelScriptUnauthenticatedError();
  }
  return reelScriptForbiddenError();
}

/**
 * Operator script list for a week (US-5.1).
 * Frontend consumer: `/operator/scripts` — initial load + week picker refresh.
 */
export async function getReelScriptsForWeek(
  rawInput: unknown,
): Promise<GetReelScriptsForWeekResult> {
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

    const parsed = getReelScriptsForWeekInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return reelScriptValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientId = operator.id;
    const { weekStart } = parsed.data;

    const approved = await getApprovedStrategyForWeek({ clientId, weekStart });
    if (!approved || approved.status !== "approved") {
      return {
        ok: true,
        weekStart,
        approvedStrategy: null,
        strategyVersionChanged: false,
        items: [],
      };
    }

    const { items, strategyVersionChanged } = await buildReelScriptListForStrategy(
      {
        clientId,
        weekStart,
        strategyId: approved.id,
        version: approved.version,
        brief: approved.brief,
      },
    );

    return {
      ok: true,
      weekStart,
      approvedStrategy: {
        id: approved.id,
        version: approved.version,
        status: "approved",
      },
      strategyVersionChanged,
      items,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[reel-scripts] list unexpected error");
    return reelScriptInternalError();
  }
}
