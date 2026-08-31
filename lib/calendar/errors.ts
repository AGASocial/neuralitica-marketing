import type { CalendarErrorCode } from "@/lib/contracts/calendar";

export function calendarError(
  code: CalendarErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): { ok: false; error: { code: CalendarErrorCode; messageKey: string; fields?: Record<string, string[]> } } {
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
): { ok: false; error: { code: "VALIDATION_ERROR"; messageKey: string; fields: Record<string, string[]> } } {
  return calendarError("VALIDATION_ERROR", "calendar.errors.validation", { fields });
}

export function calendarForbiddenFieldsError(): {
  ok: false;
  error: { code: "FORBIDDEN_FIELDS"; messageKey: string };
} {
  return calendarError("FORBIDDEN_FIELDS", "calendar.errors.forbiddenFields");
}

export function calendarInternalError(): {
  ok: false;
  error: { code: "INTERNAL_ERROR"; messageKey: string };
} {
  return calendarError("INTERNAL_ERROR", "calendar.errors.internal");
}

export function calendarUnauthenticatedError(): {
  ok: false;
  error: { code: "UNAUTHENTICATED"; messageKey: string };
} {
  return calendarError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function calendarForbiddenError(): {
  ok: false;
  error: { code: "FORBIDDEN"; messageKey: string };
} {
  return calendarError("FORBIDDEN", "auth.errors.forbidden");
}
