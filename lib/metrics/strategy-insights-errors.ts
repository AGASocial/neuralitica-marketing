import type {
  StrategyInsightsErrorCode,
  GetStrategyPerformanceInsightsResult,
} from "@/lib/contracts/strategy-insights";
import { STRATEGY_INSIGHTS_MESSAGE_KEYS } from "@/lib/contracts/strategy-insights";

function strategyInsightsError(
  code: StrategyInsightsErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): Extract<GetStrategyPerformanceInsightsResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function strategyInsightsValidationError(
  fields: Record<string, string[]>,
): GetStrategyPerformanceInsightsResult {
  return strategyInsightsError(
    "VALIDATION_ERROR",
    STRATEGY_INSIGHTS_MESSAGE_KEYS.errors.validation,
    { fields },
  );
}

export function strategyInsightsForbiddenFieldsError(): GetStrategyPerformanceInsightsResult {
  return strategyInsightsError(
    "FORBIDDEN_FIELDS",
    STRATEGY_INSIGHTS_MESSAGE_KEYS.errors.forbiddenFields,
  );
}

export function strategyInsightsInternalError(): GetStrategyPerformanceInsightsResult {
  return strategyInsightsError(
    "INTERNAL_ERROR",
    STRATEGY_INSIGHTS_MESSAGE_KEYS.errors.internal,
  );
}

export function strategyInsightsUnauthenticatedError(): GetStrategyPerformanceInsightsResult {
  return strategyInsightsError(
    "UNAUTHENTICATED",
    STRATEGY_INSIGHTS_MESSAGE_KEYS.errors.unauthenticated,
  );
}

export function strategyInsightsForbiddenError(): GetStrategyPerformanceInsightsResult {
  return strategyInsightsError(
    "FORBIDDEN",
    STRATEGY_INSIGHTS_MESSAGE_KEYS.errors.forbidden,
  );
}

export function strategyInsightsNotFoundError(): GetStrategyPerformanceInsightsResult {
  return strategyInsightsError(
    "NOT_FOUND",
    STRATEGY_INSIGHTS_MESSAGE_KEYS.errors.notFound,
  );
}
