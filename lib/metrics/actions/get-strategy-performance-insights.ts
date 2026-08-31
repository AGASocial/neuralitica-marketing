"use server";

import {
  findForbiddenStrategyInsightsReadKeys,
  getStrategyPerformanceInsightsInputSchema,
  type GetStrategyPerformanceInsightsResult,
} from "@/lib/contracts/strategy-insights";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { validateActiveOperatorClientId } from "@/lib/content-strategy/validate-active-operator-client-id";
import { aggregateReelMetricsByTema } from "@/lib/metrics/aggregate-reel-metrics-by-tema";
import {
  strategyInsightsForbiddenError,
  strategyInsightsForbiddenFieldsError,
  strategyInsightsInternalError,
  strategyInsightsNotFoundError,
  strategyInsightsUnauthenticatedError,
  strategyInsightsValidationError,
} from "@/lib/metrics/strategy-insights-errors";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GetStrategyPerformanceInsightsResult {
  if (error.status === 401) {
    return strategyInsightsUnauthenticatedError();
  }
  return strategyInsightsForbiddenError();
}

/**
 * Operator read of strategy performance insights (US-13.2).
 * Frontend consumer: `/operator/strategy` — StrategyInsightsPanel refresh.
 */
export async function getStrategyPerformanceInsights(
  rawInput: unknown,
): Promise<GetStrategyPerformanceInsightsResult> {
  try {
    try {
      await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return authGuardEnvelope(error);
      }
      throw error;
    }

    if (findForbiddenStrategyInsightsReadKeys(rawInput).length > 0) {
      return strategyInsightsForbiddenFieldsError();
    }

    const parsed = getStrategyPerformanceInsightsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return strategyInsightsValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientCheck = await validateActiveOperatorClientId(parsed.data.clientId);
    if (!clientCheck.ok) {
      return strategyInsightsNotFoundError();
    }

    const insights = await aggregateReelMetricsByTema({
      clientId: parsed.data.clientId,
      weekStart: parsed.data.weekStart,
    });

    return { ok: true, insights };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[strategy-insights] getStrategyPerformanceInsights failed");
    return strategyInsightsInternalError();
  }
}
