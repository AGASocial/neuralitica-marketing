import {
  CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS,
  type CalendarErrorCode,
  type CalendarErrorEnvelope,
} from "@/lib/contracts/calendar";

export type MarkPublishedErrorCopy = {
  notFound: string;
  notApproved: string;
  slotNotReady: string;
  rateLimited: string;
  invalidIgUrl: string;
  forbidden: string;
  validation: string;
  forbiddenFields: string;
  internal: string;
  unauthenticated: string;
};

export function mapMarkPublishedError(
  error: CalendarErrorEnvelope["error"],
  copy: MarkPublishedErrorCopy,
): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  if (error.code === "VALIDATION_ERROR" && error.fields) {
    for (const [field, messages] of Object.entries(error.fields)) {
      if (field === "instagramPostUrl") {
        fieldErrors.instagramPostUrl = copy.invalidIgUrl;
      } else if (field === "publishedAt") {
        fieldErrors.publishedAt =
          messages[0] ?? copy.validation;
      } else {
        fieldErrors[field] = messages[0] ?? copy.validation;
      }
    }
  }

  if (error.messageKey === CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.invalidIgUrl) {
    fieldErrors.instagramPostUrl = copy.invalidIgUrl;
  }

  const message = resolveMarkPublishedErrorMessage(error, copy);

  return { message, fieldErrors };
}

function resolveMarkPublishedErrorMessage(
  error: CalendarErrorEnvelope["error"],
  copy: MarkPublishedErrorCopy,
): string {
  if (error.messageKey) {
    switch (error.messageKey) {
      case CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.notFound:
        return copy.notFound;
      case CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.notApproved:
        return copy.notApproved;
      case CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.slotNotReady:
        return copy.slotNotReady;
      case CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.rateLimited:
        return copy.rateLimited;
      case CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.invalidIgUrl:
        return copy.invalidIgUrl;
      case "calendar.errors.validation":
        return copy.validation;
      case "calendar.errors.forbiddenFields":
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

  return mapMarkPublishedErrorCode(error.code, copy);
}

function mapMarkPublishedErrorCode(
  code: CalendarErrorCode,
  copy: MarkPublishedErrorCopy,
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
    case "NOT_APPROVED":
      return copy.notApproved;
    case "SLOT_NOT_READY":
      return copy.slotNotReady;
    case "RATE_LIMITED":
      return copy.rateLimited;
    case "INTERNAL_ERROR":
    default:
      return copy.internal;
  }
}
