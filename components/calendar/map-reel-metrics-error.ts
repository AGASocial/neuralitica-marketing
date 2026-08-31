import {
  REEL_METRICS_MESSAGE_KEYS,
  type ReelMetricsErrorCode,
  type ReelMetricsErrorEnvelope,
} from "@/lib/contracts/reel-metrics";

export type ReelMetricsErrorCopy = {
  notFound: string;
  notPublished: string;
  editWindowExpired: string;
  rateLimited: string;
  validation: string;
  forbidden: string;
  forbiddenFields: string;
  internal: string;
  unauthenticated: string;
};

const METRIC_FIELDS = ["views", "likes", "comments", "saves", "dms"] as const;

export function mapReelMetricsError(
  error: ReelMetricsErrorEnvelope["error"],
  copy: ReelMetricsErrorCopy,
): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  if (error.code === "VALIDATION_ERROR" && error.fields) {
    for (const [field, messages] of Object.entries(error.fields)) {
      if (METRIC_FIELDS.includes(field as (typeof METRIC_FIELDS)[number])) {
        fieldErrors[field] = messages[0] ?? copy.validation;
      } else {
        fieldErrors[field] = messages[0] ?? copy.validation;
      }
    }
  }

  const message = resolveReelMetricsErrorMessage(error, copy);

  return { message, fieldErrors };
}

function resolveReelMetricsErrorMessage(
  error: ReelMetricsErrorEnvelope["error"],
  copy: ReelMetricsErrorCopy,
): string {
  if (error.messageKey) {
    switch (error.messageKey) {
      case REEL_METRICS_MESSAGE_KEYS.notFound:
        return copy.notFound;
      case REEL_METRICS_MESSAGE_KEYS.notPublished:
        return copy.notPublished;
      case REEL_METRICS_MESSAGE_KEYS.editWindowExpired:
        return copy.editWindowExpired;
      case REEL_METRICS_MESSAGE_KEYS.rateLimited:
        return copy.rateLimited;
      case REEL_METRICS_MESSAGE_KEYS.validation:
        return copy.validation;
      case REEL_METRICS_MESSAGE_KEYS.forbiddenFields:
        return copy.forbiddenFields;
      case "calendar.errors.internal":
        return copy.internal;
      case "auth.errors.unauthenticated":
        return copy.unauthenticated;
      case "auth.errors.forbidden":
        return copy.forbidden;
      default:
        break;
    }
  }

  return mapReelMetricsErrorCode(error.code, copy);
}

function mapReelMetricsErrorCode(
  code: ReelMetricsErrorCode,
  copy: ReelMetricsErrorCopy,
): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return copy.unauthenticated;
    case "FORBIDDEN":
      return copy.forbidden;
    case "FORBIDDEN_FIELDS":
      return copy.forbiddenFields;
    case "VALIDATION_ERROR":
      return copy.validation;
    case "NOT_FOUND":
      return copy.notFound;
    case "NOT_PUBLISHED":
      return copy.notPublished;
    case "EDIT_WINDOW_EXPIRED":
      return copy.editWindowExpired;
    case "RATE_LIMITED":
      return copy.rateLimited;
    case "INTERNAL_ERROR":
    default:
      return copy.internal;
  }
}
