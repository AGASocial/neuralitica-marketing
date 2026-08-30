"use server";

import { revalidatePath } from "next/cache";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import type { OverrideQaCheckResult } from "@/lib/contracts/qa-override";
import {
  qaOverrideForbiddenError,
  qaOverrideInternalError,
  qaOverrideUnauthenticatedError,
} from "@/lib/qa/override-errors";
import { overrideQaCheckForClient } from "@/lib/qa/override-qa-check";

/**
 * Operator Server Action — per-check QA override (US-10.2).
 * Accepts `{ qaReportId, checkKey, reason }` only.
 * Frontend: `/operator/scripts` OperatorQaPanel Override Dialog.
 *
 * requireOperator("handler") is the first await — failure → 401/403, no INSERT.
 */
export async function overrideQaCheck(
  rawInput: unknown,
): Promise<OverrideQaCheckResult> {
  try {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return error.status === 401
          ? qaOverrideUnauthenticatedError()
          : qaOverrideForbiddenError();
      }
      throw error;
    }

    const result = await overrideQaCheckForClient({
      rawInput,
      operator,
    });

    if (result.ok) {
      revalidatePath("/operator/scripts");
    }

    return result;
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? qaOverrideUnauthenticatedError()
        : qaOverrideForbiddenError();
    }
    console.error("[qa-override] overrideQaCheck unexpected error");
    return qaOverrideInternalError();
  }
}
