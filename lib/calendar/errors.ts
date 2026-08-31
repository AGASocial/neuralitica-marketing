import type {
  CalendarErrorCode,
  CalendarErrorEnvelope,
} from "@/lib/contracts/calendar";

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
