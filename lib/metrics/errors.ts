import type {
  ReelMetricsErrorCode,
  ReelMetricsErrorEnvelope,
} from "@/lib/contracts/reel-metrics";
import { REEL_METRICS_MESSAGE_KEYS } from "@/lib/contracts/reel-metrics";

export function reelMetricsError(
  code: ReelMetricsErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): ReelMetricsErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function reelMetricsValidationError(
  fields: Record<string, string[]>,
): ReelMetricsErrorEnvelope {
  return reelMetricsError(
    "VALIDATION_ERROR",
    REEL_METRICS_MESSAGE_KEYS.validation,
    { fields },
  );
}

export function reelMetricsForbiddenFieldsError(): ReelMetricsErrorEnvelope {
  return reelMetricsError(
    "FORBIDDEN_FIELDS",
    REEL_METRICS_MESSAGE_KEYS.forbiddenFields,
  );
}

export function reelMetricsInternalError(): ReelMetricsErrorEnvelope {
  return reelMetricsError("INTERNAL_ERROR", "calendar.errors.internal");
}

export function reelMetricsUnauthenticatedError(): ReelMetricsErrorEnvelope {
  return reelMetricsError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function reelMetricsForbiddenError(): ReelMetricsErrorEnvelope {
  return reelMetricsError("FORBIDDEN", "auth.errors.forbidden");
}

export function reelMetricsNotFoundError(): ReelMetricsErrorEnvelope {
  return reelMetricsError("NOT_FOUND", REEL_METRICS_MESSAGE_KEYS.notFound);
}

export function reelMetricsNotPublishedError(): ReelMetricsErrorEnvelope {
  return reelMetricsError(
    "NOT_PUBLISHED",
    REEL_METRICS_MESSAGE_KEYS.notPublished,
  );
}

export function reelMetricsEditWindowExpiredError(): ReelMetricsErrorEnvelope {
  return reelMetricsError(
    "EDIT_WINDOW_EXPIRED",
    REEL_METRICS_MESSAGE_KEYS.editWindowExpired,
  );
}

export function reelMetricsRateLimitedError(): ReelMetricsErrorEnvelope {
  return reelMetricsError(
    "RATE_LIMITED",
    REEL_METRICS_MESSAGE_KEYS.rateLimited,
  );
}
