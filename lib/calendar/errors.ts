import type {
  CalendarErrorCode,
  CalendarErrorEnvelope,
} from "@/lib/contracts/calendar";
import { CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS } from "@/lib/contracts/calendar";

export function calendarError(
  code: CalendarErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): CalendarErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function calendarValidationError(
  fields: Record<string, string[]>,
): CalendarErrorEnvelope {
  return calendarError("VALIDATION_ERROR", "calendar.errors.validation", {
    fields,
  });
}

export function calendarForbiddenFieldsError(): CalendarErrorEnvelope {
  return calendarError("FORBIDDEN_FIELDS", "calendar.errors.forbiddenFields");
}

export function calendarInternalError(): CalendarErrorEnvelope {
  return calendarError("INTERNAL_ERROR", "calendar.errors.internal");
}

export function calendarUnauthenticatedError(): CalendarErrorEnvelope {
  return calendarError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function calendarForbiddenError(): CalendarErrorEnvelope {
  return calendarError("FORBIDDEN", "auth.errors.forbidden");
}

export function calendarNotFoundError(): CalendarErrorEnvelope {
  return calendarError(
    "NOT_FOUND",
    CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.notFound,
  );
}

export function calendarNotApprovedError(): CalendarErrorEnvelope {
  return calendarError(
    "NOT_APPROVED",
    CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.notApproved,
  );
}

export function calendarSlotNotReadyError(): CalendarErrorEnvelope {
  return calendarError(
    "SLOT_NOT_READY",
    CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.slotNotReady,
  );
}

export function calendarRateLimitedError(): CalendarErrorEnvelope {
  return calendarError(
    "RATE_LIMITED",
    CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.rateLimited,
  );
}

export function calendarInvalidIgUrlError(
  fields: Record<string, string[]>,
): CalendarErrorEnvelope {
  return calendarError(
    "VALIDATION_ERROR",
    CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.invalidIgUrl,
    { fields },
  );
}
