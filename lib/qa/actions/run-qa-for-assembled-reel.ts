"use server";

import { revalidatePath } from "next/cache";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  runQaForAssembledReelInputSchema,
  type RunQaForAssembledReelResult,
} from "@/lib/contracts/qa-report";
import {
  qaForbiddenError,
  qaForbiddenFieldsError,
  qaInternalError,
  qaUnauthenticatedError,
  qaValidationError,
} from "@/lib/qa/errors";
import { findForbiddenQaRunKeys } from "@/lib/qa/find-forbidden-qa-run-keys";
import { runQaForAssembledReelForClient } from "@/lib/qa/run-qa-for-assembled-reel";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

/**
 * Operator Server Action — Run / Re-run QA (US-10.1).
 * Accepts `{ assembledReelId }` only. Frontend: `/operator/scripts` QA panel.
 */
export async function runQaForAssembledReel(
  rawInput: unknown,
): Promise<RunQaForAssembledReelResult> {
  try {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return error.status === 401
          ? qaUnauthenticatedError()
          : qaForbiddenError();
      }
      throw error;
    }

    if (findForbiddenQaRunKeys(rawInput).length > 0) {
      return qaForbiddenFieldsError();
    }

    const parsed = runQaForAssembledReelInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return qaValidationError(zodInterviewErrorToFieldErrors(parsed.error));
    }

    const result = await runQaForAssembledReelForClient({
      assembledReelId: parsed.data.assembledReelId,
      clientId: operator.id,
      invokedBy: "operator",
      operatorClientId: operator.id,
    });

    if (result.ok) {
      revalidatePath("/operator/scripts");
    }

    return result;
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? qaUnauthenticatedError()
        : qaForbiddenError();
    }
    console.error("[qa] runQaForAssembledReel unexpected error");
    return qaInternalError();
  }
}
