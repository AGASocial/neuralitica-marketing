"use server";

import { revalidatePath } from "next/cache";

import {
  generateContentStrategyInputSchema,
  type GenerateContentStrategyResult,
} from "@/lib/contracts/content-strategy";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { checkGenerationRateLimit } from "@/lib/content-strategy/check-generation-rate-limit";
import {
  contentStrategyForbiddenError,
  contentStrategyForbiddenFieldsError,
  contentStrategyInFlightError,
  contentStrategyInternalError,
  contentStrategyNotFoundError,
  contentStrategyRateLimitedError,
  contentStrategyUnauthenticatedError,
  contentStrategyValidationError,
} from "@/lib/content-strategy/errors";
import { findForbiddenContentStrategyKeys } from "@/lib/content-strategy/find-forbidden-keys";
import { generateContentStrategyForClient } from "@/lib/content-strategy/generate-content-strategy-for-client";
import { validateActiveOperatorClientId } from "@/lib/content-strategy/validate-active-operator-client-id";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GenerateContentStrategyResult {
  if (error.status === 401) {
    return contentStrategyUnauthenticatedError();
  }
  return contentStrategyForbiddenError();
}

/**
 * Operator trigger for weekly content strategy generation (US-4.1).
 * Frontend consumer: `/operator/strategy` — Generate strategy button.
 */
export async function generateContentStrategy(
  rawInput: unknown,
): Promise<GenerateContentStrategyResult> {
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

    const parsed = generateContentStrategyInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return contentStrategyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const { weekStart, clientId: requestedClientId } = parsed.data;

    let clientId = operator.id;
    if (requestedClientId !== undefined) {
      const clientCheck = await validateActiveOperatorClientId(requestedClientId);
      if (!clientCheck.ok) {
        return contentStrategyNotFoundError();
      }
      clientId = requestedClientId;
    }

    const rateCheck = await checkGenerationRateLimit({ clientId, weekStart });
    if (!rateCheck.ok) {
      if (rateCheck.code === "RATE_LIMITED") {
        return contentStrategyRateLimitedError();
      }
      return contentStrategyInFlightError();
    }

    const result = await generateContentStrategyForClient({
      clientId,
      weekStart,
      invokedBy: "operator",
    });

    if (result.ok) {
      revalidatePath("/operator/strategy");
    }

    return result;
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[content-strategy] generate unexpected error");
    return contentStrategyInternalError();
  }
}
