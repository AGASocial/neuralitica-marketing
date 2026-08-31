"use server";

import {
  findForbiddenReelMetricsKeys,
  upsertReelMetricsInputSchema,
  type UpsertReelMetricsResult,
} from "@/lib/contracts/reel-metrics";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  reelMetricsForbiddenError,
  reelMetricsForbiddenFieldsError,
  reelMetricsInternalError,
  reelMetricsUnauthenticatedError,
  reelMetricsValidationError,
} from "@/lib/metrics/errors";
import { upsertReelMetricsCore } from "@/lib/metrics/upsert-reel-metrics";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UpsertReelMetricsResult {
  if (error.status === 401) {
    return reelMetricsUnauthenticatedError();
  }
  return reelMetricsForbiddenError();
}

/**
 * Operator reel metrics upsert mutation (US-13.1).
 * Frontend consumer: `/operator/calendar` Sidebar metrics form.
 */
export async function upsertReelMetrics(
  rawInput: unknown,
): Promise<UpsertReelMetricsResult> {
  let operator;
  try {
    operator = await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenReelMetricsKeys(rawInput).length > 0) {
    return reelMetricsForbiddenFieldsError();
  }

  const parsed = upsertReelMetricsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return reelMetricsValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  try {
    return await upsertReelMetricsCore({
      input: parsed.data,
      operator,
    });
  } catch {
    return reelMetricsInternalError();
  }
}
