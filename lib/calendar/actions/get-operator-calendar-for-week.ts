"use server";

import {
  findForbiddenCalendarKeys,
  getOperatorCalendarForWeekInputSchema,
  type GetOperatorCalendarForWeekResult,
} from "@/lib/contracts/calendar";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  calendarForbiddenError,
  calendarForbiddenFieldsError,
  calendarInternalError,
  calendarUnauthenticatedError,
  calendarValidationError,
} from "@/lib/calendar/errors";
import { getOperatorCalendarForWeekCore } from "@/lib/calendar/get-operator-calendar-for-week";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GetOperatorCalendarForWeekResult {
  if (error.status === 401) {
    return calendarUnauthenticatedError();
  }
  return calendarForbiddenError();
}

/**
 * Operator weekly calendar aggregate (US-12.1).
 * Frontend consumer: `/operator/calendar` — initial load + week picker refresh.
 */
export async function getOperatorCalendarForWeek(
  rawInput: unknown,
): Promise<GetOperatorCalendarForWeekResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenCalendarKeys(rawInput).length > 0) {
    return calendarForbiddenFieldsError();
  }

  const parsed = getOperatorCalendarForWeekInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return calendarValidationError(zodInterviewErrorToFieldErrors(parsed.error));
  }

  try {
    return await getOperatorCalendarForWeekCore(parsed.data.weekStart);
  } catch {
    return calendarInternalError();
  }
}
