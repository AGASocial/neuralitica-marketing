"use server";

import { revalidatePath } from "next/cache";

import {
  generateContentStrategyInputSchema,
  type GenerateContentStrategyResult,
} from "@/lib/contracts/content-strategy";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
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
 * Weekly content strategy generation (US-4.1 / KAN-106).
 * Operators may target another active client via `clientId`.
 * Owners (Cliente) always generate for themselves.
 */
export async function generateContentStrategy(
  rawInput: unknown,
): Promise<GenerateContentStrategyResult> {
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

    const parsed = generateContentStrategyInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return contentStrategyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const { weekStart, clientId: requestedClientId } = parsed.data;

    let clientId = user.id;
    if (user.role === "operator" && requestedClientId !== undefined) {
      const clientCheck = await validateActiveOperatorClientId(requestedClientId);
      if (!clientCheck.ok) {
        return contentStrategyNotFoundError();
      }
      clientId = requestedClientId;
    } else if (user.role !== "operator" && requestedClientId !== undefined) {
      return contentStrategyForbiddenError();
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
      invokedBy: user.role === "operator" ? "operator" : "client",
    });

    if (result.ok) {
      revalidatePath("/operator/strategy");
      revalidatePath("/dashboard");
      revalidatePath("/conversation");
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
